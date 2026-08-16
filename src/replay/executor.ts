import type { Capability, Step, ValueRef } from "../artifact/schema.js";
import { checkAction, checkNavigation, type PolicyConfig } from "../safety/policy.js";
import { redactByPii } from "../safety/redact.js";
import type { ISurface, ProposedAction } from "../surface/types.js";
import { ControlPlane } from "../escalation/control.js";
import { RunLog } from "../evidence/logger.js";
import { checkpointHolds, classify } from "./outcomes.js";
import type { ReplayResult } from "./result.js";

export type ReplayOpts = {
  capability: Capability;
  params: Record<string, string>;
  surface: ISurface;
  log: RunLog;
  policy: PolicyConfig;
  control: ControlPlane;
  unattended: boolean;
  onEscalate?: (reason: string, step?: Step) => Promise<"resume" | "complete" | "abort">;
};

function resolveValue(ref: ValueRef | undefined, params: Record<string, string>): string {
  if (!ref) return "";
  if (ref.kind === "empty") return "";
  if (ref.kind === "literal") return ref.value;
  const v = params[ref.name];
  if (v == null) throw new Error(`Missing param ${ref.name}`);
  return v;
}

function stepToAction(step: Step, params: Record<string, string>): ProposedAction {
  return {
    action: step.action,
    description: step.description,
    risk: step.risk,
    strategies: step.target?.strategies,
    value: resolveValue(step.value, params),
    press: step.press,
    extractAs: step.extractAs,
    navigateTo: step.navigateTo,
    waitMs: step.waitMs,
  };
}

export async function replay(opts: ReplayOpts): Promise<ReplayResult> {
  const { capability: cap, params, surface, log, policy, unattended } = opts;
  const outputs: Record<string, string> = {};
  let stepsCompleted = 0;

  const fail = (step: Step | undefined, expected: string, observed: string, debug?: string): ReplayResult => ({
    status: "failed",
    capabilityId: cap.id,
    capabilityVersion: cap.version,
    outputs,
    error: { stepId: step?.id, expected, observed, debug },
    stepsCompleted,
    runId: log.runId,
  });

  const piiMap = Object.fromEntries(cap.contract.params.map((p) => [p.name, p.pii]));

  for (const step of cap.steps) {
    let perception = await surface.observe();
    await log.event("observe", { stepId: step.id, uri: perception.uri, title: perception.title });

    // Recoverable / business / hard — before acting.
    for (let recoveries = 0; recoveries < 3; recoveries++) {
      const hit = classify(perception, cap.outcomes);
      if (!hit.hit) break;
      const d = hit.detector;
      await log.event("outcome", { id: d.id, kind: d.kind, message: d.message });
      if (d.kind === "business") {
        return {
          status: "business_outcome",
          capabilityId: cap.id,
          capabilityVersion: cap.version,
          outputs,
          outcome: { id: d.id, message: d.message },
          stepsCompleted,
          runId: log.runId,
        };
      }
      if (d.kind === "hard" || d.recover?.type === "fail") {
        const shot = await surface.screenshot();
        const shotPath = await log.saveScreenshot(shot, `hard-${d.id}`);
        return fail(step, "step to proceed", d.message, shotPath);
      }
      if (d.kind === "recoverable" && d.recover?.type === "dismiss") {
        const dismissed = await surface.act({
          action: "dismiss",
          description: `dismiss ${d.id}`,
          risk: "safe",
          strategies: d.recover.target.strategies,
        });
        await log.event("recover", { id: d.id, ok: dismissed.ok, error: dismissed.error });
        if (!dismissed.ok) return fail(step, `dismiss ${d.id}`, dismissed.error ?? "dismiss failed");
        perception = await surface.observe();
        continue;
      }
      if (d.kind === "recoverable" && d.recover?.type === "wait_retry") {
        await surface.act({ action: "wait", description: "retry wait", risk: "safe", waitMs: d.recover.ms });
        perception = await surface.observe();
        continue;
      }
      break;
    }

    if (step.action === "navigate" && step.navigateTo) {
      const nav = checkNavigation(step.navigateTo, policy);
      if (!nav.ok) return fail(step, "allowed navigation", nav.reason);
    }

    const gate = checkAction(step.action, step.risk, policy, { unattended });
    if (!gate.ok && gate.code === "irreversible") {
      await log.event("policy", { stepId: step.id, reason: gate.reason });
      if (!opts.onEscalate) return fail(step, "human confirmation", gate.reason);
      const resolution = await opts.onEscalate(gate.reason, step);
      if (resolution === "abort") {
        return { status: "escalated", capabilityId: cap.id, capabilityVersion: cap.version, outputs, stepsCompleted, runId: log.runId, error: { stepId: step.id, expected: "resume", observed: "aborted" } };
      }
      if (resolution === "complete") {
        return { status: "success", capabilityId: cap.id, capabilityVersion: cap.version, outputs, stepsCompleted, runId: log.runId };
      }
      // resume: human did the irreversible step; skip acting it
      stepsCompleted += 1;
      continue;
    }
    if (!gate.ok) return fail(step, "policy allow", gate.reason);

    if (step.action === "human") {
      if (!opts.onEscalate) return fail(step, "human step", "no escalation handler");
      const resolution = await opts.onEscalate(step.description, step);
      if (resolution === "abort") {
        return { status: "escalated", capabilityId: cap.id, capabilityVersion: cap.version, outputs, stepsCompleted, runId: log.runId };
      }
      stepsCompleted += 1;
      continue;
    }

    const action = stepToAction(step, params);
    const result = await surface.act(action);
    await log.event("act", {
      stepId: step.id,
      action: step.action,
      ok: result.ok,
      error: result.error,
      matched: result.matchedStrategy,
      value: step.value?.kind === "param" ? redactByPii(action.value ?? "", piiMap[step.value.name] ?? "none") : undefined,
    });

    if (!result.ok && step.action === "dismiss") {
      await log.event("skip", { stepId: step.id, reason: "dismiss target absent" });
      stepsCompleted += 1;
      continue;
    }
    if (!result.ok) {
      const shot = await surface.screenshot();
      const shotPath = await log.saveScreenshot(shot, `fail-${step.id}`);
      return fail(step, step.description, result.error ?? "action failed", shotPath);
    }

    if (result.extracted) Object.assign(outputs, result.extracted);

    const after = await surface.observe();
    if (step.checkpoint && !checkpointHolds(after, step.checkpoint.anyOf)) {
      // Maybe a business outcome appeared as a result of the action.
      const hit = classify(after, cap.outcomes);
      if (hit.hit && hit.detector.kind === "business") {
        return {
          status: "business_outcome",
          capabilityId: cap.id,
          capabilityVersion: cap.version,
          outputs,
          outcome: { id: hit.detector.id, message: hit.detector.message },
          stepsCompleted,
          runId: log.runId,
        };
      }
      const shot = await surface.screenshot();
      const shotPath = await log.saveScreenshot(shot, `checkpoint-${step.id}`);
      return fail(step, step.checkpoint.description, `uri=${after.uri} title=${after.title}`, shotPath);
    }

    stepsCompleted += 1;
  }

  const missing = cap.success.requiredOutputs.filter((k) => !outputs[k]);
  if (missing.length) {
    return fail(undefined, `outputs ${missing.join(",")}`, "missing required outputs");
  }

  return {
    status: "success",
    capabilityId: cap.id,
    capabilityVersion: cap.version,
    outputs,
    stepsCompleted,
    runId: log.runId,
  };
}
