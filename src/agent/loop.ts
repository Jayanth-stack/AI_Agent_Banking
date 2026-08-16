import { createHash } from "node:crypto";
import type { Step, TypedField } from "../artifact/schema.js";
import { buildCapability, inferParamsFromGoal, slugFromGoal } from "../artifact/builder.js";
import { checkAction, checkNavigation, inferRisk, type PolicyConfig } from "../safety/policy.js";
import { strategiesFromModel } from "../surface/locators.js";
import type { ISurface } from "../surface/types.js";
import { classify } from "../replay/outcomes.js";
import { DEFAULT_OUTCOMES } from "../artifact/builder.js";
import { decide } from "./llm.js";
import { RunLog } from "../evidence/logger.js";
import { handoffToHuman } from "../escalation/handoff.js";
import { ControlPlane } from "../escalation/control.js";

export type DiscoverOpts = {
  goal: string;
  entryUrl: string;
  surface: ISurface;
  log: RunLog;
  policy: PolicyConfig;
  control: ControlPlane;
  operatorPort: number;
  autoResumeMs?: number;
};

function hashSnap(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 12);
}

export async function discover(opts: DiscoverOpts) {
  const inferred = inferParamsFromGoal(opts.goal);
  const params = inferred.values;
  const steps: Step[] = [];
  const outputsSeen: Record<string, string> = {};
  let lastResult = "";
  const recentHashes: string[] = [];

  const entryCheck = checkNavigation(opts.entryUrl, opts.policy);
  if (!entryCheck.ok) throw new Error(entryCheck.reason);

  for (let i = 1; i <= opts.policy.maxSteps; i++) {
    const perception = await opts.surface.observe();
    await opts.log.event("observe", { step: i, uri: perception.uri, title: perception.title });

    const classified = classify(perception, DEFAULT_OUTCOMES);
    if (classified.hit && classified.detector.kind === "recoverable" && classified.detector.recover?.type === "dismiss") {
      const dismissed = await opts.surface.act({
        action: "dismiss",
        description: "dismiss interstitial",
        risk: "safe",
        strategies: classified.detector.recover.target.strategies,
      });
      await opts.log.event("recover", { id: classified.detector.id, ok: dismissed.ok });
      steps.push({
        id: `s${steps.length + 1}`,
        action: "dismiss",
        description: "Dismiss system notice interstitial",
        risk: "safe",
        target: classified.detector.recover.target,
      });
      lastResult = dismissed.ok ? "dismissed notice" : `dismiss failed: ${dismissed.error}`;
      continue;
    }

    const h = hashSnap(perception.snapshot);
    recentHashes.push(h);
    if (recentHashes.slice(-3).length === 3 && new Set(recentHashes.slice(-3)).size === 1) {
      const resolution = await handoffToHuman({
        surface: opts.surface,
        control: opts.control,
        log: opts.log,
        operatorPort: opts.operatorPort,
        autoResumeMs: opts.autoResumeMs,
        request: {
          runId: opts.log.runId,
          goal: opts.goal,
          reason: "Stuck: accessibility tree unchanged for 3 steps",
          uri: perception.uri,
          snapshotExcerpt: perception.snapshot.slice(0, 1200),
        },
      });
      if (resolution === "abort") throw new Error("Human aborted discovery");
      if (resolution === "complete") break;
      lastResult = "human intervened; continue";
      recentHashes.length = 0;
      continue;
    }

    const decision = await decide({
      goal: opts.goal,
      params,
      snapshot: perception.snapshot,
      uri: perception.uri,
      title: perception.title,
      lastResult,
      step: i,
    });
    await opts.log.event("decide", { reasoning: decision.reasoning, action: decision.action, done: decision.done, escalate: decision.escalate });

    if (decision.escalate) {
      const resolution = await handoffToHuman({
        surface: opts.surface,
        control: opts.control,
        log: opts.log,
        operatorPort: opts.operatorPort,
        autoResumeMs: opts.autoResumeMs,
        request: {
          runId: opts.log.runId,
          goal: opts.goal,
          reason: decision.escalateReason ?? decision.reasoning,
          uri: perception.uri,
          snapshotExcerpt: perception.snapshot.slice(0, 1200),
        },
      });
      if (resolution === "abort") throw new Error("Human aborted discovery");
      if (resolution === "complete") break;
      lastResult = "human intervened; continue";
      continue;
    }

    if (decision.done) {
      if (decision.action === "extract" && decision.target) {
        const strategies = strategiesFromModel(decision.target);
        const extracted = await opts.surface.act({
          action: "extract",
          description: decision.description ?? "extract",
          risk: "safe",
          strategies,
          extractAs: decision.extractAs ?? "value",
        });
        if (extracted.extracted) Object.assign(outputsSeen, extracted.extracted);
        steps.push({
          id: `s${steps.length + 1}`,
          action: "extract",
          description: decision.description ?? `Extract ${decision.extractAs ?? "value"}`,
          risk: "safe",
          target: { strategies, notes: "role/row first; recorded from discovery" },
          extractAs: decision.extractAs ?? "value",
        });
      }
      break;
    }

    if (!decision.action) {
      lastResult = "model returned no action";
      continue;
    }

    if (decision.navigateTo) {
      const nav = checkNavigation(decision.navigateTo, opts.policy);
      if (!nav.ok) throw new Error(nav.reason);
    }

    const description = decision.description ?? `${decision.action} ${decision.target?.name ?? decision.target?.text ?? ""}`.trim();
    const risk = inferRisk(decision.action, description);
    const gate = checkAction(decision.action, risk, opts.policy, { unattended: true });
    if (!gate.ok && gate.code === "irreversible") {
      const resolution = await handoffToHuman({
        surface: opts.surface,
        control: opts.control,
        log: opts.log,
        operatorPort: opts.operatorPort,
        autoResumeMs: opts.autoResumeMs,
        request: {
          runId: opts.log.runId,
          goal: opts.goal,
          reason: gate.reason,
          uri: perception.uri,
          snapshotExcerpt: perception.snapshot.slice(0, 800),
        },
      });
      steps.push({
        id: `s${steps.length + 1}`,
        action: "human",
        description: `Human confirmed: ${description}`,
        risk: "irreversible",
      });
      if (resolution === "abort") throw new Error("Human aborted discovery");
      lastResult = `human ${resolution}`;
      continue;
    }
    if (!gate.ok) throw new Error(gate.reason);

    const strategies = decision.target ? strategiesFromModel(decision.target) : undefined;
    const value = decision.paramRef ? params[decision.paramRef] : decision.value;
    const result = await opts.surface.act({
      action: decision.action,
      description,
      risk,
      strategies,
      value,
      press: decision.press,
      extractAs: decision.extractAs,
      navigateTo: decision.navigateTo,
    });
    await opts.log.event("act", { action: decision.action, ok: result.ok, error: result.error });
    lastResult = result.ok ? "ok" : result.error ?? "failed";

    if (!result.ok) {
      const shot = await opts.surface.screenshot();
      await opts.log.saveScreenshot(shot, `discover-fail-${i}`);
      continue;
    }

    if (result.extracted) Object.assign(outputsSeen, result.extracted);

    const valueRef = decision.paramRef
      ? ({ kind: "param" as const, name: decision.paramRef })
      : decision.value
        ? ({ kind: "literal" as const, value: decision.value, sensitive: false as const })
        : undefined;

    const step: Step = {
      id: `s${steps.length + 1}`,
      action: decision.action,
      description,
      risk,
      target: strategies ? { strategies } : undefined,
      value: decision.action === "fill" ? valueRef : undefined,
      extractAs: decision.extractAs,
      navigateTo: decision.navigateTo,
      press: decision.press,
    };

    if (decision.action === "click" || decision.action === "fill") {
      const after = await opts.surface.observe();
      step.checkpoint = {
        id: `cp-${step.id}`,
        description: `After ${description}`,
        anyOf: [
          { type: "url_includes", value: new URL(after.uri).pathname },
          { type: "title_includes", value: after.title.split("—")[0]?.trim() || after.title },
        ],
      };
    }

    steps.push(step);
  }

  if (!steps.length) throw new Error("Discovery produced no steps");

  const outputFields: TypedField[] = Object.keys(outputsSeen).map((name) => ({
    name,
    type: name.toLowerCase().includes("balance") ? "money" : "string",
    required: true,
    description: `Extracted ${name}`,
    pii: name.toLowerCase().includes("balance") ? "financial" : name.toLowerCase().includes("name") ? "name" : "none",
  }));

  const cap = buildCapability({
    id: slugFromGoal(opts.goal),
    name: opts.goal,
    description: `Recorded capability for: ${opts.goal}`,
    goal: opts.goal,
    entryUrl: opts.entryUrl,
    params: inferred.fields,
    outputs: outputFields,
    steps,
    allowedHosts: opts.policy.allowedHosts,
  });

  return { capability: cap, outputs: outputsSeen, params };
}
