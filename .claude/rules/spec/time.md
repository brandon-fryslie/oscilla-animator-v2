---
paths: src/time/**/*.ts
---

# Time System

**Spec Reference**: `design-docs/spec/02-time.md`

## Concepts

- **TimeRoot**: The authoritative source of time
- **TimeModel**: How time flows through the system
- **Time Rules**: Constraints on time-dependent operations

## Guidelines

- ONE timing authority - TimeRoot is the single source of truth
- Time values are immutable once produced
- No ambient time access - time flows through explicit parameters
- Time-dependent code must declare its time dependency

## Implementation Notes

<!-- TODO: Populate specific rules as time system is implemented -->

- Frame time vs wall time must be explicit
- Time deltas should be computed, not stored
- Avoid floating point time accumulation errors
