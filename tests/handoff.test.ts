import { mkdir, readFile, rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ControlPlane } from "../src/escalation/control.js";

describe("control transfer", () => {
  it("raises an intervention and hands control back on resume", async () => {
    const dir = `.runs/hitl-unit-${Date.now()}`;
    await mkdir(dir, { recursive: true });
    const plane = new ControlPlane(dir);
    await plane.init();
    expect(await plane.owner()).toBe("automation");
    await plane.raise({
      runId: "x",
      reason: "stuck",
      createdAt: new Date().toISOString(),
    });
    expect(await plane.owner()).toBe("human");
    const waiting = plane.waitForResume(5_000);
    await plane.signalResume("resume", "operator done");
    const sig = await waiting;
    expect(sig.resolution).toBe("resume");
    expect(await plane.owner()).toBe("automation");
    const humanFile = JSON.parse(await readFile(`${dir}/intervention.json`, "utf8"));
    expect(humanFile.reason).toBe("stuck");
    await rm(dir, { recursive: true, force: true });
  });
});
