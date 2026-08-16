import { createTargetApp } from "../target/server.js";

export async function ensureTarget(port: number): Promise<{ stop?: () => void; url: string }> {
  const url = `http://127.0.0.1:${port}`;
  try {
    const r = await fetch(`${url}/health`);
    if (r.ok) return { url };
  } catch {
    // start one
  }
  const app = createTargetApp();
  const server = app.listen(port, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  return { url, stop: () => server.close() };
}
