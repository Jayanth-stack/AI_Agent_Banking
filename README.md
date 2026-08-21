# Computer-use automation (record once, replay many)

Backend integration layer for AI agents that have to operate **legacy bank UIs with no API**. An LLM discovers a task once; the result is a typed, reviewable **capability artifact**. Production invocation is **deterministic replay** — no model in the loop. When replay or discovery cannot proceed safely, a human takes control of the **same live session** and hands it back.

Proxy target: **CoreLink**, a local teller console (table layout, no test IDs, interstitial, not-found / denial / session expiry).

## Setup

```bash
cp .env.example .env   # add GEMINI_API_KEY for discovery only
npm install
npx playwright install chromium
```

Replay and tests do **not** need a model key. Discovery does (`GEMINI_API_KEY`, or `OPENAI_API_KEY` as fallback). Requires Node 20+.

```bash
npm test
```

## Demo path

Target starts automatically if it isn't already up (`http://127.0.0.1:3847`).

```bash
# 1. LLM discovery (writes capabilities/*.json + evidence/<runId>/)
npm run discover -- --goal="look up member 12345 and read their current savings balance"

# 2. Deterministic replay (no LLM)
npm run replay -- --artifact lookup-savings-balance --params memberId=12345

# 3. Business outcome, not a crash
npm run replay -- --artifact lookup-savings-balance --params memberId=99999

# 4. Permission denial (business) and session expiry (hard failure)
npm run replay -- --artifact lookup-savings-balance --params memberId=88888
npm run replay -- --artifact lookup-savings-balance --params memberId=12345 --expire

# 5. Human-in-the-loop on the live session (auto-resumes after 2s for unattended demo)
npm run replay -- --artifact lookup-savings-balance --params memberId=12345 --force-escalate --headed --auto-resume
```

Without `--auto-resume`, `--force-escalate --headed` pauses, prints an operator URL, and waits. Use the Chromium window, then **Resume** in the operator page — or:

```bash
npm run operator -- resume --run <runId>
```

Agent-facing catalog (stretch, thin):

```bash
npm run invoke -- list
npm run invoke -- call --id lookup-savings-balance --params memberId=12345
```

Run without live LLM: skip `discover`, use the seeded `capabilities/lookup-savings-balance.v1.json`.

## Layout

| Path | Role |
| --- | --- |
| `src/artifact/` | Versioned capability schema (the contract) |
| `src/surface/` | `ISurface` + Playwright/a11y implementation |
| `src/agent/` | Observe → decide → act discovery |
| `src/replay/` | Deterministic executor + outcome taxonomy |
| `src/safety/` | Allowlist, irreversible gate, redaction |
| `src/escalation/` | Control lock, operator page, same-session handoff |
| `src/target/` | CoreLink UAT stand-in |
| `capabilities/` | Saved artifacts |
| `evidence/` | Discovery + replay logs (see `REPORT.md`) |

## Config

| Env | Used by |
| --- | --- |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Discovery (default) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Discovery fallback |
| `LLM_PROVIDER` (`gemini` \| `openai`) | Force provider when both keys exist |
| `TARGET_PORT` (default 3847) | CoreLink |
| `OPERATOR_PORT` (default 3848) | HITL UI |
