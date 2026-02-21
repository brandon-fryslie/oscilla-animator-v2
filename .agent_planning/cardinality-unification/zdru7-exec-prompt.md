Ticket: oscilla-animator-v2-zdru.7
Title: Delete f64 and objects storage (keep only arena + renderFrame object handling)

Execute the approved plan in this worktree.
Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/zdru7
Branch: codex/zdru7-arena-delete-old-storage

Execution requirements:
1) Implement only when dependency gates are met (zdru.3/.4/.5/.6).
2) Delete legacy numeric storage paths (`values.f64`, numeric `values.objects`) and preserve explicit typed renderFrame object handling.
3) Keep scope tight to zdru.7 and avoid unrelated migration tasks.
4) Preserve architecture law citations where decisions are encoded.
5) Run focused verification and `just check`.
6) Commit with message: [zdru.7] Remove legacy f64/object numeric value storage

Final output must include:
- Summary of changes
- Exact files changed
- Verification commands run and pass/fail
- Commit hash
