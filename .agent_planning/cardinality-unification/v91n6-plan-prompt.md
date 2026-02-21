Ticket: oscilla-animator-v2-v91n.6
Title: Delete BufferPool (arena replaces it)

You are in PLAN MODE ONLY. Do not edit files, do not run mutating commands, do not commit.

Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/v91n6
Branch: codex/v91n6-delete-bufferpool

Required process:
1) Explore buffer pool ownership and all runtime materialization call sites.
2) Build a deletion-first migration plan with arena-backed target writes as the sole path.
3) Identify sequencing constraints with prior tickets.
4) Include verification matrix and grep invariants.
5) Respect AGENTS.md architecture laws.

Deliverable format:
- Scope/Non-goals
- Codebase findings
- Prerequisites/blockers
- Step-by-step implementation plan
- Verification matrix
- Risks + mitigations

Do not execute; plan only.
