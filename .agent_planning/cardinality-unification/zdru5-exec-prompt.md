Ticket: oscilla-animator-v2-zdru.5
Title: Update ExprAddressTable for arena-only lookups

Execute the approved plan in this worktree.
Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/zdru5
Branch: codex/zdru5-arena-address-int

Execution requirements:
1) Implement the plan with deletion-first, one-source-of-truth intent: runtime arena lookup facts come from ExprAddressTable-derived data, not scattered direct `program.arenaLayout[...]` calls.
2) Preserve behavior. Do not modify unrelated files.
3) Keep architecture law citations where decisions are encoded in comments.
4) Run verification commands from plan (use `rg` for grep-style checks).
5) Run `just check` before finishing.
6) Commit with message: [zdru.5] Centralize arena lookup facts in ExprAddressTable

Final output must include:
- Summary of changes
- Exact files changed
- Verification commands run and pass/fail
- Commit hash
