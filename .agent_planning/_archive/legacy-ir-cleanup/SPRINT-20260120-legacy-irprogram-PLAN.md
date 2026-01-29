# Sprint Plan: Remove Legacy IRProgram

**Bead:** oscilla-animator-v2-8vo
**Topic:** Remove legacy IR types in src/compiler/ir/types.ts
**Confidence:** HIGH
**Created:** 2026-01-20

## Background

The `src/compiler/ir/types.ts` file has a deprecation header indicating the entire file contains "legacy IR types" and that `CompiledProgramIR` in `program.ts` is the authoritative schema. However, investigation reveals:

1. The expression types (SigExpr, FieldExpr, EventExpr, Step variants, etc.) are **actively used** by `program.ts` itself and throughout the runtime
2. The truly deprecated type is `IRProgram` - the old container interface
3. `IRProgram` is exported from index files but **never actually used** as a type annotation

## Scope

Remove the deprecated `IRProgram` interface and clean up the misleading deprecation header.

## Changes

### 1. Remove IRProgram interface from types.ts

- Delete lines 453-477 (the @deprecated JSDoc and IRProgram interface)

### 2. Update deprecation header comment

- Remove the misleading deprecation at the top of the file (lines 1-14)
- Replace with accurate header describing what the file contains

### 3. Remove IRProgram from exports

Files to update:
- `src/compiler/ir/index.ts` - currently re-exports via `export * from './types'`
- `src/index.ts` - explicitly exports `IRProgram`
- `src/compiler/index.ts` - explicitly exports `IRProgram`

### 4. Update program.ts comment

- Remove reference to "legacy IRProgram" since it will no longer exist

## Files Modified

| File | Change |
|------|--------|
| `src/compiler/ir/types.ts` | Remove IRProgram, update header |
| `src/index.ts` | Remove IRProgram from export |
| `src/compiler/index.ts` | Remove IRProgram from export |
| `src/compiler/ir/program.ts` | Update comment |

## Verification

1. `npm run typecheck` passes
2. `npm run build` succeeds
3. `npm run test` passes
4. grep confirms no remaining IRProgram references in src/

## Unknowns to Resolve

None - scope is clear and changes are straightforward.
