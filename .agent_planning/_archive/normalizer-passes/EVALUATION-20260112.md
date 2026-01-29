# Graph Normalizer Pass Refactoring Evaluation

**Date**: 2026-01-12
**Scope**: Refactor `src/graph/normalize.ts` into explicit pass modules within `src/graph/`
**Status**: Analysis Complete

---

## Executive Summary

The graph normalizer (`src/graph/normalize.ts`, 607 lines) should be refactored into **explicit, modular pass files** within `src/graph/passes/`. This is a structural refactoring of the normalizer itself - the compiler is NOT touched.

**Key insight**: The normalizer already has 4 logical phases inline. This refactoring extracts each phase into its own file with explicit input/output types.

---

## Current State Analysis

### Structure of `src/graph/normalize.ts`

The `normalize()` function (lines 502-580) orchestrates 4 inline phases:

```typescript
export function normalize(patch: Patch): NormalizeResult | NormalizeError {
  // Phase 0: Resolve '???' types (line 506)
  const patchWithInferredTypes = resolvePolymorphicTypes(patch);

  // Phase 1: Materialize default sources (lines 509-510)
  const dsInsertions = analyzeDefaultSources(patchWithInferredTypes);
  const patchWithDefaults = applyDefaultSourceInsertions(patchWithInferredTypes, dsInsertions);

  // Phase 2: Insert adapters (lines 513-514)
  const insertions = analyzeAdapters(patchWithDefaults, errors);
  const expandedPatch = applyAdapterInsertions(patchWithDefaults, insertions);

  // Phase 3: Build indices and normalize edges (lines 517-566)
  // ... inline code ...
}
```

### Phase Breakdown

| Phase | Lines | Functions | Responsibility |
|-------|-------|-----------|----------------|
| 0 | 181-273 | `resolvePolymorphicTypes()` | Infer `'???'` types bidirectionally |
| 1 | 105-164, 278-302 | `analyzeDefaultSources()`, `applyDefaultSourceInsertions()` | Insert Const blocks for unconnected inputs |
| 2 | 345-454, 459-496 | `analyzeAdapters()`, `applyAdapterInsertions()` | Insert adapter blocks for type mismatches |
| 3 | 517-566 | Inline in `normalize()` | Build block index, normalize edges |

### Current Issues

1. **Monolithic file**: 607 lines with all logic inline
2. **Mixed concerns**: Type resolution, graph mutation, indexing all in one file
3. **Hidden data flow**: Intermediate `Patch` states not explicitly typed
4. **Hard to test**: Can't unit test individual phases
5. **Hard to extend**: Adding a new pass requires modifying the main function

---

## Proposed Refactoring

### New Directory Structure

```
src/graph/
├── normalize.ts          # Re-exports, backward compat (thin wrapper)
├── passes/
│   ├── index.ts          # Pass orchestration + exports
│   ├── pass0-polymorphic-types.ts
│   ├── pass1-default-sources.ts
│   ├── pass2-adapters.ts
│   └── pass3-indexing.ts
├── Patch.ts              # (unchanged)
└── adapters.ts           # (unchanged)
```

### Pass Signatures

**Pass 0: Polymorphic Type Resolution**
```typescript
// src/graph/passes/pass0-polymorphic-types.ts
export function pass0PolymorphicTypes(patch: Patch): Patch
```
- Input: Raw `Patch`
- Output: `Patch` with resolved `payloadType` in block params
- No errors (unresolved types stay `'???'`)

**Pass 1: Default Source Materialization**
```typescript
// src/graph/passes/pass1-default-sources.ts
export function pass1DefaultSources(patch: Patch): Patch
```
- Input: `Patch` (from Pass 0)
- Output: `Patch` with inserted Const blocks and edges
- No errors

**Pass 2: Adapter Insertion**
```typescript
// src/graph/passes/pass2-adapters.ts
export interface Pass2Result {
  readonly kind: 'ok';
  readonly patch: Patch;
}
export interface Pass2Error {
  readonly kind: 'error';
  readonly errors: readonly AdapterError[];
}
export function pass2Adapters(patch: Patch): Pass2Result | Pass2Error
```
- Input: `Patch` (from Pass 1)
- Output: `Patch` with adapter blocks, or errors
- Errors: `UnknownPort`, `NoAdapterFound`

