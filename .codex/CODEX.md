# Codex Workspace Rules

## Mandatory WebGPU Preflight

For any task that changes WebGPU architecture, tickets, compiler, runtime, or renderer behavior, agents MUST read:

1. `docs/WebGPU-Complete/AGENTS.md`
2. The directly relevant spec file(s) in `docs/WebGPU-Complete/`

If `docs/WebGPU-Complete/AGENTS.md` is missing, do not start implementation work. Create or restore it first.

## Mandatory Ticket Ordering

For WebGPU migration work:

1. Select work only from `bd ready --json` (or `bd ready --json --parent <epic-id>` when working an epic).
2. Do not start blocked tickets.
3. Do not bypass dependency order by manually picking a non-ready ticket.

If the requested ticket is blocked, update dependencies/plan first, then execute only when the ticket becomes ready.

## Commit-Time Enforcement

For commits that touch WebGPU migration scope, set `BEAD_ID` and run:

```bash
scripts/enforce-webgpu-bead-readiness.sh
```

The local pre-commit hook should call this script so commits are rejected when `BEAD_ID` is missing or blocked by open `blocks` dependencies.

## Codex Memory

- Treat `.beads/issues.jsonl` as the beads database and expected workspace state.
- Include `.beads/issues.jsonl` changes in commits when present.
- Do not call out `.beads/issues.jsonl` as unrelated noise.
- Do not state or imply that `.beads/issues.jsonl` was not modified.
- Markdown code fences in PR descriptions are allowed.
- Never emit escaped newline literals (e.g. `\n`) in PR descriptions; use real multiline Markdown text.
- There are no "unrelated" test failures. If a test fails, fix it before merging.
