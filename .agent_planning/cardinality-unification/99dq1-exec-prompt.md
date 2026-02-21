Ticket: oscilla-animator-v2-99dq.1
Title: Create SCALAR_INSTANCE_ID for cardinality-one materialization

Execute the approved plan in this worktree.
Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/99dq1
Branch: codex/99dq1-scalar-instance

Execution requirements:
1) Introduce `SCALAR_INSTANCE_ID` as the canonical scalar-instance sentinel and wire it through compile-time registration paths per plan.
2) Keep scope tight to 99dq.1; avoid pulling in later-phase behavior changes.
3) Preserve architecture law citations where decisions are encoded in comments.
4) Run focused verification plus `just check`.
5) Commit with message: [99dq.1] Introduce SCALAR_INSTANCE_ID for scalar materialization context

Final output must include:
- Summary of changes
- Exact files changed
- Verification commands run and pass/fail
- Commit hash
