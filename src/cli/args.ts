import { readFileSync } from "node:fs";

export function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0) {
    const parts: string[] = [];
    for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith("--"); j++) {
      parts.push(process.argv[j]);
    }
    if (parts.length) return parts.join(" ");
  }
  const pref = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (pref) return pref.slice(flag.length + 1);
  return fallback;
}

export function has(flag: string): boolean {
  return process.argv.includes(flag);
}

export function parseParams(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [k, ...rest] = part.split("=");
    if (k && rest.length) out[k.trim()] = rest.join("=").trim();
  }
  return out;
}

export function loadDotEnv(): void {
  try {
    const text = readFileSync(".env", "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env
  }
}
