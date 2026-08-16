import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseCapability, type Capability } from "./schema.js";

export class ArtifactStore {
  constructor(private readonly dir = "capabilities") {}

  async save(cap: Capability): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, `${cap.id}.v${cap.version}.json`);
    await writeFile(file, JSON.stringify(cap, null, 2) + "\n", "utf8");
    return file;
  }

  async load(idOrPath: string): Promise<Capability> {
    const direct = idOrPath.endsWith(".json") ? idOrPath : path.join(this.dir, idOrPath);
    try {
      return parseCapability(JSON.parse(await readFile(direct, "utf8")));
    } catch {
      const files = await readdir(this.dir).catch(() => []);
      const match = files
        .filter((f) => f.startsWith(idOrPath) && f.endsWith(".json"))
        .sort()
        .at(-1);
      if (!match) throw new Error(`No capability matching ${idOrPath}`);
      return parseCapability(JSON.parse(await readFile(path.join(this.dir, match), "utf8")));
    }
  }

  async list(): Promise<Capability[]> {
    const files = await readdir(this.dir).catch(() => []);
    const caps: Capability[] = [];
    for (const f of files.filter((x) => x.endsWith(".json"))) {
      caps.push(parseCapability(JSON.parse(await readFile(path.join(this.dir, f), "utf8"))));
    }
    return caps;
  }
}
