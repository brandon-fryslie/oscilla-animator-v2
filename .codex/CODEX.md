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

- Treat `.beads/issues.jsonl` as the beads database and expected workspace state.  If you see this is changed, run 'git add .beads/ && bd sync' to resolve.  If it doens't resolve, add it to your next commit without mentioning it.
- Include `.beads/issues.jsonl` changes in commits when present.
- Do not call out `.beads/issues.jsonl` as unrelated noise.
- Do not state or imply that `.beads/issues.jsonl` was or was not modified.
- You MUST ensure your PR descriptions are PROPERLY FORMATTED.
- Never emit escaped newline literals (e.g. `\n`) in PR descriptions; use real multiline Markdown text.
- There are no "unrelated" test failures. If a test fails, fix it before merging.

## PR Review Workflow

// [LAW:single-enforcer] PR readiness is enforced at one boundary: PR review + checks before merge.
- After opening a PR, poll review status every 1 minute until Copilot review appears and checks are complete.
- START_REVIEW_LOOP
- Treat Copilot's "Pull request overview" review object as a completed review signal when there are no actionable inline comments.
  - Copilot will leave ONE "Pull request overview" PER REVIEW.  If you push additional changes, you MUST repeat the following process!
- If Copilot leaves actionable review comments, address each one, push fixes, and re-run required checks.
- Address each specific comment by responding directly to Copilot's comment, explaining the resolution (with specifics).
- For each review comment Copilot leaves, you MUST acknowledge you have read it by leaving a response BEFORE making changes:
  - If the solution is trivial and you will make a fix, say e.g., '👍 will fix'
  - If the solution is non-trivial, leave a brief explanation
  - If you need to research, say 'will look into it' (and updated with more info later)
  - If Copilot did not understand the problem or there are mitigating circumstances, leave a concise but complete explanation that contains enough context for others to understand
- AFTER pushing fixes:
  - Add additional context to the conversation, if necessary (if not necessary, do not)
  - You MUST resolve each conversation you have addressed
  - You MUST continue polling every 1 minute until Copilot's new "Pull request overview" review object is available, indicating the review is complete
  - If there are any actionable comments, you MUST START_REVIEW_LOOP again
  - If there are comments but none are actionable (ie, one comment that is not accurate), resolve the conversation and exit the loop.
- END_REVIEW_LOOP (exit condition: you have received a "Pull request overview" for your latest pushed commit and resolved all conversations)
- Merge the PR only when there are no outstanding actionable comments and required checks pass.

## Default Delivery Flow

// [LAW:single-enforcer] File-delivery ownership is enforced at one boundary: immediate VCS delivery.
- If tracked repository files are edited, immediately execute delivery without waiting for user prompting.
- Delivery means: commit on the active work branch, push, and create/update the PR.
- Only skip commit/push/PR delivery when the user explicitly says not to commit yet.
- If you find files you don't recognize, create a separate commit / PR after reviewing them.  If unable to do so, alert the user.
