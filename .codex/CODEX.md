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
