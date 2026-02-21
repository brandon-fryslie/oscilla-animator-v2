Ticket: oscilla-animator-v2-zdru.4
Title: Migrate DebugService to read from arena

Execute the approved plan in this worktree.
Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/zdru4
Branch: codex/zdru4-arena-debug-int

Execution requirements:
1) Implement DebugService arena-read migration and required CompileOrchestrator wiring per approved plan.
2) Keep scope tight to zdru.4 and directly coupled tests only.
3) Preserve architecture law citations where decisions are encoded.
4) Run focused verification plus `just check`.
5) Commit with message: [zdru.4] Switch DebugService value reads to arena

Final output must include:
- Summary of changes
- Exact files changed
- Verification commands run and pass/fail
- Commit hash
