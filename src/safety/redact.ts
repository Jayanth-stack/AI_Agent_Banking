import type { PiiClass } from "../artifact/schema.js";

const SECRET_KEYS = /password|passwd|secret|token|ssn|pan|cvv|pin|otp|authorization/i;

const PATTERNS: Array<{ re: RegExp; replace: string }> = [
  { re: /\b\d{3}-\d{2}-\d{4}\b/g, replace: "[REDACTED_SSN]" },
  { re: /\b(?:\d[ -]*?){13,19}\b/g, replace: "[REDACTED_PAN]" },
  { re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replace: "[REDACTED_EMAIL]" },
  { re: /\b(?:sk|pk|rk)-[A-Za-z0-9]{16,}\b/g, replace: "[REDACTED_KEY]" },
  { re: /\bBearer\s+[A-Za-z0-9._\-]+/gi, replace: "Bearer [REDACTED]" },
];

export function redactText(input: string): string {
  let out = input;
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, replace);
  }
  return out;
}

export function maskIdentifier(value: string): string {
  if (value.length <= 2) return "**";
  if (value.length <= 4) return `*${value.slice(-1)}`;
  return `${value.slice(0, 1)}***${value.slice(-2)}`;
}

export function redactByPii(value: string, pii: PiiClass): string {
  switch (pii) {
    case "secret":
      return "[REDACTED]";
    case "name":
      return "[REDACTED_NAME]";
    case "financial":
      return "[REDACTED_AMOUNT]";
    case "identifier":
      return maskIdentifier(value);
    default:
      return redactText(value);
  }
}

export function looksSecret(key: string, value?: string): boolean {
  if (SECRET_KEYS.test(key)) return true;
  if (value && /password|secret|token/i.test(value) && value.length < 40) return true;
  return false;
}

export function redactRecord(
  rec: Record<string, unknown>,
  piiByKey: Record<string, PiiClass> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v == null) {
      out[k] = v;
      continue;
    }
    if (looksSecret(k, typeof v === "string" ? v : undefined)) {
      out[k] = "[REDACTED]";
      continue;
    }
    if (typeof v === "string") {
      out[k] = piiByKey[k] ? redactByPii(v, piiByKey[k]) : redactText(v);
      continue;
    }
    if (typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactRecord(v as Record<string, unknown>, piiByKey);
      continue;
    }
    out[k] = v;
  }
  return out;
}
