# Oscilla IR: Missing Primitives Master Index

**Date:** 2025-12-28
**Status:** PROPOSED
**Total Gaps Identified:** 74

---

## Executive Summary

The Oscilla IR system has a well-designed schema but significant implementation gaps. The compiler emits placeholder IR that doesn't match actual patch logic, and many IR node types lack runtime evaluators.

**Root Cause:** The system was designed for IR-first but implemented closure-first. The IR path was added incrementally, leaving gaps where closures handle what IR cannot.

## Backlog Checklist
- [ ] Phase 1: Make IR execute (Tier 0)
- [ ] Phase 2: Core features (Tier 1a)
- [ ] Phase 3: Complete features (Tier 1b)
- [ ] Phase 4: Polish (Tier 2)
- [ ] Phase 5: New features (Tier 3)

---

## Gap Categories

| Category | Critical | High | Medium | Spec File |
|----------|----------|------|--------|-----------|
| Field-Signal Combination | 2 | 2 | 0 | `SPEC-01-field-signal-combination.md` |
| Field Runtime | 2 | 3 | 2 | `SPEC-02-field-runtime.md` |
| Signal Runtime | 1 | 2 | 2 | `SPEC-03-signal-runtime.md` |
| Render Pipeline | 3 | 2 | 5 | `SPEC-04-render-pipeline.md` |
| Time Architecture | 4 | 1 | 1 | `SPEC-05-time-architecture.md` |
| Type System | 2 | 2 | 2 | `SPEC-06-type-system.md` |
| Bus System | 2 | 1 | 1 | `SPEC-07-bus-system.md` |
| Default Sources | 3 | 0 | 2 | `SPEC-08-default-sources.md` |
| Compiler Passes | 2 | 3 | 3 | `SPEC-09-compiler-passes.md` |
| Export Pipeline | 2 | 2 | 2 | `SPEC-10-export-pipeline.md` |
| Debug System | 1 | 2 | 3 | `SPEC-11-debug-system.md` |

---

## Priority Tiers

### Tier 0: Core Execution Broken (Must Fix)

These prevent basic IR execution:

1. **Bus evaluation never runs** - `busEval` steps never emitted
2. **Transform chains throw** - Field transforms not implemented
3. **TimeModel hardcoded** - Always infinite, ignoring TimeRoot
4. **Default sources ignored** - Pass 8 doesn't materialize them
5. **Signal table may be null** - Runtime crashes if missing

### Tier 1: Major Features Non-Functional

These prevent significant use cases:

1. **Field-signal combination** - JitterVec2, FieldMapVec2 can't lower
2. **Color operations** - No HSL-to-RGB in IR
3. **Stateful signals** - delay, pulseDivider, envelopeAD stubs
4. **Field reduce** - Placeholder emits wrong IR
5. **Path fields** - Only const supported
6. **Adapters/lenses** - Not applied in IR mode

### Tier 2: Edge Cases and Polish

These affect specific scenarios:

1. **Non-numeric field combine** - Only numbers work
2. **Domain element IDs** - hash01ById uses fallback
3. **Cache invalidation** - Stale handles after hot-swap
4. **Z-order ignored** - Render order undefined
5. **PostFX not implemented** - Skipped silently

### Tier 3: Future Features

These don't exist yet:

1. **Export pipeline** - Entire feature missing
2. **Deterministic replay** - No seed/state serialization
3. **IR-compatible debug** - No DebugDisplay in IR

---

## Implementation Order Recommendation

### Phase 1: Make IR Execute (Tier 0)
1. Emit `busEval` steps in schedule
2. Implement field transform chain evaluation
3. Wire TimeModel from Pass 3 to IRBuilder
4. Materialize default sources in Pass 8
5. Guarantee signalTable presence

### Phase 2: Core Features (Tier 1a)
1. Add `FieldExprZipSig` for field-signal combination
2. Add `FieldExprMapIndexed` for indexed patterns
3. Implement ColorHSLToRGB kernel

### Phase 3: Complete Features (Tier 1b)
1. Implement stateful signal evaluators
2. Fix field reduce to use actual field input
3. Support dynamic path fields
4. Apply adapters/lenses in IR mode

### Phase 4: Polish (Tier 2)
1. Support non-numeric field combine
2. Propagate domain element IDs
3. Add cache invalidation on schema change
4. Implement z-order sorting
5. Add PostFX support

### Phase 5: New Features (Tier 3)
1. Design export pipeline
2. Add deterministic replay
3. Port debug system to IR

---

## Cross-Cutting Concerns

### Type System Fragmentation

Two incompatible `TypeDesc` definitions exist:
- `compiler/ir/types.ts` - worlds: signal, field, scalar, event
- `editor/ir/types/TypeDesc.ts` - worlds: signal, field, scalar, event, config, special

**Resolution:** Unify on one definition, add migration.

### Placeholder Pattern

Many passes emit placeholders:
- Pass 6: `sigTimeAbsMs` for all signals, `fieldConst(0)` for fields
- Pass 8: Acknowledges defaults but doesn't materialize
- IRBuilder: `reduceFieldToSig` ignores field input

**Resolution:** Each spec addresses its placeholders.

### Legacy/IR Split

Blocks have both paths:
- Legacy: `compile()` returns closures
- IR: `lower()` emits IR nodes

**Migration Strategy:**
1. Fix IR gaps so both paths produce equivalent results
2. Add integration tests comparing outputs
3. Deprecate legacy path once IR is complete

---

## Spec Documents

1. **SPEC-01-field-signal-combination.md** - FieldExprZipSig, FieldExprMapIndexed
2. **SPEC-02-field-runtime.md** - Transform chains, reduce, paths, combine
3. **SPEC-03-signal-runtime.md** - Stateful ops, time handling, non-numeric
4. **SPEC-04-render-pipeline.md** - Attributes, clipping, materials, PostFX
5. **SPEC-05-time-architecture.md** - TimeModel, wrap detection, TimeRoot
6. **SPEC-06-type-system.md** - Conversion paths, adapters, type unification
7. **SPEC-07-bus-system.md** - Bus evaluation, event buses
8. **SPEC-08-default-sources.md** - IR integration, materialization
9. **SPEC-09-compiler-passes.md** - Pass-specific fixes
10. **SPEC-10-export-pipeline.md** - New feature design
11. **SPEC-11-debug-system.md** - IR-compatible debugging

---

## Metrics

After all specs implemented:

| Metric | Current | Target |
|--------|---------|--------|
| IR-compatible blocks | ~40% | 95% |
| Silent failures | ~20 | 0 |
| Placeholder emissions | ~15 | 0 |
| Closure-only blocks | ~10 | 2 (FieldFromExpression, DebugDisplay) |
| Test coverage for IR path | ~60% | 90% |

---

## Next Steps

1. Review and prioritize specs
2. Create implementation tasks from specs
3. Execute in priority order
4. Add integration tests as features complete
