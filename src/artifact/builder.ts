import { SCHEMA_VERSION, type Capability, type Step, type TypedField } from "./schema.js";

export type Recorded = {
  step: Step;
};

export const DEFAULT_OUTCOMES: Capability["outcomes"] = [
  {
    id: "member_not_found",
    kind: "business",
    when: { type: "text_includes", value: "No member record matches" },
    message: "No member exists for the given ID",
  },
  {
    id: "validation_error",
    kind: "business",
    when: { type: "text_includes", value: "Member ID is required" },
    message: "Search validation failed",
  },
  {
    id: "permission_denied",
    kind: "business",
    when: { type: "text_includes", value: "Permission denied" },
    message: "Caller is not authorized to view this member",
  },
  {
    id: "session_expired",
    kind: "hard",
    when: { type: "text_includes", value: "session has expired" },
    message: "Teller session expired",
    recover: { type: "fail", reason: "session_expired" },
  },
  {
    id: "system_notice",
    kind: "recoverable",
    when: { type: "dialog", name: "System Notice" },
    message: "Maintenance interstitial",
    recover: {
      type: "dismiss",
      target: {
        strategies: [
          { kind: "role", role: "button", name: "OK" },
          { kind: "title", text: "OK" },
        ],
      },
    },
  },
  {
    id: "system_notice_text",
    kind: "recoverable",
    when: { type: "text_includes", value: "scheduled maintenance window" },
    message: "Maintenance interstitial (text)",
    recover: {
      type: "dismiss",
      target: {
        strategies: [
          { kind: "role", role: "button", name: "OK" },
          { kind: "title", text: "OK" },
        ],
      },
    },
  },
];

export function buildCapability(opts: {
  id: string;
  name: string;
  description: string;
  goal: string;
  entryUrl: string;
  params: TypedField[];
  outputs: TypedField[];
  steps: Step[];
  allowedHosts: string[];
}): Capability {
  const checkpointIds = opts.steps.filter((s) => s.checkpoint).map((s) => s.checkpoint!.id);
  const irreversibleStepIds = opts.steps.filter((s) => s.risk === "irreversible").map((s) => s.id);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id,
    version: 1,
    name: opts.name,
    description: opts.description,
    vendor: { product: "corelink-demo", channel: "web" },
    surfaceKind: "web",
    entry: { kind: "url", value: opts.entryUrl },
    contract: { params: opts.params, outputs: opts.outputs },
    steps: opts.steps,
    outcomes: DEFAULT_OUTCOMES,
    success: {
      checkpointIds,
      requiredOutputs: opts.outputs.map((o) => o.name),
    },
    review: {
      summary: opts.description,
      irreversibleStepIds,
      recordedAt: new Date().toISOString(),
      recordedAgainst: opts.entryUrl,
    },
    policy: {
      allowedHosts: opts.allowedHosts,
      allowedActions: ["navigate", "click", "fill", "press", "extract", "dismiss", "wait", "human"],
      allowIrreversibleUnattended: false,
    },
  };
}

export function slugFromGoal(goal: string): string {
  const s = goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return s || "capability";
}

export function inferParamsFromGoal(goal: string): { fields: TypedField[]; values: Record<string, string> } {
  const values: Record<string, string> = {};
  const fields: TypedField[] = [];
  const member = goal.match(/\b(?:member|id)\s*(\d{3,})\b/i) ?? goal.match(/\b(\d{4,})\b/);
  if (member) {
    values.memberId = member[1];
    fields.push({
      name: "memberId",
      type: "identifier",
      required: true,
      description: "Member identifier as entered on the search screen",
      pii: "identifier",
    });
  }
  return { fields, values };
}
