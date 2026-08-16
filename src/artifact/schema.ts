import { z } from "zod";

/**
 * Capability artifact — the agent-invocable contract.
 *
 * Design notes (defended in REPORT.md):
 * - Perception/action are surface-agnostic. Locators speak a11y (role+name),
 *   not CSS. That's the seam for desktop later.
 * - Concrete values never live in steps; they are param refs or literals
 *   marked non-sensitive. Discovery parameterizes anything that matched an input.
 * - Outcomes are first-class. "No such member" is not a failed locator.
 * - Multi-tenant: vendor + binding.base + tenantOverrides. One recording,
 *   many institutions.
 */

export const SCHEMA_VERSION = "1.0.0" as const;

export const SurfaceKind = z.enum(["web", "desktop"]);
export type SurfaceKind = z.infer<typeof SurfaceKind>;

export const RiskClass = z.enum(["safe", "reversible", "irreversible"]);
export type RiskClass = z.infer<typeof RiskClass>;

export const ParamType = z.enum([
  "string",
  "number",
  "money",
  "enum",
  "identifier",
]);
export type ParamType = z.infer<typeof ParamType>;

export const PiiClass = z.enum([
  "none",
  "identifier",
  "name",
  "financial",
  "secret",
]);
export type PiiClass = z.infer<typeof PiiClass>;

export const LocatorStrategy = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("role"),
    role: z.string(),
    name: z.string().optional(),
    exact: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("label"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("placeholder"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("text"),
    text: z.string(),
    role: z.string().optional(),
  }),
  z.object({
    kind: z.literal("title"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("name_attr"),
    name: z.string(),
  }),
  z.object({
    kind: z.literal("near_text"),
    text: z.string(),
    role: z.string().optional(),
  }),
  z.object({
    kind: z.literal("row_cell"),
    rowText: z.string(),
    columnHeader: z.string(),
  }),
]);
export type LocatorStrategy = z.infer<typeof LocatorStrategy>;

export const TargetRef = z.object({
  strategies: z.array(LocatorStrategy).min(1),
  notes: z.string().optional(),
});
export type TargetRef = z.infer<typeof TargetRef>;

export const ValueRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("param"), name: z.string() }),
  z.object({ kind: z.literal("literal"), value: z.string(), sensitive: z.literal(false) }),
  z.object({ kind: z.literal("empty") }),
]);
export type ValueRef = z.infer<typeof ValueRef>;

export const Checkpoint = z.object({
  id: z.string(),
  description: z.string(),
  anyOf: z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("url_includes"), value: z.string() }),
      z.object({ type: z.literal("title_includes"), value: z.string() }),
      z.object({ type: z.literal("text_includes"), value: z.string() }),
      z.object({ type: z.literal("role"), role: z.string(), name: z.string() }),
    ]),
  ),
});
export type Checkpoint = z.infer<typeof Checkpoint>;

export const DetectWhen = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text_includes"), value: z.string() }),
  z.object({ type: z.literal("url_includes"), value: z.string() }),
  z.object({ type: z.literal("title_includes"), value: z.string() }),
  z.object({ type: z.literal("dialog"), name: z.string() }),
]);
export type DetectWhen = z.infer<typeof DetectWhen>;

export const RecoverAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("dismiss"),
    target: TargetRef,
  }),
  z.object({
    type: z.literal("wait_retry"),
    ms: z.number().int().positive(),
    times: z.number().int().min(1).max(3),
  }),
  z.object({
    type: z.literal("fail"),
    reason: z.string(),
  }),
]);
export type RecoverAction = z.infer<typeof RecoverAction>;

export const OutcomeDetector = z.object({
  id: z.string(),
  kind: z.enum(["business", "recoverable", "hard"]),
  when: DetectWhen,
  message: z.string(),
  recover: RecoverAction.optional(),
});
export type OutcomeDetector = z.infer<typeof OutcomeDetector>;

export const ActionKind = z.enum([
  "navigate",
  "click",
  "fill",
  "press",
  "extract",
  "dismiss",
  "wait",
  "human",
]);
export type ActionKind = z.infer<typeof ActionKind>;

export const Step = z.object({
  id: z.string(),
  action: ActionKind,
  description: z.string(),
  risk: RiskClass,
  target: TargetRef.optional(),
  value: ValueRef.optional(),
  press: z.string().optional(),
  extractAs: z.string().optional(),
  navigateTo: z.string().optional(),
  waitMs: z.number().int().positive().optional(),
  checkpoint: Checkpoint.optional(),
});
export type Step = z.infer<typeof Step>;

export const TypedField = z.object({
  name: z.string(),
  type: ParamType,
  required: z.boolean().default(true),
  description: z.string(),
  pii: PiiClass.default("none"),
  enumValues: z.array(z.string()).optional(),
});
export type TypedField = z.infer<typeof TypedField>;

export const VendorBinding = z.object({
  product: z.string(),
  channel: z.string().default("web"),
  /** Canonical capability this recording specializes, if any. */
  base: z.string().optional(),
  /** Tenant/version overlay — locators, entry, copy. Empty at record time. */
  tenantOverrides: z
    .object({
      tenantId: z.string().optional(),
      appVersion: z.string().optional(),
      locatorPatches: z.record(z.string(), TargetRef).optional(),
      entryUrl: z.string().optional(),
    })
    .optional(),
});
export type VendorBinding = z.infer<typeof VendorBinding>;

export const Capability = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  description: z.string(),
  vendor: VendorBinding,
  surfaceKind: SurfaceKind,
  entry: z.object({
    kind: z.literal("url"),
    value: z.string(),
  }),
  contract: z.object({
    params: z.array(TypedField),
    outputs: z.array(TypedField),
  }),
  steps: z.array(Step).min(1),
  outcomes: z.array(OutcomeDetector),
  success: z.object({
    checkpointIds: z.array(z.string()),
    requiredOutputs: z.array(z.string()),
  }),
  review: z.object({
    summary: z.string(),
    irreversibleStepIds: z.array(z.string()),
    recordedAt: z.string(),
    recordedAgainst: z.string(),
  }),
  policy: z.object({
    allowedHosts: z.array(z.string()),
    allowedActions: z.array(ActionKind),
    allowIrreversibleUnattended: z.boolean().default(false),
  }),
});
export type Capability = z.infer<typeof Capability>;

export function parseCapability(data: unknown): Capability {
  return Capability.parse(data);
}
