Ticket: oscilla-animator-v2-wbhc.2
Title: Wave 2 - Convert Broadcast block to field-of-1 -> field-of-N semantics

You are in PLAN MODE ONLY. Do not edit files, do not run mutating commands, do not commit.

Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/wbhc2
Branch: codex/wbhc2-broadcast-field-unify

Required process:
1) Explore broadcast lowering/materialization and adapter insertion compatibility assumptions.
2) Propose a migration plan that preserves solver and adapter behavior while removing signal-special assumptions.
3) Explicitly identify interactions with reduce/symmetric paths if needed.
4) Include dependency blockers and test strategy.
5) Respect AGENTS.md architecture laws.

Deliverable format:
- Scope/Non-goals
- Codebase findings
- Prerequisites/blockers
- Step-by-step implementation plan
- Verification matrix
- Risks + mitigations

Do not execute; plan only.
