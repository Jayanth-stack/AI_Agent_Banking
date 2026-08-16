import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ControlPlane, type ResumeSignal } from "./control.js";

const PAGE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Operator — intervention</title>
  <style>
    body { font: 14px/1.4 system-ui, sans-serif; max-width: 820px; margin: 24px auto; color: #111; }
    pre { background: #f4f4f1; padding: 12px; overflow: auto; }
    button { margin-right: 8px; padding: 6px 12px; }
    img { max-width: 100%; border: 1px solid #ccc; }
    .reason { background: #fff3cd; padding: 10px; border: 1px solid #e6d089; }
  </style>
</head>
<body>
  <h1>Human intervention</h1>
  <p>Automation is paused on the <b>same live session</b>. Use the Chromium window to act, then resume.</p>
  <div id="box">Loading…</div>
  <p>
    <button id="resume">Resume automation</button>
    <button id="complete">Mark complete</button>
    <button id="abort">Abort</button>
  </p>
  <p><label>Note <input id="note" size="60"></label></p>
  <script>
    const runId = new URLSearchParams(location.search).get("run");
    async function load() {
      const r = await fetch("/api/intervention?run=" + encodeURIComponent(runId));
      const j = await r.json();
      document.getElementById("box").innerHTML =
        '<div class="reason"><b>' + (j.reason || "stuck") + '</b></div>' +
        '<p>goal: ' + (j.goal || "") + '<br>step: ' + (j.stepId || "") + ' ' + (j.stepDescription || "") +
        '<br>uri: ' + (j.uri || "") + '</p>' +
        (j.screenshotPath ? '<p><img src="/api/screenshot?run=' + encodeURIComponent(runId) + '"></p>' : "") +
        '<pre>' + (j.snapshotExcerpt || "") + '</pre>';
    }
    async function signal(resolution) {
      await fetch("/api/resume?run=" + encodeURIComponent(runId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution, note: document.getElementById("note").value })
      });
      document.getElementById("box").innerHTML = "<p>Signaled <b>" + resolution + "</b>. You can close this tab.</p>";
    }
    document.getElementById("resume").onclick = () => signal("resume");
    document.getElementById("complete").onclick = () => signal("complete");
    document.getElementById("abort").onclick = () => signal("abort");
    load();
  </script>
</body>
</html>`;

export function startOperatorServer(runsRoot: string, port: number): Promise<{ url: string; close: () => void }> {
  const app = express();
  app.use(express.json());

  app.get("/operator", (_req, res) => {
    res.type("html").send(PAGE);
  });

  app.get("/api/intervention", async (req, res) => {
    const run = String(req.query.run ?? "");
    try {
      const raw = await readFile(path.join(runsRoot, run, "intervention.json"), "utf8");
      res.json(JSON.parse(raw));
    } catch {
      res.status(404).json({ error: "no intervention" });
    }
  });

  app.get("/api/screenshot", async (req, res) => {
    const run = String(req.query.run ?? "");
    try {
      const intervention = JSON.parse(
        await readFile(path.join(runsRoot, run, "intervention.json"), "utf8"),
      ) as { screenshotPath?: string };
      if (!intervention.screenshotPath) {
        res.status(404).end();
        return;
      }
      const buf = await readFile(intervention.screenshotPath);
      res.type("png").send(buf);
    } catch {
      res.status(404).end();
    }
  });

  app.post("/api/resume", async (req, res) => {
    const run = String(req.query.run ?? "");
    const plane = new ControlPlane(path.join(runsRoot, run));
    const resolution = (req.body?.resolution ?? "resume") as ResumeSignal["resolution"];
    await plane.signalResume(resolution, req.body?.note);
    res.json({ ok: true });
  });

  return new Promise((resolve) => {
    const server = app.listen(port, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${port}/operator`,
        close: () => server.close(),
      });
    });
  });
}
