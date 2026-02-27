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

## Codex Memory

- Treat `.beads/issues.jsonl` as the beads database and expected workspace state.
- Include `.beads/issues.jsonl` changes in commits when present.
- Do not call out `.beads/issues.jsonl` as unrelated noise.
- Do not state or imply that `.beads/issues.jsonl` was not modified.
- Markdown code fences in PR descriptions are allowed.
- Never emit escaped newline literals (e.g. `\n`) in PR descriptions; use real multiline Markdown text.
- There are no "unrelated" test failures. If a test fails, fix it before merging.

## PR Review Workflow

// [LAW:single-enforcer] PR readiness is enforced at one boundary: PR review + checks before merge.
- After opening a PR, poll review status every 1 minute until Copilot review appears and checks are complete.
- Treat Copilot's "Pull request overview" review object as a completed review signal when there are no actionable inline comments.
- If Copilot leaves actionable review comments, address each one, push fixes, and re-run required checks.
- After pushing fixes, continue polling every 1 minute until Copilot is clear and checks are green.
- Merge the PR only when there are no outstanding actionable comments and required checks pass.
- If any actionable comments required code changes, do not auto-merge after updates; stop and wait for explicit user approval to merge.

## Default Delivery Flow

// [LAW:single-enforcer] File-delivery ownership is enforced at one boundary: immediate VCS delivery.
- If tracked repository files are edited, immediately execute delivery without waiting for user prompting.
- Delivery means: commit on the active work branch, push, and create/update the PR.
- Only skip commit/push/PR delivery when the user explicitly says not to commit yet.
