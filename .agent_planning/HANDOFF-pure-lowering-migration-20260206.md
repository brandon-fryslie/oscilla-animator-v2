# Handoff: Pure Lowering Migration - Block Migrations

**Created**: 2026-02-06 15:00:00
**For**: Next implementation agent
**Status**: Ready to start - Infrastructure complete

---

## Objective

Migrate the final 5 blocks to pure lowering by using `construct()` expressions instead of imperative `stepSlotWriteStrided()` calls, achieving 100% pure lowering coverage.

## Current State

### What's Been Done ✅

1. **WI-0: Runtime construct() Support** ✅ COMPLETE
   - Implemented `evaluateConstructSignal()` in ValueExprSignalEvaluator.ts
   - Updated ScheduleExecutor.ts to handle stride>1 construct expressions
   - Added comprehensive tests (5/5 passing)
   - Runtime can now evaluate multi-component signals (vec2, vec3, color) via construct()

2. **WI-1: Type-Level Pure Lowering Enforcement** ✅ COMPLETE
   - Created `BlockIRBuilder` interface (pure surface for blocks)
   - Created `OrchestratorIRBuilder` interface (full surface for orchestrator)
   - Updated `LowerCtx.b` to use `BlockIRBuilder`
   - Removed impure methods from block-visible surface:
     - `allocSlot()`, `allocTypedSlot()`, `registerSigSlot()`, `registerSlotType()`, `registerFieldSlot()`
     - `stepSlotWriteStrided()`, `stepStateWrite()`, `stepFieldStateWrite()`, `stepEvalSig()`, `stepMaterialize()`
   - Updated orchestrator files (binding-pass.ts, lower-blocks.ts, combine-utils.ts) to use `OrchestratorIRBuilder`
   - **Type errors now prevent blocks from calling impure methods** ✅

### What's In Progress

**Nothing** - Infrastructure is complete, ready for block migrations.

### What Remains

**5 blocks need migration** (37 type errors total):

1. **const.ts** (8 errors) - Uses `allocSlot()` and `stepSlotWriteStrided()` for vec2/vec3/color
2. **expression.ts** (6 errors) - Uses `allocSlot()` and `stepSlotWriteStrided()` for multi-component results
3. **external-vec2.ts** (2 errors) - Uses `allocSlot()` and `stepSlotWriteStrided()` for vec2
4. **default-source.ts** (6 errors) - Uses `allocSlot()` and `registerSigSlot()` (may need architectural review)
5. **infinite-time-root.ts** (1 error) - Uses `registerSlotType()` (likely simple fix)

**15 helper function signatures** need updating from `IRBuilder` → `BlockIRBuilder`:
- broadcast.ts, circle-layout-uv.ts, grid-layout-uv.ts, path-field.ts, add.ts, divide.ts, modulo.ts, multiply.ts, subtract.ts

**1 test fix**: construct-signal.test.ts (missing time fields: tAbsMs, pulse)

## Context & Background

### Why We're Doing This

**Pure lowering** enables blocks to be reusable, composable IR libraries. Blocks return declarative effects (data) instead of imperatively mutating the builder. This makes block lowering:
- Deterministic (same inputs → same output)
- Testable (no side effects)
- Reusable (can be used as macro expansion)
- Safe (type system enforces purity)

### Key Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Use construct() for multi-component signals | Evaluator handles stride>1, no special schedule steps | 2026-02-06 |
| Split BlockIRBuilder / OrchestratorIRBuilder | Type-level enforcement, zero runtime cost | 2026-02-06 |
| Remove stepSlotWriteStrided from blocks | Violates pure lowering contract | 2026-02-06 |
| Keep stepSlotWriteStrided in orchestrator | Orchestrator needs it for legacy compatibility | 2026-02-06 |

### Important Constraints

- **NO SHORTCUTS**: Do not work around type errors with `as any` casts
- **Runtime must support construct()**: Already implemented and tested ✅
- **Blocks ONLY see BlockIRBuilder**: Type system enforces this ✅
- **Orchestrator has full OrchestratorIRBuilder access**: Already updated ✅
- **All tests must pass**: Especially construct-signal.test.ts

## Acceptance Criteria

- [ ] All 5 blocks migrated to use construct() pattern
- [ ] All 37 type errors resolved
- [ ] No `as any` casts introduced
- [ ] All existing tests pass
- [ ] construct-signal.test.ts passes
- [ ] Simple demo works (multi-component signals render correctly)
- [ ] `npm run typecheck` produces zero errors

## Scope

### Files to Modify

**Core blocks (4 similar patterns)**:
- `src/blocks/signal/const.ts` - Migrate vec2/vec3/color to construct()
- `src/blocks/math/expression.ts` - Migrate multi-component results to construct()
- `src/blocks/io/external-vec2.ts` - Migrate vec2 external to construct()
- `src/blocks/signal/default-source.ts` - Migrate or mark as 'impure' (needs review)

