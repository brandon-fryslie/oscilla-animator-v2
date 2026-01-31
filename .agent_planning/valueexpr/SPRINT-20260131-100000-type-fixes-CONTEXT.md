# Implementation Context: type-fixes

Generated: 2026-01-31-100000
Source: EVALUATION-20260131-090000.md
Plan: SPRINT-20260131-100000-type-fixes-PLAN.md

## File: src/compiler/ir/value-expr.ts

This is the ONLY file being modified (plus the invariant test file).

### Current structure (lines to modify)

**Import block (lines 20-28)**: Add `ValueSlot` import:
```typescript
import type { StateSlotId, EventSlotId, ValueSlot } from './Indices';
```

**ValueExpr union (lines 75-84)**: Add `ValueExprSlotRead`:
```typescript
export type ValueExpr =
  | ValueExprConst
  | ValueExprExternal
  | ValueExprIntrinsic
  | ValueExprKernel
  | ValueExprState
  | ValueExprTime
  | ValueExprShapeRef
  | ValueExprEventRead
  | ValueExprEvent
  | ValueExprSlotRead;
```

**ValueExprKernel (lines 148-154)**: Replace interface with discriminated union:
```typescript
export type ValueExprKernel =
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'map'; readonly input: ValueExprId; readonly fn: PureFn }
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'zip'; readonly inputs: readonly ValueExprId[]; readonly fn: PureFn }
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'zipSig'; readonly field: ValueExprId; readonly signals: readonly ValueExprId[]; readonly fn: PureFn }
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'broadcast'; readonly signal: ValueExprId }
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'reduce'; readonly field: ValueExprId }
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'pathDerivative'; readonly field: ValueExprId };
```

**ValueExprTime (lines 172-176)**: Expand which union:
```typescript
readonly which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy';
```

**ValueExprShapeRef (lines 183-188)**: Change paramArgs and add controlPointField:
```typescript
export interface ValueExprShapeRef {
  readonly kind: 'shapeRef';
  readonly type: CanonicalType;
  readonly topologyId: TopologyId;
  readonly paramArgs: readonly ValueExprId[];
  /** Optional control points for paths. Referenced expr MUST have field-extent. */
  readonly controlPointField?: ValueExprId;
}
```

**ValueExprEvent (lines 211-240)**: Fix pulse, wrap, combine, const:
```typescript
export type ValueExprEvent =
  | {
      readonly kind: 'event';
      readonly type: CanonicalType;
      readonly eventKind: 'pulse';
      readonly source: 'timeRoot';
    }
  | {
      readonly kind: 'event';
      readonly type: CanonicalType;
      readonly eventKind: 'wrap';
      readonly input: ValueExprId;
    }
  | {
      readonly kind: 'event';
      readonly type: CanonicalType;
      readonly eventKind: 'combine';
      readonly inputs: readonly ValueExprId[];
      readonly mode: 'any' | 'all';
    }
  | {
      readonly kind: 'event';
      readonly type: CanonicalType;
      readonly eventKind: 'never';
    }
  | {
      readonly kind: 'event';
      readonly type: CanonicalType;
      readonly eventKind: 'const';
      readonly fired: boolean;
    };
```

**New interface (add after ValueExprEvent, before end of file)**:
```typescript
/**
 * Slot read expression.
 *
 * Reads from ValueSlot storage (register file). Used for strided
 * multi-component signal reads (e.g., vec3 components via slotWriteStrided).
 *
 * NOT a state op -- slotRead is executor/register-file plumbing.
 * State ops (hold/delay/integrate/slew/preserve) use ValueExprState.
 */
export interface ValueExprSlotRead {
  readonly kind: 'slotRead';
  readonly type: CanonicalType;
  readonly slot: ValueSlot;
}
```

**Design principles comment (line 8)**: Update "9 values" to "10 values".

## File: src/compiler/ir/__tests__/value-expr-invariants.test.ts

### Changes required

**EXPECTED_KINDS (line 28-38)**: Add `'slotRead'`, total becomes 10:
```typescript
const EXPECTED_KINDS = [
  'const', 'external', 'intrinsic', 'kernel', 'state',
  'time', 'shapeRef', 'eventRead', 'event', 'slotRead',
] as const;
```

