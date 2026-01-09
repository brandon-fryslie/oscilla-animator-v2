---
paths: src/compiler/**/*.ts
---

# Compilation Pipeline

**Spec Reference**: `design-docs/spec/04-compilation.md`

## Pipeline Stages

- **Normalization**: Transform input to canonical form
- **Validation**: Check invariants and constraints
- **Compile**: Produce executable representation

## Guidelines

- Staged with explicit I/O - each stage declares inputs/outputs
- No back-edges - later stages never mutate earlier representations
- IRs are owned - intermediate representations have explicit ownership
- Validation errors must include source location and context

## Implementation Notes

<!-- TODO: Populate specific rules as compiler is implemented -->

- Each stage produces a new representation, does not mutate
- Errors should be collected, not thrown on first occurrence (where sensible)
- Pipeline stages should be independently testable