**Simple fix**:
- `src/blocks/time/infinite-time-root.ts` - Remove `registerSlotType()` call

**Helper functions** (update signatures):
- `src/blocks/field/broadcast.ts`
- `src/blocks/layout/circle-layout-uv.ts`
- `src/blocks/layout/grid-layout-uv.ts`
- `src/blocks/shape/path-field.ts`
- `src/blocks/math/add.ts`, `divide.ts`, `modulo.ts`, `multiply.ts`, `subtract.ts`

**Test fix**:
- `src/runtime/__tests__/construct-signal.test.ts` - Add missing time fields

### Related Components

**Infrastructure (already complete)**:
- `src/compiler/ir/BlockIRBuilder.ts` - Pure interface
- `src/compiler/ir/OrchestratorIRBuilder.ts` - Full interface
- `src/compiler/ir/IRBuilderImpl.ts` - Implementation
- `src/runtime/ValueExprSignalEvaluator.ts` - construct() support
- `src/runtime/ScheduleExecutor.ts` - stride>1 handling

### Out of Scope

- **Do NOT modify orchestrator files** (already complete)
- **Do NOT change runtime behavior** (already correct)
- **Do NOT add new ESLint rules** (type system already enforces)
- **Do NOT eliminate default-source.ts** (defer to later architectural review)

## Implementation Approach

### Recommended Steps

**Phase 1: Simple Fixes (5 min)**
1. Fix `infinite-time-root.ts` - Remove `registerSlotType()` call (orchest does this now)
2. Fix `construct-signal.test.ts` - Add `tAbsMs` and `pulse` to time state
3. Update helper function signatures - Replace `IRBuilder` with `BlockIRBuilder`

**Phase 2: Core Block Migrations (30 min each)**

For each of const.ts, expression.ts, external-vec2.ts:

1. **Remove imperative calls**:
   ```typescript
   // BEFORE (impure)
   const slot = ctx.b.allocSlot(stride);
   ctx.b.stepSlotWriteStrided(slot, [rSig, gSig, bSig, aSig]);

   // AFTER (pure)
   const constructedSig = ctx.b.construct([rSig, gSig, bSig, aSig], colorType);
   ```

2. **Return expression ID**:
   ```typescript
   return {
     outputs: {
       out: valref(constructedSig, colorType)
     },
     effects: {
       slotRequests: [{ portId: 'out', type: colorType }]
     }
   };
   ```

3. **Test the block**:
   ```bash
   npm run test -- <block-test-file>
   ```

**Phase 3: default-source.ts Review (15 min)**

Option A (Quick): Mark as 'impure' temporarily
```typescript
export const defaultSource = defineBlock({
  // ...
  loweringPurity: 'impure', // TODO: Architectural review needed
});
```

Option B (Proper): Migrate like other blocks if straightforward

### Patterns to Follow

**Const Block Pattern**:
```typescript
// For scalar (no change)
const sig = ctx.b.constant(floatConst(value), floatType);
return valref(sig, floatType);

// For vec2 (NEW)
const xSig = ctx.b.constant(floatConst(value.x), floatType);
const ySig = ctx.b.constant(floatConst(value.y), floatType);
const vec2Sig = ctx.b.construct([xSig, ySig], vec2Type);
return valref(vec2Sig, vec2Type);

// For color (NEW)
const rSig = ctx.b.constant(floatConst(value.r), floatType);
const gSig = ctx.b.constant(floatConst(value.g), floatType);
const bSig = ctx.b.constant(floatConst(value.b), floatType);
const aSig = ctx.b.constant(floatConst(value.a), floatType);
const colorSig = ctx.b.construct([rSig, gSig, bSig, aSig], colorType);
return valref(colorSig, colorType);
```

**Expression Block Pattern**:
```typescript
// If result is multi-component
if (resultType.payload.kind === 'vec2' || resultType.payload.kind === 'vec3' || resultType.payload.kind === 'color') {
  // Build component expressions
  const components: ValueExprId[] = [];
  for (let i = 0; i < stride; i++) {
    components.push(ctx.b.extract(baseExpr, i, floatType));
  }
  const constructedExpr = ctx.b.construct(components, resultType);
  return valref(constructedExpr, resultType);
}
```

### Known Gotchas

1. **Don't forget slotRequests**: Even though orchestrator allocates slots, blocks must declare them via `effects.slotRequests`
2. **construct() is pure**: It doesn't allocate or write anything, just builds an expression node
3. **Orchestrator handles rest**: Binder allocates slots, schedule emits eval steps
4. **Stride is derived**: `payloadStride(type.payload)` determines component count
5. **Helper function signatures**: Many blocks have helper functions that expect `IRBuilder` - update to `BlockIRBuilder`

