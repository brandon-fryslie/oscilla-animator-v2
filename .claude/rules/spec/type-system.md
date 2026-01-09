---
paths: src/types/**/*.ts
---

# Type System

**Spec Reference**: `design-docs/spec/01-type-system.md`

## Concepts

- **Worlds**: Type universes/namespaces
- **TypeDesc**: Type descriptors
- **Domains**: Value domains and constraints
- **Compatibility**: Type compatibility rules

## Guidelines

- TypeDesc is the canonical representation of types in the system
- Type compatibility must be checked at defined boundaries
- Domain constraints are part of the type, not separate validation
- World membership determines what operations are valid

## Implementation Notes

<!-- TODO: Populate specific rules as type system is implemented -->

- Prefer structural typing where the spec allows
- Type errors should include full context (expected, actual, location)
- Never silently coerce between incompatible types
