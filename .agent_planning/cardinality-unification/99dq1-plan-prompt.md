Ticket: oscilla-animator-v2-99dq.1
Title: Create SCALAR_INSTANCE_ID for cardinality-one materialization

You are in PLAN MODE ONLY. Do not edit files, do not run mutating commands, do not commit.

Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/99dq1
Branch: codex/99dq1-scalar-instance

Required process:
1) Explore compiler IR and program instance registration paths.
2) Produce a precise plan introducing SCALAR_INSTANCE_ID as a canonical source of truth.
3) Identify all downstream consumers that assume scalar values have no instance id.
4) Include compatibility checks and targeted tests.
5) Respect AGENTS.md architecture laws.

Deliverable format:
- Scope/Non-goals
- Findings from code exploration
- Step-by-step implementation plan
- Verification matrix
- Risks + mitigations

Do not execute; plan only.
