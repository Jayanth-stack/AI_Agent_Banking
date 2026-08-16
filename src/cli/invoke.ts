import { spawn } from "node:child_process";
import { ArtifactStore } from "../artifact/store.js";
import { arg, loadDotEnv, parseParams } from "./args.js";

loadDotEnv();

/**
 * Thin agent-facing catalog. An upstream agent discovers capabilities
 * and invokes one by id with typed args — this is the production seam.
 */
const store = new ArtifactStore();
const cmd = process.argv[2];

if (cmd === "list" || !cmd) {
  const caps = await store.list();
  const catalog = caps.map((c) => ({
    id: c.id,
    version: c.version,
    name: c.name,
    description: c.description,
    params: c.contract.params,
    outputs: c.contract.outputs,
  }));
  console.log(JSON.stringify({ capabilities: catalog }, null, 2));
  process.exit(0);
}

if (cmd === "call") {
  const id = arg("--id") ?? process.argv[3];
  if (!id) {
    console.error("usage: npm run invoke -- call --id <capability> --params memberId=12345");
    process.exit(1);
  }
  const cap = await store.load(id);
  const params = parseParams(arg("--params"));
  for (const p of cap.contract.params.filter((x) => x.required)) {
    if (params[p.name] == null) {
      console.error(`missing required param ${p.name}`);
      process.exit(1);
    }
  }
  const child = spawn(
    "npm",
    [
      "run",
      "replay",
      "--",
      "--artifact",
      `${cap.id}.v${cap.version}.json`,
      "--params",
      Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join(","),
    ],
    { stdio: "inherit" },
  );
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  console.error("usage: npm run invoke -- [list|call]");
  process.exit(1);
}
