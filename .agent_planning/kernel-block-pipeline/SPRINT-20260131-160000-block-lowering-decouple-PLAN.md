# Sprint: block-lowering-decouple — Direct ValueExpr Emission from Blocks
Generated: 2026-01-31-160000 (Corrected - HIGH PRIORITY)
Confidence: HIGH: 2, MEDIUM: 1, LOW: 0
Status: READY FOR IMPLEMENTATION (after Sprint 1)

## Sprint Goal
Eliminate the legacy IR (SigExpr/FieldExpr/EventExpr) by making blocks emit ValueExpr directly. This unblocks all kernel and block development work. The legacy IR is a blocker that must be removed before new features can proceed.

## Scope
**Deliverables:**
1. ValueExprBuilder for direct ValueExpr emission
2. Migrate block lowering to use ValueExprBuilder
3. Delete legacy IR types (SigExpr, FieldExpr, EventExpr)
4. Delete lowerToValueExprs.ts (no longer needed)

## Work Items

### WI-1: Create ValueExprBuilder [HIGH]

**Location**: New file `src/compiler/ir/ValueExprBuilder.ts`

**API** (parallel to IRBuilder):
```typescript
class ValueExprBuilder {
  private nodes: ValueExpr[] = [];
  private nextId: number = 0;

  // Const
  emitConst(value: ConstValue, type: CanonicalType): ValueExprId {
    const id = this.nextId++ as ValueExprId;
    this.nodes.push({
      op: 'const',
      id,
      type,
      value
    });
    return id;
  }

  // Kernel (all categories)
  emitKernel(
    kernelName: string,
    kernelKind: 'map' | 'zip' | 'zipSig' | 'broadcast' | 'reduce' | 'pathDerivative',
    inputs: ValueExprId[],
    type: CanonicalType,
    /* additional kernel-specific params */
  ): ValueExprId {
    const id = this.nextId++ as ValueExprId;
    this.nodes.push({
      op: 'kernel',
      id,
      type,
      kernelName,
      kernelKind,
      inputs,
      /* ... */
    });
    return id;
  }

  // Intrinsic
  emitIntrinsic(
    intrinsicKind: 'property' | 'placement',
    propertyName?: IntrinsicPropertyName,
    placementBasis?: PlacementBasis,
    type: CanonicalType
  ): ValueExprId { /* ... */ }

  // SlotRead
  emitSlotRead(slotIndex: number, type: CanonicalType): ValueExprId { /* ... */ }

  // Time
  emitTime(timeSignal: TimeSignalKind, type: CanonicalType): ValueExprId { /* ... */ }

  // External
  emitExternal(channelId: ExternalChannelId, type: CanonicalType): ValueExprId { /* ... */ }

  // State
  emitState(stateId: StateId, type: CanonicalType): ValueExprId { /* ... */ }

  // Event
  emitEvent(
    eventKind: 'const' | 'pulse' | 'wrap' | 'combine' | 'never',
    /* event-specific params */
    type: CanonicalType
  ): ValueExprId { /* ... */ }

  // ShapeRef
  emitShapeRef(shapeId: ShapeId, type: CanonicalType): ValueExprId { /* ... */ }

  // EventRead
  emitEventRead(eventId: EventExprId, type: CanonicalType): ValueExprId { /* ... */ }

  // Build final table
  build(): ValueExprTable {
    return {
      nodes: this.nodes,
      // Note: sigToValue, fieldToValue, eventToValue mappings not needed
      // (those were for legacy IR compatibility)
    };
  }
}
```

**Design decisions**:
- Unified API (no separate emitSig*/emitField*/emitEvent* methods)
- `CanonicalType` required on every emit (enforces single type system)
- No legacy IR concepts (no SigExprId, FieldExprId, EventExprId)
- Builder pattern (accumulate nodes, then build table)

**Acceptance Criteria:**
- [ ] `ValueExprBuilder` class exists with all emit methods
- [ ] At least one block compiles through ValueExprBuilder (proof of concept)
- [ ] Builder API is type-safe (no `any` casts)
- [ ] Unit tests for ValueExprBuilder in `src/compiler/ir/__tests__/`

