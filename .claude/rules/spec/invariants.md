# System Invariants

**Spec Reference**: `design-docs/spec/00-invariants.md`

These rules apply globally - no path restriction. Invariants are non-negotiable.

## Core Invariants

<!-- TODO: Populate from spec when implementing -->

- All code must respect the invariants defined in the spec
- Invariant violations are bugs, not edge cases
- No "temporary" workarounds that violate invariants

## Enforcement

- Invariants should be mechanically enforced where possible (types, assertions, compile-time checks)
- Runtime invariant checks should fail fast and loud
- Never catch and suppress invariant violation errors
