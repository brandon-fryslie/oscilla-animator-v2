---
applyTo: "**"
---

# Repository-Wide PR Review Instructions

Review every PR with strict and pedantic standards.

- Treat architecture/spec docs as normative contracts.
- Flag any divergence from repository-defined constraints, even if tests pass.
- Require explicit ownership boundaries and a single enforcer for each invariant.
- Reject dual sources of truth and hidden compatibility facades.
- Prefer deterministic, fail-fast behavior over implicit fallbacks.
- Require behavior-oriented test evidence for changed behavior.
- For test changes, enforce behavior-first assertions and reject low-signal placeholders.
