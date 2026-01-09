---
paths: src/blocks/**/*.ts
---

# Block Library

**Spec References**:
- `design-docs/spec/03-buses.md`
- `design-docs/spec/06-blocks.md`
- `design-docs/spec/07-transforms.md`
- `design-docs/spec/08-primitives-composites.md`

## Architecture

**ONE canonical block library** - all blocks live in `src/blocks/`.

### Block Categories (Mutually Exclusive)

- **Primitives**: Atomic, irreducible blocks
- **Composites**: Blocks composed from primitives & other composites

### Block Types

All of these are blocks and follow block semantics:

- **Buses**: Globally addressable pass-through blocks with default combine modes
- **Rails**: system created immutable buses that provide a consistent set of functionality to every patch
- **Transforms**: Lenses and Adapters
- **Lenses**: Transform data (scale, quantize, )
- **Default Sources**: Blocks that provide default values. All ports get a default source. Works with combine mode


- **Macros**: 'presets' that expand into blocks when they're added to a patch. Not true Blocks, they are never added to a patch and graph normalization never sees them.

## Critical Rules

- **BUSES HAVE NO SPECIAL COMPILATION BEHAVIOR** - they are just blocks
- Derived blocks must reduce to primitives (no infinite recursion)
- Stateful blocks declare their state schema explicitly
- Block identity is stable across hot swap where required

## Buses (spec 03)

- Combine mode is explicit, never implicit
- Order of writes within a frame must be deterministic or explicitly unordered
- Bus state is cleared each frame unless spec says otherwise
- Combine functions must be associative and commutative where order-independence is required

## Transforms (spec 07)

- Transforms are composable - A then B is a valid transform
- Lens laws must be respected (get/put/create consistency)
- Transform composition should be type-safe
- Failed transforms produce typed errors, not exceptions

## Primitives & Composites (spec 08)

- Primitive set is closed - additions require spec changes
- Composites are sugar, must reduce to primitives
- Library composites are documented with their reduction

## Implementation Notes

<!-- TODO: Populate specific rules as block library is implemented -->

- Block implementations should be pure functions where possible
- State initialization and reset are separate concerns
- Blocks should not reach outside their declared inputs
