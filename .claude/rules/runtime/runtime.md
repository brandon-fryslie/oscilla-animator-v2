---
paths: src/runtime/**/*.ts
---

# Runtime

**Spec Reference**: `design-docs/spec/05-runtime.md`

## Concepts

- **Runtime loop**: The main execution cycle
- **Hot swap**: Live code/graph replacement
- **State continuity**: Preserving state across changes

## Guidelines

- Runtime loop is the single execution authority
- Hot swap must preserve state continuity per spec
- No side effects outside the runtime loop's control
- State transitions must be explicit and traceable

## Implementation Notes

<!-- TODO: Populate specific rules as runtime is implemented -->

- Frame boundaries are explicit synchronization points
- Hot swap validity is checked before application
- Failed hot swaps must not corrupt running state
