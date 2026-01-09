---
paths: src/render/**/*.ts, src/renderer/**/*.ts
---

# Renderer

**Spec Reference**: `design-docs/spec/09-renderer.md`

## Concepts

- **Renderer contract**: What the renderer promises and requires
- **Boundaries**: Where renderer responsibility begins and ends

## Guidelines

- Renderer is a consumer of the runtime's output
- Renderer does not dictate runtime behavior
- Boundary crossing is explicit and typed
- Renderer state is renderer's concern, not runtime's

## Implementation Notes

<!-- TODO: Populate specific rules as renderer is implemented -->

- Renderer receives immutable frame data
- Renderer may batch, optimize, or defer as long as contract is met
- Multiple renderer implementations should be possible against same contract
