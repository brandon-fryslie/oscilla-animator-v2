---
applyTo: "src/**/__tests__/**/*.{ts,tsx}"
---

# Test Review Instructions

Be strict and pedantic about test quality.

- Tests must assert user-observable or contract behavior, not private implementation details.
- Reject trivial assertions and placeholder tests.
- Require clear Arrange/Act/Assert structure and deterministic expectations.
- Flag duplicate coverage that adds runtime cost without new behavior validation.
- Prefer fewer high-value tests over many low-signal tests.
- Any skipped test must include explicit owner, reason, and removal plan.
