# Implementation Context: valueexpr-consumer

Generated: 2026-01-30T21:10:00
Confidence: MEDIUM (P0, P1), LOW (P2)
Source: EVALUATION-20260130-203000.md
Plan: SPRINT-20260130-211000-valueexpr-consumer-PLAN.md

## Dispatch Surfaces (Current State)

### 1. SignalEvaluator dispatch (`src/runtime/SignalEvaluator.ts:134`)

```typescript
function evaluateSigExpr(expr: SigExpr, signals: readonly SigExpr[], state: RuntimeState): number {
  switch (expr.kind) {
    case 'const':     // -> ValueExpr 'const'
    case 'slot':      // -> NO VALUEEXPR EQUIVALENT
    case 'time':      // -> ValueExpr 'time'
    case 'external':  // -> ValueExpr 'external'
    case 'map':       // -> ValueExpr 'kernel' (kernelKind: 'map')
    case 'zip':       // -> ValueExpr 'kernel' (kernelKind: 'zip')
    case 'stateRead': // -> ValueExpr 'state'
    case 'shapeRef':  // -> ValueExpr 'shapeRef'
    case 'reduceField': // -> ValueExpr 'kernel' (kernelKind: 'reduce')
    case 'eventRead': // -> ValueExpr 'eventRead'
  }
}
```

Called from: `evaluateSignal(sigId: SigExprId, signals: readonly SigExpr[], state)` at line 79
Called by: `ScheduleExecutor.ts` in `evalSig` step (line 226)

### 2. Materializer dispatch (`src/runtime/Materializer.ts:288`)

```typescript
// Inside fillBuffer()
switch (expr.kind) {
  case 'const':          // -> ValueExpr 'const' (cardinality many)
  case 'intrinsic':      // -> ValueExpr 'intrinsic' (property)
  case 'placement':      // -> ValueExpr 'intrinsic' (placement)
  case 'broadcast':      // -> ValueExpr 'kernel' (broadcast)
  case 'map':            // -> ValueExpr 'kernel' (map)
  case 'zip':            // -> ValueExpr 'kernel' (zip)
  case 'zipSig':         // -> ValueExpr 'kernel' (zipSig)
  case 'stateRead':      // -> ValueExpr 'state' (cardinality many)
  case 'pathDerivative':  // -> ValueExpr 'kernel' (pathDerivative)
}
```

Called from: `materialize()` at ~line 200
Called by: `ScheduleExecutor.ts` in `materialize` step (line 268-288)

### 3. EventEvaluator dispatch (`src/runtime/EventEvaluator.ts:36`)

```typescript
switch (expr.kind) {
  case 'const':   // -> ValueExpr 'event' (eventKind: 'const')
  case 'never':   // -> ValueExpr 'event' (eventKind: 'never')
  case 'pulse':   // -> ValueExpr 'event' (eventKind: 'pulse')
  case 'combine': // -> ValueExpr 'event' (eventKind: 'combine')
  case 'wrap':    // -> ValueExpr 'event' (eventKind: 'wrap')
}
```

Called by: `ScheduleExecutor.ts` in `evalEvent` step

## Key Type References

### Legacy expression types (`src/compiler/ir/types.ts`)
- `SigExpr` (line 84): 10 variants, discriminated on `kind`
- `FieldExpr` (line 213): 9 variants, discriminated on `kind`
- `EventExpr` (line 310): 5 variants, discriminated on `kind`

### New canonical type (`src/compiler/ir/value-expr.ts`)
- `ValueExpr` (line 78): 9 variants, discriminated on `kind`
- Sub-discriminants: `kernelKind` on kernel, `eventKind` on event, `intrinsicKind` on intrinsic

### Program IR (`src/compiler/ir/program.ts`)
- `program.signalExprs.nodes: SigExpr[]` -- dense array indexed by SigExprId
- `program.fieldExprs.nodes: FieldExpr[]` -- dense array indexed by FieldExprId
- `program.eventExprs` -- event expressions (check exact structure)

