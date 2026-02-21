Ticket: oscilla-animator-v2-v91n.4
Title: Replace zipSig kernel with zip + implicit broadcast

You are in PLAN MODE ONLY. Do not edit files, do not run mutating commands, do not commit.

Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/v91n4
Branch: codex/v91n4-zipsig-removal

Required process:
1) Explore all zipSig producers/consumers across compiler IR and runtime materializer.
2) Plan a deletion-first migration to a single zip kernel with explicit broadcast semantics encoded in data, not control-flow branches.
3) Identify compatibility and sequencing with upstream tickets.
4) Include verification matrix (tests + grep invariants).
5) Respect AGENTS.md architecture laws.

Deliverable format:
- Scope/Non-goals
- Codebase findings
- Prerequisites/blockers
- Step-by-step implementation plan
- Verification matrix
- Risks + mitigations

Do not execute; plan only.
