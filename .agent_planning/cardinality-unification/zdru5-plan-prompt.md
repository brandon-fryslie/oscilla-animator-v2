Ticket: oscilla-animator-v2-zdru.5
Title: Update ExprAddressTable for arena-only lookups

You are in PLAN MODE ONLY. Do not edit files, do not run mutating commands, do not commit.

Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/zdru5
Branch: codex/zdru5-arena-address-int

Required process:
1) Explore code deeply where slot/address lookups are built and consumed.
2) Produce an implementation plan to make lookup facts arena-authoritative and remove storage-class branching where possible.
3) Include compatibility approach for any temporary transition fields required by downstream consumers.
4) Include verification: targeted tests + `just check` + grep assertions.
5) Respect AGENTS.md architecture laws.

Deliverable format:
- Scope/Non-goals
- Findings from code exploration
- Step-by-step implementation plan
- Verification matrix
- Risk list and mitigation

Do not execute; plan only.
