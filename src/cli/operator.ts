import { ControlPlane } from "../escalation/control.js";
import { startOperatorServer } from "../escalation/operator.js";
import { arg, loadDotEnv } from "./args.js";

loadDotEnv();

const cmd = process.argv[2];
const run = arg("--run");
const port = Number(process.env.OPERATOR_PORT ?? 3848);

if (cmd === "resume" || cmd === "complete" || cmd === "abort") {
  if (!run) {
    console.error("usage: npm run operator -- resume --run <runId>");
    process.exit(1);
  }
  const plane = new ControlPlane(`.runs/${run}`);
  await plane.signalResume(cmd, arg("--note"));
  console.log(`signaled ${cmd} for ${run}`);
  process.exit(0);
}

const server = await startOperatorServer(".runs", port);
console.log(`Operator UI: ${server.url}${run ? `?run=${run}` : ""}`);
console.log("Ctrl+C to stop");