**Pass 3: Indexing**
```typescript
// src/graph/passes/pass3-indexing.ts
export interface Pass3Result {
  readonly kind: 'ok';
  readonly patch: NormalizedPatch;
}
export interface Pass3Error {
  readonly kind: 'error';
  readonly errors: readonly IndexingError[];
}
export function pass3Indexing(patch: Patch): Pass3Result | Pass3Error
```
- Input: `Patch` (from Pass 2)
- Output: `NormalizedPatch` with dense indices
- Errors: `DanglingEdge`, `DuplicateBlockId`

### Orchestrator

```typescript
// src/graph/passes/index.ts
export function runNormalizationPasses(patch: Patch): NormalizeResult | NormalizeError {
  // Pass 0
  const p0 = pass0PolymorphicTypes(patch);

  // Pass 1
  const p1 = pass1DefaultSources(p0);

  // Pass 2
  const p2Result = pass2Adapters(p1);
  if (p2Result.kind === 'error') {
    return { kind: 'error', errors: p2Result.errors };
  }

  // Pass 3
  const p3Result = pass3Indexing(p2Result.patch);
  if (p3Result.kind === 'error') {
    return { kind: 'error', errors: p3Result.errors };
  }

  return { kind: 'ok', patch: p3Result.patch };
}
```

### Backward Compatibility

```typescript
// src/graph/normalize.ts (updated)
export { runNormalizationPasses as normalize } from './passes';
export type { NormalizedPatch, NormalizedEdge, BlockIndex } from './passes';
export type { NormalizeResult, NormalizeError, NormError } from './passes';
export { getInputEdges, getOutputEdges } from './passes/pass3-indexing';
```

---

## What Changes

### Files to Create

| File | Lines (est.) | Content |
|------|--------------|---------|
| `src/graph/passes/index.ts` | ~50 | Orchestrator + re-exports |
| `src/graph/passes/pass0-polymorphic-types.ts` | ~100 | Extract lines 181-273 |
| `src/graph/passes/pass1-default-sources.ts` | ~120 | Extract lines 73-164, 278-302 |
| `src/graph/passes/pass2-adapters.ts` | ~180 | Extract lines 308-496 |
| `src/graph/passes/pass3-indexing.ts` | ~120 | Extract lines 517-580, query helpers |

### Files to Modify

| File | Changes |
|------|---------|
| `src/graph/normalize.ts` | Replace with thin wrapper (re-exports) |

### Files NOT Modified

| File | Reason |
|------|--------|
| `src/compiler/*` | Compiler unchanged - still imports from `src/graph/normalize` |
| `src/graph/adapters.ts` | Adapter registry unchanged |
| `src/graph/Patch.ts` | Patch types unchanged |

---

## Benefits

1. **Testability**: Each pass can be unit tested independently
2. **Clarity**: Each file has single responsibility
3. **Extensibility**: New passes can be added without touching others
4. **Debugging**: Easier to trace which pass caused an issue
5. **Documentation**: Pass boundaries make data flow explicit

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Import cycles | Low | Medium | Passes only import types from Patch.ts |
| Helper duplication | Low | Low | Share via internal utils if needed |
| Type exports break | Low | High | Re-export all types from normalize.ts |

---

## Implementation Checklist

- [ ] Create `src/graph/passes/` directory
- [ ] Create `pass0-polymorphic-types.ts`
- [ ] Create `pass1-default-sources.ts`
- [ ] Create `pass2-adapters.ts`
- [ ] Create `pass3-indexing.ts`
- [ ] Create `passes/index.ts` orchestrator
- [ ] Update `normalize.ts` to re-export
- [ ] Run `npm run typecheck`
- [ ] Run `npm run test`
- [ ] Run `npm run build`

---

## Summary

This is a **pure refactoring** of `src/graph/normalize.ts`:
- Split 607-line monolith into 4 focused pass files
- Create orchestrator in `passes/index.ts`
- Keep backward compatibility via re-exports
- **No compiler changes**
- **No functionality changes**
- **All tests should pass unchanged**
