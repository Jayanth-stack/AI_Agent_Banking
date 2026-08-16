# REPORT

## 1. Architecture

Single-process TypeScript CLI plus a local CoreLink stand-in. Four seams, not four services:

- **Surface** (`ISurface`) — perceive via an accessibility tree, act, screenshot, yield the live session to a human. Playwright/web is one adapter. Desktop would be another adapter over the same tree + actions. The artifact never stores CSS or Playwright locators.
- **Capability** — the agent-invocable contract. Discovery writes it; replay is the only production path.
- **Policy** — host/action allowlist and irreversible gating wrap *both* loops. The model cannot navigate off-box; replay cannot click Confirm unattended unless policy says so.
- **Control plane** — a per-run lock (`automation` \| `human`), an intervention record, and a resume signal. The browser process stays up across the handoff.

Trade-off: no queue, no tenant router, no CDP-sidecar fleet. The assignment is a vertical slice; those are scaling problems, not design problems. The cost is that a real operator console would attach to a hosted session instead of `localhost:3848` — the lock + intervention + resume files are the portable part.

Discovery uses an LLM once. Replay never calls one. That split is the product.

## 2. Artifact schema

A capability is a **tool**, not a transcript. `schemaVersion` + `id` + `version` give review and rollback. `contract.params` / `contract.outputs` are the calling convention an upstream agent uses. Steps are ordered actions with:

- **Multi-strategy locators**, a11y-first: `role+name`, then `title` (legacy tooltip-as-name), `name_attr` (what the vendor actually shipped), `near_text` (unlabeled table cell), `row_cell` (header-aligned extract). CSS and generated IDs are absent on purpose.
- **Value refs** (`param` \| non-sensitive `literal`) so member IDs never bake into the flow.
- **Checkpoints** after mutating steps — “the click worked” is not a success condition.
- **Outcome detectors** with kind `business` | `recoverable` | `hard`. This is the load-bearing distinction: “no such member” is a result; a missing Search button is a failure; a maintenance dialog is a recover-and-continue.

`vendor.base` + `tenantOverrides` are in the schema now so a later overlay can patch locators/entry without forking the flow. Discovery leaves them empty.

Why JSON + Zod rather than a DSL: reviewers (human and model) can read it; the runtime can validate it; it diffs in git.

## 3. Determinism & error handling

Replay is a straight interpreter. For each step: observe → classify outcomes → policy check → act → checkpoint. No model.

**Locators.** Strategies are tried in order with a short visible wait. The first hit wins; the matched strategy is logged so we can promote it. `row_cell` resolves the column by header text, not `nth-child`, because servicing screens reorder columns per tenant.

**Waits.** Playwright actionability is the default. We do not wait on `networkidle` (legacy postbacks lie). Checkpoints are the real barrier.

**Taxonomy.**

| Kind | Example | Replay contract |
| --- | --- | --- |
| `success` | Balance extracted, checkpoints held | outputs returned |
| `business_outcome` | member not found, validation, permission denied | `outcome.id` + message, not an exception |
| `recoverable` | System Notice interstitial | dismiss / wait-retry, then continue |
| `hard` | session expired, locator miss after retries | `failed` with step, expected, observed, screenshot |

UI drift is secondary here (enterprise consoles move slowly). When it happens it shows up as a locator miss with the tried strategies and a screenshot — then HITL, not a silent skip.

## 4. Heterogeneity & multi-tenant

**Surfaces.** The artifact speaks role/name/row, not DOM. A desktop adapter (macOS AX / Windows UIA) would implement `ISurface.observe/act` against the same locator kinds. Web-only strategies (`name_attr`) stay at the end of the list so they degrade instead of blocking a port. Screenshot+coordinates were rejected as primary control: they encode a resolution and a theme, which is exactly what branded tenants change.

**Tenants.** Hundreds of institutions run ~20 vendor products. The unit of reuse is `vendor.product` + capability id, not “First Oak’s recording.” Record against a reference tenant (or the vendor’s UAT). Ship that as `vendor.base`. Per tenant:

1. Replay on a canary with the base artifact.
2. On locator miss, a bounded overlay (`tenantOverrides.locatorPatches`) — not a new recording.
3. If checkpoints fail because of copy/branding, patch detectors, not steps.
4. Version the vendor channel (`appVersion`); pin artifacts to it. Drift detection is “canary replay status over N accounts,” not visual diff.

What we would *not* do: clone the artifact per institution, or put tenant hostnames in steps (entry URL is override-scoped).

## 5. Escalation & handoff

Stuck is detected, not hoped: unchanged a11y hash for 3 turns, model `escalate`, policy `irreversible` in unattended mode, locator miss, max steps.

Control transfer is a lock, not a new browser:

1. Automation sets `owner=human`, writes `intervention.json` (goal, step, reason, snapshot excerpt, screenshot).
2. Operator UI (`/operator?run=`) is a mock console. The **session** is real: the same Playwright page stays open; `bringToFront` + click/change listeners record what the human did.
3. Human signals `resume` | `complete` | `abort` (UI, or `npm run operator -- resume --run …`).
4. Automation re-acquires the lock and either continues, accepts completion, or fails closed.

`--force-escalate --auto-resume` is the unattended demonstration of that seam. A real co-browse product would replace the HTML page with their existing operator tool; it would still speak this lock.

## 6. Safety

Allowlist is host + action + blocked path prefixes (`/wire`, `/ach/send`, `/admin/delete`). Discovery and replay share `checkNavigation` / `checkAction`.

Irreversible (confirm / open account / transfer / delete, inferred from the step description) **escalates** in unattended replay. Safe/reversible proceeds. I would rather stall a teller workflow than post a sub-account because a locator drifted onto Submit.

Redaction: SSN/PAN/email/bearer/password keys never land in JSONL. Identifiers are masked in logs; artifacts store param refs. Limits: the capability *result* still returns the balance to the caller — that is the point of the tool. Production would add field-level encryption at rest and a data-class on every extract. Demo members are synthetic.

The agent cannot be prompted into `https://evil`. It can still fill a field on an allowlisted host with a value that is operationally stupid; that’s a capability-review problem, not a runtime allowlist problem.

## 7. Cuts

Left out on purpose: desktop adapter, real co-browse, queues, auth-broker / credential vault, multi-run flakiness scores, LLM one-step recovery on replay miss, visual regression.

Would build next: (1) credential broker so session expiry can recover without putting secrets in artifacts, (2) canary replay + tenant overlay compiler, (3) approval state (`draft → approved`) before unattended production invoke.

Stretched one thing: `npm run invoke -- list|call` as the agent-facing catalog. Everything else stayed thin.
