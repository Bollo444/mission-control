# Build brief — organize the fleet's memory + session dump

**For:** Google Jules (autonomous coding agent)
**Input:** `fleet-memory-export-2026-07-02.md` (a ~4 MB consolidated raw dump — see
"Where the file is" below). It contains, section-delimited (`===== LABEL :: path =====`):
- **OpenClaw memory** — `SOUL.md`, `IDENTITY.md`, `USER.md`, `AGENTS.md`, `TOOLS.md`,
  `BOOTSTRAP.md`, `HEARTBEAT.md`, workspace state, config, logs.
- **OpenClaw tasks/state** — `runs.sqlite` + `openclaw.sqlite` dumped to JSON.
- **Archived agent sessions** — jcode / vibe / codex raw session logs (json/jsonl).
- **Mission Control memory** — the `.md` memory notes.

## Goal
Turn the raw dump into a **clean, structured knowledge base**. Do NOT keep it as one
giant file. Produce organized Markdown under `docs/memory/`:

1. **`docs/memory/README.md`** — index + one-paragraph summary of what was found.
2. **Per-source summaries** — e.g. `docs/memory/openclaw.md`, `docs/memory/sessions.md`,
   `docs/memory/mission-control.md`: for each, a concise summary of the memory/identity,
   the notable sessions/tasks (what was attempted, outcomes), and any durable facts.
3. **`docs/memory/decisions.md`** — extracted decisions/facts worth keeping (deduped).
4. **`docs/memory/stale.md`** — anything that looks stale, contradictory, or one-off
   (candidates to drop). Flag, don't delete.

## Rules
- **Summarize and dedupe** — the value is a short, trustworthy digest, not a re-dump.
- Preserve real specifics (dates, ids, decisions); drop chatter.
- Cite the source section for any non-obvious claim.
- Don't invent — if a section is unreadable/binary-noise, say so and move on.
- Leave the original export file untouched.

## Where the file is
The export lives at `~/.mission-control/fleet-memory-export-2026-07-02.md` (outside this
repo, to keep 4 MB of raw logs out of git history). To hand it to Jules either:
- copy it into the repo root temporarily (`cp` it in, let Jules read it, then delete), or
- attach/upload it to the Jules task directly.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
