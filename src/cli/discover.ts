import { randomUUID } from "node:crypto";
import { mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { discover } from "../agent/loop.js";
import { ArtifactStore } from "../artifact/store.js";
import { ControlPlane } from "../escalation/control.js";
import { RunLog } from "../evidence/logger.js";
import { PolicyConfig } from "../safety/policy.js";
import { openBrowser } from "../surface/browser.js";
import { arg, has, loadDotEnv } from "./args.js";
import { ensureTarget } from "./ensure-target.js";

loadDotEnv();

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required for discovery. Replay does not need a model.");
  process.exit(1);
}

const goal =
  arg("--goal") ??
  "look up member 12345 and read their current savings balance";
const port = Number(process.env.TARGET_PORT ?? 3847);
const operatorPort = Number(process.env.OPERATOR_PORT ?? 3848);
const headed = has("--headed");
const autoResumeMs = has("--auto-resume") ? Number(arg("--auto-resume-ms", "1500")) : undefined;

const target = await ensureTarget(port);
const runId = `discover-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}`;
const log = new RunLog(runId, "discover");
await log.init({ goal, entry: target.url });
const control = new ControlPlane(log.dir);
await control.init();

const policy = PolicyConfig.parse({
  allowedHosts: ["127.0.0.1", "localhost"],
  maxSteps: Number(arg("--max-steps", "16")),
});

const surface = await openBrowser(target.url, { headed });
try {
  const { capability, outputs, params } = await discover({
    goal,
    entryUrl: target.url,
    surface,
    log,
    policy,
    control,
    operatorPort,
    autoResumeMs,
  });
  const store = new ArtifactStore();
  const file = await store.save(capability);
  await log.writeJson("artifact.json", capability);
  await log.writeJson("result.json", { outputs, params, artifact: file });

  const evidenceDir = path.join("evidence", runId);
  await mkdir(evidenceDir, { recursive: true });
  await cp(log.dir, evidenceDir, { recursive: true });

  console.log(JSON.stringify({ ok: true, artifact: file, outputs, params, runId, evidence: evidenceDir }, null, 2));
} finally {
  await surface.dispose();
  target.stop?.();
}
