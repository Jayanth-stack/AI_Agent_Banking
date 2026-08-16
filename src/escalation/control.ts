import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HumanAction } from "../surface/types.js";

export type Owner = "automation" | "human";

export type InterventionRequest = {
  runId: string;
  capabilityId?: string;
  goal?: string;
  stepId?: string;
  stepDescription?: string;
  reason: string;
  uri?: string;
  snapshotExcerpt?: string;
  screenshotPath?: string;
  createdAt: string;
};

export type ResumeSignal = {
  resolution: "resume" | "complete" | "abort";
  note?: string;
  at: string;
};

export class ControlPlane {
  constructor(private readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.setOwner("automation");
  }

  async setOwner(owner: Owner): Promise<void> {
    await writeFile(path.join(this.dir, "control.json"), JSON.stringify({ owner, at: new Date().toISOString() }, null, 2));
  }

  async owner(): Promise<Owner> {
    try {
      const raw = JSON.parse(await readFile(path.join(this.dir, "control.json"), "utf8")) as { owner: Owner };
      return raw.owner;
    } catch {
      return "automation";
    }
  }

  async raise(req: InterventionRequest): Promise<void> {
    await this.setOwner("human");
    await writeFile(path.join(this.dir, "intervention.json"), JSON.stringify(req, null, 2));
  }

  async waitForResume(timeoutMs = 15 * 60_000): Promise<ResumeSignal> {
    const file = path.join(this.dir, "resume.json");
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        return JSON.parse(await readFile(file, "utf8")) as ResumeSignal;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    throw new Error("Timed out waiting for human resume");
  }

  async signalResume(resolution: ResumeSignal["resolution"], note?: string): Promise<void> {
    const sig: ResumeSignal = { resolution, note, at: new Date().toISOString() };
    await writeFile(path.join(this.dir, "resume.json"), JSON.stringify(sig, null, 2));
    if (resolution === "resume") await this.setOwner("automation");
  }

  async recordHuman(actions: HumanAction[]): Promise<void> {
    await writeFile(path.join(this.dir, "human-actions.json"), JSON.stringify(actions, null, 2));
  }
}