## Reference Materials

### Planning Documents
- [PURE-LOWERING-TODO.md](PURE-LOWERING-TODO.md) - Original migration status
- [.agent_planning/pure-lowering-migration/WI-0-COMPLETE.md](.agent_planning/pure-lowering-migration/WI-0-COMPLETE.md) - Runtime construct() implementation
- [.agent_planning/pure-lowering-migration/CAPABILITY-SPLIT-COMPLETE.md](.agent_planning/pure-lowering-migration/CAPABILITY-SPLIT-COMPLETE.md) - Type-level enforcement
- [.agent_planning/pure-lowering-migration/EVALUATION-20260206-143000.md](.agent_planning/pure-lowering-migration/EVALUATION-20260206-143000.md) - Project evaluation

### Design Documents
- `design-docs/_new/pure-lowering-blocks/01-macro-lowering.md` - Pure lowering principles
- Lines 206-274 in PURE-LOWERING-TODO.md - Design solution and decision rationale

### Codebase References
- `src/blocks/signal/domain-index.ts` - Example of pure lowering with effects
- `src/runtime/ValueExprSignalEvaluator.ts:47-60` - evaluateConstructSignal() implementation
- `src/runtime/ScheduleExecutor.ts:248-286` - construct() handling in eval step
- `src/runtime/__tests__/construct-signal.test.ts` - construct() tests (currently passing)

### Key Types
- `BlockIRBuilder` - Pure interface (what blocks see)
- `OrchestratorIRBuilder` - Full interface (what orchestrator uses)
- `LowerEffects` - Effects declaration structure
- `CanonicalType` - Type system representation

## Questions & Blockers

### Open Questions
- [ ] Should default-source.ts be marked 'impure' temporarily or migrated now?
- [ ] Are there any other blocks calling helper functions with IRBuilder signature?

### Current Blockers
**NONE** - All infrastructure is complete and working.

### Need User Input On
- **default-source.ts strategy**: Quick fix (mark 'impure') vs proper migration vs architectural elimination

## Testing Strategy

### Existing Tests
- `src/runtime/__tests__/construct-signal.test.ts` - construct() evaluation (5 tests, currently passing)
- Individual block test files - Need to pass after migration
- Integration tests - Should pass with no changes

### New Tests Needed
None - construct() is already tested. Block migrations use existing patterns.

### Manual Testing
- [ ] Run demo - verify multi-component signals render (vec2, color)
- [ ] Check console - no errors or warnings
- [ ] Verify type errors are gone - `npm run typecheck` clean

## Success Metrics

How to validate implementation:

1. **Type check passes**: `npm run typecheck` produces 0 errors
2. **All tests pass**: `npm run test` all green
3. **construct() tests pass**: `npm run test -- construct-signal.test.ts` 5/5
4. **Demo works**: Simple animations with color/vec2 still render
5. **No regressions**: Existing functionality unchanged

---

## Next Steps for Agent

**Immediate actions**:
1. Read this handoff completely
2. Review WI-0-COMPLETE.md and CAPABILITY-SPLIT-COMPLETE.md
3. Run `npm run typecheck` to see current state (37 errors expected)

**Phase 1 (Quick wins - 15 min)**:
1. Fix infinite-time-root.ts (remove registerSlotType call)
2. Fix construct-signal.test.ts (add tAbsMs, pulse fields)
3. Update helper function signatures (IRBuilder → BlockIRBuilder)
4. Run typecheck - should drop to ~25 errors

**Phase 2 (Core migrations - 90 min)**:
1. Migrate const.ts (vec2, vec3, color cases)
2. Migrate expression.ts (multi-component results)
3. Migrate external-vec2.ts (vec2 external)
4. Test each block after migration

**Phase 3 (default-source - 15 min)**:
1. Review default-source.ts code
2. Decide: quick fix or proper migration
3. Implement chosen approach

**Phase 4 (Verification - 15 min)**:
1. Run `npm run typecheck` - expect 0 errors
2. Run `npm run test` - expect all pass
3. Run demo - verify visually
4. Update PURE-LOWERING-TODO.md to reflect completion

**When complete**:
- [ ] Update PURE-LOWERING-TODO.md with "100% COMPLETE"
- [ ] Mark this handoff as complete
- [ ] Create completion summary document

---

## Context Links

**Current branch**: `bmf_type_system_refactor`

**Recent conversation summary**:
- Implemented runtime construct() support (WI-0)
- Split IRBuilder into BlockIRBuilder / OrchestratorIRBuilder (capability split)
- Type system now enforces pure lowering at compile time
- 37 type errors remaining - all in blocks that need migration
- Infrastructure is complete and tested

**Key insight**: The type errors are EXACTLY what we want - they show us what needs to be fixed, and the type system prevents accidental reintroduction of impure patterns.
