Ticket: oscilla-animator-v2-zdru.6
Title: Migrate continuity system to read/write arena

You are in PLAN MODE ONLY. Do not edit files, do not run mutating commands, do not commit.

Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/zdru6
Branch: codex/zdru6-arena-continuity-int

Required process:
1) Explore continuity pipeline + runtime apply/build paths thoroughly.
2) Build plan to switch continuity read/write paths from objects-map buffers to arena slices while preserving behavior.
3) Identify data ownership and aliasing hazards for Float32Array slices.
4) Include verification via focused continuity/runtime tests + `just check` + grep checks.
5) Respect AGENTS.md architecture laws.

Deliverable format:
- Scope/Non-goals
- Findings from code exploration
- Step-by-step implementation plan
- Verification matrix
- Risks + mitigations

Do not execute; plan only.
