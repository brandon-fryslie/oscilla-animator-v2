# Definition of Done: Vector Component Lenses
Generated: 2026-02-01

## Completion Criteria

- [x] Extract registers and compiles correctly
- [x] Extract correctly extracts a single component from vec3/color
- [x] Construct registers and compiles correctly
- [x] Construct correctly assembles scalars into vec3/color
- [x] IR supports component extraction and assembly (confirmed - existing extract/construct operations)
- [x] Tests pass for both blocks
- [x] `npm run typecheck` passes (pre-existing errors unrelated to this work)
- [x] `npm run test` passes (all 2173 tests pass)

## Implementation Summary

**Extract Block** (`src/blocks/lens/extract.ts`):
- Input: `in` (vec3), `component` (config: 0|1|2, default 0, not exposed as port)
- Output: `out` (float)
- Uses IR `extract()` operation
- Type-CHANGING lens (vec3 → float)
- Discoverable via `getAvailableLensTypes()` (has standard in/out ports)

**Construct Block** (`src/blocks/lens/construct.ts`):
- Inputs: `x`, `y`, `z` (float scalars, all exposed as ports)
- Output: `out` (vec3)
- Uses IR `construct()` operation
- Type-CHANGING lens (float → vec3)
- NOT discoverable via `getAvailableLensTypes()` (multi-input, doesn't follow in/out convention)

**Tests** (`src/blocks/lens/__tests__/vector-lenses.test.ts`):
- 18 tests covering registration, port structure, type behavior
- All lens tests pass (82 total)
- All project tests pass (2173 total)

**Commit**: `8125c57` - feat(lens): add Extract and Construct vector component lenses

## Notes

- No IR extensions needed - existing `extract()` and `construct()` operations in IRBuilder fully support this
- Reference implementations: `SplitColorHSL` (extract pattern), `MakeColorHSL` (construct pattern)
- These are the first type-CHANGING lenses (Sprints 1-2 were type-preserving)
