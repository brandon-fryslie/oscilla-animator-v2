# PlacementBasis - Definition of Done

> **Topic**: placement-basis
> **Created**: 2026-01-27
> **Status**: APPROVED (user decisions resolved in PLAN.md)

---

## Success Criteria

When this implementation is complete:

1. **Velocity snaps eliminated**: When N changes, existing elements don't move
2. **New layouts use PlacementBasis**: CircleLayoutUV, LineLayoutUV, GridLayoutUV blocks work
3. **Deterministic**: Same instanceId produces same PlacementBasis values
4. **Hot-swap safe**: PlacementBasis survives recompilation
5. **No inline allocation**: Buffer pools used exclusively
6. **Hard errors on missing values**: All internal APIs validate parameters
7. **Tests**: Full coverage with tests for each sprint

---

## Sprint Acceptance Criteria

### Sprint 1: Type Foundation + Tests
- [ ] `MAX_ELEMENTS` constant exported (10,000) from `src/runtime/PlacementBasis.ts`
- [ ] `PlacementFieldName` type (`'uv' | 'rank' | 'seed'`) exported from `src/compiler/ir/types.ts`
- [ ] `BasisKind` type (`'halton2D' | 'random' | 'spiral' | 'grid'`) exported from `src/compiler/ir/types.ts`
- [ ] `PlacementBasisBuffers` interface exported from `src/runtime/PlacementBasis.ts`
- [ ] `placementBasis` map added to ContinuityState
- [ ] Tests verify hard errors on missing required values
- [ ] TypeScript compiles without errors

### Sprint 2: Generation + Tests
- [ ] `halton`, `halton2D` functions produce values in [0,1]
- [ ] `generateRank` produces values in [0,1) with good distribution
- [ ] `generateSeed` is deterministic and varies by instance/index
- [ ] `generateUV` handles all BasisKind values with exhaustive switch
- [ ] All functions throw on missing required parameters
- [ ] All tests pass

### Sprint 3: Materialization + Tests
- [ ] `FieldExprPlacement` interface defined with all required fields
- [ ] `FieldExpr` union updated to include `FieldExprPlacement`
- [ ] `IRBuilder.fieldPlacement()` method added with parameter validation
- [ ] `fillPlacementBasis` fills all three arrays deterministically
- [ ] `ensurePlacementBasis` pre-allocates to MAX_ELEMENTS
- [ ] Materializer handles 'placement' kind with exhaustive switch
- [ ] All functions throw on missing required parameters
- [ ] All tests pass

### Sprint 4: Layout Kernels + Tests
- [ ] `circleLayoutUV` kernel implemented and tested
- [ ] `lineLayoutUV` kernel implemented and tested
- [ ] `gridLayoutUV` kernel implemented and tested
- [ ] All kernels throw on missing required signals
- [ ] All tests pass

### Sprint 5: New Layout Blocks + Tests
- [ ] `CircleLayoutUV` block registered with `basisKind` input parameter
- [ ] `LineLayoutUV` block registered
- [ ] `GridLayoutUV` block registered
- [ ] All new blocks use `fieldPlacement()` instead of `fieldIntrinsic()`
- [ ] Old layout blocks have `@deprecated` JSDoc comments
- [ ] All tests pass

### Sprint 6: Persistence & Hot-Swap + Tests
- [ ] `placementBasis` map initialized in ContinuityState
- [ ] PlacementBasis survives frame boundaries
- [ ] PlacementBasis survives hot-swap via `migratePlacementBasis`
- [ ] BasisKind change triggers buffer recreation
- [ ] All tests pass

### Sprint 7: Velocity Continuity Integration Tests
- [ ] Test proves UV values unchanged when count increases
- [ ] Test proves positions unchanged when count increases
- [ ] Test proves velocity preserved (C1 continuity)
- [ ] Test proves new elements don't affect existing
- [ ] Test proves determinism across runs
- [ ] Comparison test demonstrates old vs new behavior
- [ ] All tests pass

---

## Deferred Work

The following is explicitly deferred until new layouts have full gauge-invariant continuity:

- **Compiler Validation**: Add validation pass to forbid `index`/`normalizedIndex` intrinsics in layout blocks

---

## Constraints (from User)

1. **Write NEW layouts** - leave existing layouts in place (no migration)
2. **Defer compiler validation** - comes AFTER new layouts proven
3. **Comment deprecated code clearly** - `@deprecated` JSDoc on old layouts
4. **Test as you go** - each sprint includes its own tests
5. **Use buffer pools exclusively** - no inline allocation in render pipeline
6. **Modular & composable** - pure functions, side-effects at boundaries
7. **No arbitrary defaults** - hard errors on missing values (with tests)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/runtime/PlacementBasis.ts` | Constants, types, generators, allocator |
| `src/runtime/__tests__/PlacementBasis.test.ts` | Unit tests |
| `src/runtime/__tests__/velocity-continuity.test.ts` | Integration tests |
| `src/blocks/__tests__/layout-blocks-uv.test.ts` | Block registration tests |

## Files to Modify

| File | Changes |
|------|---------|
| `src/compiler/ir/types.ts` | Add PlacementFieldName, BasisKind, FieldExprPlacement |
| `src/compiler/ir/IRBuilder.ts` | Add fieldPlacement() interface |
| `src/compiler/ir/IRBuilderImpl.ts` | Implement fieldPlacement() |
| `src/runtime/Materializer.ts` | Add 'placement' case |
| `src/runtime/FieldKernels.ts` | Add circleLayoutUV, lineLayoutUV, gridLayoutUV |
| `src/runtime/ContinuityState.ts` | Add placementBasis map |
| `src/runtime/StateMigration.ts` | Add migratePlacementBasis |
| `src/blocks/instance-blocks.ts` | Add new UV blocks, deprecation comments |