**Kind count assertions (lines 67, 73)**: Change `toBe(9)` to `toBe(10)`.

**Mock variants array (lines 92-102, 113-123, 134-144)**: Add slotRead mock, update kernel mock (no generic args), update event const mock (fired not value), update event pulse mock if present:
```typescript
// slotRead mock:
{ kind: 'slotRead', type: mockType, slot: 0 as any },

// kernel mock (now needs kernelKind-specific fields):
{ kind: 'kernel', type: mockType, kernelKind: 'map', input: 0 as any, fn: { kind: 'opcode', opcode: 'add' } as any },

// event const mock:
{ kind: 'event', type: mockType, eventKind: 'const', fired: true },

// event combine mock (needs mode):
{ kind: 'event', type: mockType, eventKind: 'combine', inputs: [], mode: 'any' },

// event pulse mock:
{ kind: 'event', type: mockType, eventKind: 'pulse', source: 'timeRoot' },

// event wrap mock:
{ kind: 'event', type: mockType, eventKind: 'wrap', input: 0 as any },
```

**Kernel sub-discriminant test (lines 152-165)**: Update to construct proper sub-union variants instead of generic objects.

## Legacy type reference (for field mapping verification)

| Legacy Type | Legacy Field | ValueExpr Equivalent |
|-------------|-------------|---------------------|
| SigExprConst | value, type | ValueExprConst.value, .type |
| SigExprSlot | slot, type | ValueExprSlotRead.slot, .type |
| SigExprTime | which (7 values), type | ValueExprTime.which (7 values), .type |
| SigExprExternal | which, type | ValueExprExternal.channel, .type |
| SigExprMap | input (SigExprId), fn, type | kernel.map.input (ValueExprId), .fn, .type |
| SigExprZip | inputs (SigExprId[]), fn, type | kernel.zip.inputs (ValueExprId[]), .fn, .type |
| SigExprStateRead | stateSlot, type | ValueExprState.stateSlot, .type |
| SigExprShapeRef | topologyId, paramSignals, controlPointField?, type | ValueExprShapeRef (all mapped) |
| SigExprReduceField | field, op, type | kernel.reduce.field, .type (op TBD -- note: reduce op is not yet on kernel.reduce, may need adding) |
| SigExprEventRead | eventSlot, type | ValueExprEventRead.eventSlot, .type |
| FieldExprConst | value, type | ValueExprConst.value, .type |
| FieldExprIntrinsic | intrinsic, type | ValueExprIntrinsic (property sub-kind) |
| FieldExprPlacement | field, basisKind, type | ValueExprIntrinsic (placement sub-kind) |
| FieldExprBroadcast | signal (SigExprId), type | kernel.broadcast.signal (ValueExprId), .type |
| FieldExprMap | input (FieldExprId), fn, type | kernel.map.input (ValueExprId), .fn, .type |
| FieldExprZip | inputs (FieldExprId[]), fn, type | kernel.zip.inputs (ValueExprId[]), .fn, .type |
| FieldExprZipSig | field, signals, fn, type | kernel.zipSig.field, .signals, .fn, .type |
| FieldExprStateRead | stateSlot, type | ValueExprState.stateSlot, .type |
| FieldExprPathDerivative | input, operation, type | kernel.pathDerivative.field, .type (operation TBD) |
| EventExprConst | fired, type | event.const.fired, .type |
| EventExprPulse | source, type | event.pulse.source, .type |
| EventExprWrap | signal (SigExprId), type | event.wrap.input (ValueExprId), .type |
| EventExprCombine | events (EventExprId[]), mode, type | event.combine.inputs (ValueExprId[]), .mode, .type |
| EventExprNever | type | event.never.type |

### Known gaps remaining after this sprint
1. `SigExprReduceField.op` ('min'|'max'|'sum'|'avg') -- kernel.reduce does not carry the reduction op. Consider adding in a follow-up or encoding in PureFn.
2. `FieldExprPathDerivative.operation` ('tangent'|'arcLength') -- kernel.pathDerivative does not carry operation. Same consideration.

These are P2 gaps and can be addressed during the dual-emit sprint when the IRBuilder must actually construct these variants.
