import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { redactRecord, redactText } from "../safety/redact.js";

export type RunKind = "discover" | "replay" | "escalate";

export class RunLog {
  readonly dir: string;
  private seq = 0;

  constructor(
    readonly runId: string,
    readonly kind: RunKind,
    root = ".runs",
  ) {
    this.dir = path.join(root, runId);
  }

  async init(meta: Record<string, unknown>): Promise<void> {
    await mkdir(path.join(this.dir, "screenshots"), { recursive: true });
    await this.writeJson("meta.json", { runId: this.runId, kind: this.kind, ...meta });
    await writeFile(path.join(this.dir, "events.jsonl"), "", "utf8");
  }

  async event(type: string, payload: Record<string, unknown>): Promise<void> {
    this.seq += 1;
    const line = JSON.stringify({
      seq: this.seq,
      at: new Date().toISOString(),
      type,
      ...redactRecord(payload),
    });
    await appendFile(path.join(this.dir, "events.jsonl"), `${line}\n`, "utf8");
  }

  async writeJson(name: string, data: unknown): Promise<string> {
    const file = path.join(this.dir, name);
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    await writeFile(file, redactText(text), "utf8");
    return file;
  }

  async saveScreenshot(buf: Buffer, label: string): Promise<string> {
    const file = path.join(this.dir, "screenshots", `${String(this.seq).padStart(3, "0")}-${label}.png`);
    await writeFile(file, buf);
    return file;
  }
}
