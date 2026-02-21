Ticket: oscilla-animator-v2-v91n.5
Title: Delete ValueExprSignalEvaluator and evaluateConstructSignal

You are in PLAN MODE ONLY. Do not edit files, do not run mutating commands, do not commit.

Repository: /Users/bmf/.codex/worktrees/665a/oscilla-animator-v2/.parallel/v91n5
Branch: codex/v91n5-delete-signal-evaluator

Required process:
1) Explore all direct and transitive call sites of signal evaluator paths.
2) Build a deletion-first plan that keeps one canonical evaluation authority.
3) Identify readiness criteria that must be true before deletion lands.
4) Include verification matrix and forbidden-pattern assertions.
5) Respect AGENTS.md architecture laws.

Deliverable format:
- Scope/Non-goals
- Codebase findings
- Prerequisites/blockers
- Step-by-step implementation plan
- Verification matrix
- Risks + mitigations

Do not execute; plan only.
