import type { ISurface, HumanAction } from "../surface/types.js";
import { ControlPlane, type InterventionRequest } from "./control.js";
import { startOperatorServer } from "./operator.js";
import { RunLog } from "../evidence/logger.js";

export async function handoffToHuman(opts: {
  surface: ISurface;
  control: ControlPlane;
  log: RunLog;
  request: Omit<InterventionRequest, "createdAt">;
  operatorPort: number;
  autoResumeMs?: number;
}): Promise<"resume" | "complete" | "abort"> {
  const shot = await opts.surface.screenshot();
  const screenshotPath = await opts.log.saveScreenshot(shot, "intervention");
  const req: InterventionRequest = {
    ...opts.request,
    screenshotPath,
    createdAt: new Date().toISOString(),
  };
  await opts.control.raise(req);
  await opts.log.event("escalate", { reason: req.reason, stepId: req.stepId });

  const humanActions: HumanAction[] = [];
  await opts.surface.startHumanRecording((e) => {
    humanActions.push(e);
  });
  await opts.surface.bringToFront();

  const server = await startOperatorServer(".runs", opts.operatorPort);
  const url = `${server.url}?run=${encodeURIComponent(opts.log.runId)}`;
  console.error(`\n[HITL] Intervention required: ${req.reason}`);
  console.error(`[HITL] Operator UI: ${url}`);
  console.error(`[HITL] Same live browser session is paused. Take control, then Resume.\n`);

  if (opts.autoResumeMs != null) {
    setTimeout(() => {
      opts.control.signalResume("resume", "auto-resume (demo/test)").catch(() => undefined);
    }, opts.autoResumeMs);
  }

  try {
    const signal = await opts.control.waitForResume();
    await opts.control.recordHuman(humanActions);
    await opts.log.event("handoff_back", { resolution: signal.resolution, humanActions: humanActions.length });
    await opts.surface.stopHumanRecording();
    if (signal.resolution === "resume") await opts.control.setOwner("automation");
    return signal.resolution;
  } finally {
    server.close();
  }
}