**Technical Notes:**
- The builder accumulates ValueExpr nodes in an array
- Each emit method assigns a new ValueExprId and returns it
- The builder does NOT resolve kernel handles (that's Sprint 2.5)

### WI-2: Migrate block lowering to use ValueExprBuilder [MEDIUM]

**Current**: `pass6-block-lowering.ts` uses `IRBuilder` → emits SigExpr/FieldExpr/EventExpr

**New**: `pass6-block-lowering.ts` uses `ValueExprBuilder` → emits ValueExpr directly

**Migration strategy**:
1. Add `ValueExprBuilder` as alternative to `IRBuilder` in pass6 context
2. For each block type, replace IRBuilder calls with ValueExprBuilder calls
3. Validate output (same execution behavior)
4. Once all blocks migrated, remove IRBuilder

**Example migration** (MathOp block):
```typescript
// Before (IRBuilder):
function lowerMathOp(ctx: LoweringContext, block: Block): void {
  const a = ctx.builder.emitSigSlotRead(block.inputs.a);
  const b = ctx.builder.emitSigSlotRead(block.inputs.b);
  const result = ctx.builder.emitSigKernelZip(block.params.op, a, b);
  ctx.setBlockOutput(block.id, 'output', result);
}

// After (ValueExprBuilder):
function lowerMathOp(ctx: LoweringContext, block: Block): void {
  const a = ctx.valueBuilder.emitSlotRead(block.inputs.a.slotIndex, signalType);
  const b = ctx.valueBuilder.emitSlotRead(block.inputs.b.slotIndex, signalType);
  const result = ctx.valueBuilder.emitKernel(
    block.params.op,  // e.g., 'add', 'mul'
    'zip',
    [a, b],
    signalType
  );
  ctx.setBlockOutput(block.id, 'output', result);
}
```

**Acceptance Criteria:**
- [ ] All block types compile through ValueExprBuilder
- [ ] `npm run test` passes (all existing tests)
- [ ] Visual output unchanged (render comparison)
- [ ] No IRBuilder calls remain in pass6

**Technical Notes:**
- Some blocks may need refactoring (e.g., if they relied on legacy IR quirks)
- Slot index resolution may need adjustment (legacy IR had implicit mappings)

### WI-3: Delete legacy IR and lowerToValueExprs [HIGH]

**Files to delete**:
- Legacy IR type definitions in `src/compiler/ir/types.ts` (SigExpr, FieldExpr, EventExpr unions)
- `src/compiler/ir/lowerToValueExprs.ts` (entire file)
- `src/compiler/ir/IRBuilder.ts` (replaced by ValueExprBuilder)

**After deletion**:
- Remove from compiler pipeline (compile.ts no longer calls lowerToValueExprs)
- Remove from exports
- Remove from any test imports

**Acceptance Criteria:**
- [ ] No SigExpr/FieldExpr/EventExpr types in codebase
- [ ] No lowerToValueExprs.ts file
- [ ] No IRBuilder.ts file
- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] Grep verification: no legacy IR symbols remain

**Technical Notes:**
- This is the payoff: legacy IR completely eliminated
- Compilation now goes: Block → ValueExpr (direct)
- No intermediate translation layer

## Dependencies
- Sprint 1 (kill-legacy-surfaces) should be done first (removes RenderAssembler legacy dependency)
- No other dependencies

## Risks
- **Block lowering complexity**: Pass6 is ~2000 LOC. Touching all blocks is high-risk. Mitigation: Migrate incrementally, validate per-block, keep rollback option.
- **Type system integration**: ValueExpr requires CanonicalType everywhere. Legacy IR had some implicit type inference. Mitigation: Make types explicit during migration, add validation.
- **Slot index resolution**: Legacy IR had implicit slot mappings. ValueExpr requires explicit slot indices. Mitigation: Document slot resolution strategy, validate all blocks.

## Success Criteria

This sprint is complete when:
1. All blocks emit ValueExpr directly (no legacy IR)
2. Legacy IR types deleted
3. lowerToValueExprs.ts deleted
4. All tests pass
5. Rendering works (visual verification)

**This unblocks**: Sprint 2 (kernel registry), Sprint 4 (new kernels), all future block development.
