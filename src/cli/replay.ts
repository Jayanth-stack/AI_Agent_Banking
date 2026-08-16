import { randomUUID } from "node:crypto";
import { mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { ArtifactStore } from "../artifact/store.js";
import { ControlPlane } from "../escalation/control.js";
import { handoffToHuman } from "../escalation/handoff.js";
import { RunLog } from "../evidence/logger.js";
import { replay } from "../replay/executor.js";
import { printResult } from "../replay/result.js";
import { PolicyConfig } from "../safety/policy.js";
import { openBrowser } from "../surface/browser.js";
import { arg, has, loadDotEnv, parseParams } from "./args.js";
import { ensureTarget } from "./ensure-target.js";

loadDotEnv();

const artifactRef = arg("--artifact") ?? arg("--id");
if (!artifactRef) {
  console.error("usage: npm run replay -- --artifact <path|id> --params memberId=12345");
  process.exit(1);
}

const params = parseParams(arg("--params") ?? arg("--param"));
const port = Number(process.env.TARGET_PORT ?? 3847);
const operatorPort = Number(process.env.OPERATOR_PORT ?? 3848);
const headed = has("--headed");
const forceEscalate = has("--force-escalate");
const expire = has("--expire");
const autoResumeMs = has("--auto-resume") ? Number(arg("--auto-resume-ms", "1500")) : undefined;

const cap = await new ArtifactStore().load(artifactRef);
const target = await ensureTarget(port);
const startUrl = expire ? `${target.url}/?expire=1` : target.url;

const runId = `replay-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}`;
const log = new RunLog(runId, "replay");
await log.init({ artifact: cap.id, params, expire, forceEscalate });
const control = new ControlPlane(log.dir);
await control.init();

const policy = PolicyConfig.parse({
  allowedHosts: cap.policy.allowedHosts,
  allowedActions: cap.policy.allowedActions,
  allowIrreversibleUnattended: cap.policy.allowIrreversibleUnattended,
});

const surface = await openBrowser(startUrl, { headed: headed || forceEscalate });
try {
  if (forceEscalate) {
    await handoffToHuman({
      surface,
      control,
      log,
      operatorPort,
      autoResumeMs: autoResumeMs ?? 2000,
      request: {
        runId,
        capabilityId: cap.id,
        reason: "Forced escalation (demo): automation paused on the live session",
        uri: startUrl,
      },
    });
  }

  const result = await replay({
    capability: cap,
    params,
    surface,
    log,
    policy,
    control,
    unattended: !has("--attended"),
    onEscalate: async (reason, step) =>
      handoffToHuman({
        surface,
        control,
        log,
        operatorPort,
        autoResumeMs,
        request: {
          runId,
          capabilityId: cap.id,
          stepId: step?.id,
          stepDescription: step?.description,
          reason,
        },
      }),
  });
  await log.writeJson("result.json", result);

  const evidenceDir = path.join("evidence", runId);
  await mkdir(evidenceDir, { recursive: true });
  await cp(log.dir, evidenceDir, { recursive: true });

  printResult(result);
  console.error(`evidence: ${evidenceDir}`);
  if (result.status === "failed") process.exitCode = 2;
} finally {
  await surface.dispose();
  target.stop?.();
}
