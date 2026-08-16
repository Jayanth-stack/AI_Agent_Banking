import { z } from "zod";
import type { ActionKind, RiskClass } from "../artifact/schema.js";

export const PolicyConfig = z.object({
  allowedHosts: z.array(z.string()).default(["127.0.0.1", "localhost"]),
  allowedActions: z
    .array(z.string())
    .default([
      "navigate",
      "click",
      "fill",
      "press",
      "extract",
      "dismiss",
      "wait",
      "human",
    ]),
  blockedPathPatterns: z.array(z.string()).default(["/admin/delete", "/wire", "/ach/send"]),
  allowIrreversibleUnattended: z.boolean().default(false),
  maxSteps: z.number().int().positive().default(20),
  timeoutMs: z.number().int().positive().default(180_000),
});
export type PolicyConfig = z.infer<typeof PolicyConfig>;

export type PolicyDecision =
  | { ok: true }
  | { ok: false; code: "host" | "action" | "path" | "irreversible"; reason: string };

const IRREVERSIBLE_HINTS =
  /\b(confirm|submit|open account|create|post|transfer|wire|delete|close account|disburse)\b/i;

export function inferRisk(action: ActionKind, description: string): RiskClass {
  if (action === "extract" || action === "wait") return "safe";
  if (IRREVERSIBLE_HINTS.test(description)) return "irreversible";
  if (action === "fill" || action === "navigate") return "reversible";
  return "safe";
}

export function checkNavigation(url: string, policy: PolicyConfig): PolicyDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: "host", reason: `Unparseable URL: ${url}` };
  }
  const host = parsed.hostname;
  if (!policy.allowedHosts.some((h) => h === host || host.endsWith(`.${h}`))) {
    return {
      ok: false,
      code: "host",
      reason: `Host ${host} is not on the allowlist (${policy.allowedHosts.join(", ")})`,
    };
  }
  for (const pat of policy.blockedPathPatterns) {
    if (parsed.pathname.includes(pat)) {
      return { ok: false, code: "path", reason: `Path ${parsed.pathname} matches blocked pattern ${pat}` };
    }
  }
  return { ok: true };
}

export function checkAction(
  action: ActionKind,
  risk: RiskClass,
  policy: PolicyConfig,
  opts: { unattended: boolean },
): PolicyDecision {
  if (!policy.allowedActions.includes(action)) {
    return { ok: false, code: "action", reason: `Action ${action} is not allowed` };
  }
  if (risk === "irreversible" && opts.unattended && !policy.allowIrreversibleUnattended) {
    return {
      ok: false,
      code: "irreversible",
      reason: "Irreversible action requires a human in the loop (unattended replay denied)",
    };
  }
  return { ok: true };
}
