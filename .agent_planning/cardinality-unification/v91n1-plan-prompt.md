Ticket: oscilla-animator-v2-v91n.1
Title: Merge LoweredSignal + LoweredField into unified LoweredValue

You are in PLAN MODE ONLY. Do not edit files, do not run mutating commands, do not commit.

Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/v91n1
Branch: codex/v91n1-lowered-value-unify

Required process:
1) Explore all IR types and consumers that branch on lowered kind.
2) Produce a deletion-first unification plan with explicit migration sequence and compile checkpoints.
3) Include backward-compatibility handling only if strictly required for staged landing.
4) Include verification and forbidden-pattern checks.
5) Respect AGENTS.md architecture laws.

Deliverable format:
- Scope/Non-goals
- Codebase findings
- Prerequisites/blockers
- Step-by-step implementation plan
- Verification matrix
- Risks + mitigations

Do not execute; plan only.
