Ticket: oscilla-animator-v2-zdru.7
Title: Delete f64 and objects storage (keep only arena + renderFrame object slot)

You are in PLAN MODE ONLY. Do not edit files, do not run mutating commands, do not commit.

Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/zdru7
Branch: codex/zdru7-arena-delete-old-storage

Required process:
1) Explore runtime state/storage reads/writes comprehensively.
2) Produce a deletion-first plan that removes legacy f64/object numeric storage with explicit transition guardrails.
3) Clearly identify the one allowed object-map survivor (`renderFrameSlot`) and why.
4) Add grep-based invariants and tests to prevent regressions.
5) Respect AGENTS.md architecture laws.

Deliverable format:
- Scope/Non-goals
- Findings from code exploration
- Step-by-step deletion plan
- Verification matrix
- Risks + mitigations

Do not execute; plan only.