### Schedule step types (`src/compiler/ir/types.ts`)
Step variants that reference expression IDs:
- `StepEvalSig`: `expr: SigExprId, target: ValueSlot`
- `StepMaterialize`: `field: FieldExprId, target: ValueSlot`
- `StepEvalEvent`: `event: EventExprId`
- `StepStateWrite`: `source: SigExprId, stateSlot: StateSlotId`

These all need updating if expression IDs merge into ValueExprId.

### RuntimeState cache (`src/runtime/RuntimeState.ts`)
- `state.cache.sigValues: Float64Array` indexed by `SigExprId as number`
- `state.cache.sigStamps: Uint32Array` indexed by `SigExprId as number`
- Field buffers cached in `state.values.objects` map
- Event results are not cached (boolean, cheap to recompute)

## IRBuilder Methods That Emit Expressions

Located in `src/compiler/ir/IRBuilder.ts`. Key methods to audit:

**Signal builders** (emit SigExpr):
- `addSignalConst()`
- `addSignalSlot()`
- `addSignalTime()`
- `addSignalExternal()`
- `addSignalMap()`
- `addSignalZip()`
- `addSignalStateRead()`
- `addSignalShapeRef()`
- `addSignalReduceField()`
- `addSignalEventRead()`

**Field builders** (emit FieldExpr):
- `addFieldConst()`
- `addFieldIntrinsic()`
- `addFieldPlacement()`
- `addFieldBroadcast()`
- `addFieldMap()`
- `addFieldZip()`
- `addFieldZipSig()`
- `addFieldStateRead()`
- `addFieldPathDerivative()`

**Event builders** (emit EventExpr):
- `addEventConst()`
- `addEventPulse()`
- `addEventWrap()`
- `addEventCombine()`
- `addEventNever()`

Total: ~24 builder methods that would need dual-emit or replacement.

## Migration Strategy Options

### Option A: Dual-emit (incremental, safe)
1. Add `program.valueExprs: ValueExpr[]` alongside legacy arrays
2. Each builder method emits BOTH legacy and ValueExpr
3. Migrate consumers one at a time (SignalEvaluator first)
4. Once all consumers use ValueExpr, delete legacy arrays
- **Pro**: Safe, testable, reversible at each step
- **Con**: Temporary memory overhead, ID confusion risk, long migration window

### Option B: Big-bang replacement (atomic, risky)
1. Replace SigExpr/FieldExpr/EventExpr with ValueExpr in one commit
2. Update all builders, all evaluators, all step types simultaneously
3. Single migration commit
- **Pro**: No dual types, clean cut
- **Con**: Large change, hard to review, all-or-nothing

### Option C: Adapter pattern (hybrid)
1. Keep legacy arrays and builders
2. Add thin adapter functions: `sigExprToValueExpr(e: SigExpr): ValueExpr`
3. Evaluators accept ValueExpr, convert on entry during migration
4. Once stable, push conversion into builders and remove adapters
- **Pro**: Evaluator migration is isolated, builders don't change yet
- **Con**: Runtime conversion overhead during migration, adapter is temporary shim

## SigExprSlot Analysis

`SigExprSlot` represents a direct slot read: `{ kind: 'slot', slot: ValueSlot, type: CanonicalType }`.
It is emitted by `addSignalSlot()` in IRBuilder.

In ValueExpr, slots are "materialization details, not expressions" (from LEGACY_MAPPING comment).
The slot read could be:
- **Moved to ScheduleExecutor**: The `evalSig` step already has `step.target` (output slot). Slot-to-slot reads could become a step kind instead of an expression kind.
- **Kept as special case**: Add a `ValueExprSlotRead` variant (contradicts the design decision to exclude it).
- **Eliminated**: If the compiler can always inline the source expression instead of creating a slot indirection.

Research task: Find all sites where `addSignalSlot()` is called to understand why slot reads exist.
```bash
grep -rn "addSignalSlot\|SigExprSlot\|kind: 'slot'" src/ --include="*.ts" | grep -v __tests__ | grep -v node_modules
```
