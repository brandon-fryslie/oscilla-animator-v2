# Implementation Context: direct-lowering
Generated: 2026-01-31T16:00:00Z

## Architecture: Before → After

### Before (Current)
```
Block.lower() → IRBuilder.sigMap() → SigExpr[]
                IRBuilder.fieldZip() → FieldExpr[]
                IRBuilder.eventPulse() → EventExpr[]
                      ↓
               schedule-program.ts reads legacy tables
                      ↓
               Steps carry SigExprId/FieldExprId/EventExprId
                      ↓
               compile.ts calls lowerToValueExprs()
                      ↓
               ValueExpr[] + translation maps
                      ↓
               ScheduleExecutor translates legacy ID → ValueExprId per step
                      ↓
               evaluateValueExprSignal(veId, ...)
```

### After (Target)
```
Block.lower() → IRBuilder.veKernelZip() → ValueExpr[]
                IRBuilder.veConst() → ValueExpr[]
                      ↓
               schedule-program.ts reads ValueExpr table
                      ↓
               Steps carry ValueExprId
                      ↓
               ScheduleExecutor dispatches directly
                      ↓
               evaluateValueExprSignal(step.expr, ...)
```

## Key Files and Their Roles

### IR Type Definitions
- `src/compiler/ir/value-expr.ts` — **KEEP** as-is. This is the canonical ValueExpr type.
- `src/compiler/ir/types.ts` — **MODIFY**: Remove SigExpr/FieldExpr/EventExpr unions, update Step types to ValueExprId. Keep non-expression types (PureFn, IntrinsicPropertyName, PlacementFieldName, BasisKind, Step, TimeModel, etc.).
- `src/compiler/ir/Indices.ts` — **MODIFY**: Remove SigExprId/FieldExprId/EventExprId. Keep ValueExprId, ValueSlot, StateSlotId, EventSlotId, BlockIndex.

### Builder
- `src/compiler/ir/IRBuilder.ts` — **MODIFY**: Add ve* methods. Eventually remove legacy methods.
- `src/compiler/ir/IRBuilderImpl.ts` — **MODIFY**: Implement ve* methods with ValueExpr[] storage.

### Bridge (DELETE)
- `src/compiler/ir/lowerToValueExprs.ts` — **DELETE** entirely once blocks emit ValueExpr directly. Use as **specification reference** during migration.

### Block Files (11 files, mechanical migration)
All in `src/blocks/`:
- `math-blocks.ts`, `signal-blocks.ts`, `field-blocks.ts`, `field-operations-blocks.ts`
- `geometry-blocks.ts`, `color-blocks.ts`, `path-operators-blocks.ts`
- `adapter-blocks.ts`, `event-blocks.ts`, `expression-blocks.ts`, `test-blocks.ts`

### Schedule & Compiler
- `src/compiler/backend/schedule-program.ts` — **MODIFY**: Read ValueExpr table, emit ValueExprId steps.
- `src/compiler/compile.ts` — **MODIFY**: Remove lowerToValueExprs call, remove legacy table extraction.
- `src/compiler/ir/program.ts` — **MODIFY**: Simplify CompiledProgramIR to single ValueExpr table.

### Runtime
- `src/runtime/ScheduleExecutor.ts` — **MODIFY**: Remove translation lookups, dispatch directly on ValueExprId.
- `src/runtime/RuntimeState.ts` — **VERIFY**: May have legacy type references in cache typing.

## Critical Reference: lowerToValueExprs.ts as Specification

The `lowerToValueExprs.ts` file (342 lines) is the **definitive specification** for what each builder method should produce. Every case in `lowerSigExpr()`, `lowerFieldExpr()`, `lowerEventExpr()` maps to exactly one ValueExpr variant.

**Example mapping** (from lowerToValueExprs):
```
SigExpr { kind: 'const', value, type } → ValueExpr { kind: 'const', value, type }
SigExpr { kind: 'map', input, fn, type } → ValueExpr { kind: 'kernel', kernelKind: 'map', input, fn, type }
SigExpr { kind: 'zip', inputs, fn, type } → ValueExpr { kind: 'kernel', kernelKind: 'zip', inputs, fn, type }
FieldExpr { kind: 'broadcast', signal, type } → ValueExpr { kind: 'kernel', kernelKind: 'broadcast', signal, type }
FieldExpr { kind: 'intrinsic', intrinsic, type } → ValueExpr { kind: 'intrinsic', intrinsicKind: 'property', intrinsic, type }
EventExpr { kind: 'pulse', source, type } → ValueExpr { kind: 'event', eventKind: 'pulse', source, type }
```

## ValueRefPacked Design Decision

The block lowering output needs a discriminant so the schedule builder knows what kind of step to emit. Options:

**Option chosen**: Keep a `k` discriminant derived from CanonicalType:
```typescript
type ValueRefPacked =
  | { k: 'sig'; id: ValueExprId; slot: ValueSlot; type: CanonicalType; stride: number }
  | { k: 'field'; id: ValueExprId; type: CanonicalType; stride: number }
  | { k: 'event'; id: ValueExprId; type: CanonicalType };
```

This is NOT a legacy tag. It's execution semantics: signals need eval+slotWrite, fields need materialize, events need evalEvent. The `k` value is derived from `deriveKind(type)`.

## Test Strategy

1. **Per-WI unit tests** for builder methods
2. **Existing block tests** validate lowering correctness
3. **Existing compiler integration tests** validate schedule generation
4. **Existing runtime tests** validate execution
5. **Updated tripwire test** catches any legacy type regression

The 2057+ existing tests are the primary safety net. No new end-to-end tests needed — the existing ones validate the same behavior through the new code path.

## Ordering Notes

The safest execution order builds from bottom up:
1. Add new builder methods (additive, no breakage)
2. Update ValueRefPacked type (cascading type errors guide migration)
3. Migrate blocks (mechanical, guided by compiler errors)
4. Update Step types + schedule builder (cascading type errors guide migration)
5. Remove translation from executor (final step, removes last indirection)
6. Delete lowerToValueExprs + legacy types (cleanup)

Each step should result in a compilable, passing state before proceeding to the next.
