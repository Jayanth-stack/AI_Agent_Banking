# Evidence

Reviewer shortcuts (same content as the timestamped run dirs):

| Path | What it shows |
| --- | --- |
| `replay-success/` | Deterministic replay, member `12345` → `$4,250.18`. Interstitial recovered, then fill/click/extract. Member ID masked in the log (`1***45`). |
| `replay-not-found/` | `memberId=99999` → `business_outcome` / `member_not_found` (not a crash). |
| `replay-session-expired/` | `--expire` → hard failure + screenshot of the session-expired screen. |
| `../capabilities/lookup-savings-balance.v1.json` | The capability artifact those runs executed. |

Discovery (LLM in the loop) writes `discover-*` here when you run:

```bash
npm run discover -- --goal "look up member 12345 and read their current savings balance"
```

That needs `GEMINI_API_KEY` (or `OPENAI_API_KEY`). Replay does not.
