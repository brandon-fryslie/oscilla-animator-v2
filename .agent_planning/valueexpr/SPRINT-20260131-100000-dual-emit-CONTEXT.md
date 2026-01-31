# Implementation Context: dual-emit

Generated: 2026-01-31-100000
Source: EVALUATION-20260131-090000.md
Plan: SPRINT-20260131-100000-dual-emit-PLAN.md

## File: src/compiler/ir/program.ts

### Add ValueExprTable type (after EventExprTable, ~line 167)

```typescript
import type { ValueExpr } from './value-expr';
import type { ValueExprId } from './Indices';

export interface ValueExprTable {
  readonly nodes: readonly ValueExpr[];
  /** Maps SigExprId (as index) to corresponding ValueExprId */
  readonly sigToValue: readonly ValueExprId[];
  /** Maps FieldExprId (as index) to corresponding ValueExprId */
  readonly fieldToValue: readonly ValueExprId[];
  /** Maps EventExprId (as index) to corresponding ValueExprId */
  readonly eventToValue: readonly ValueExprId[];
}
```

### Add to CompiledProgramIR (line ~91, after eventExprs)

```typescript
readonly valueExprs: ValueExprTable;
```

## File: src/compiler/ir/IRBuilderImpl.ts

### New private state (add after line 79, alongside existing caches)

```typescript
// ValueExpr dual-emit state
private valueExprs: ValueExpr[] = [];
private valueExprCache = new Map<string, ValueExprId>();
private sigToValue: ValueExprId[] = [];
private fieldToValue: ValueExprId[] = [];
private eventToValue: ValueExprId[] = [];
```

### Import additions (line 7-8 area)

```typescript
import type { ValueExpr, ValueExprId } from './value-expr';
import { valueExprId } from './Indices';
```

### Pattern for dual-emit (example: sigConst, lines 118-134)

Current pattern:
```typescript
sigConst(value: ConstValue, type: CanonicalType): SigExprId {
  const expr = { kind: 'const' as const, value, type };
  const hash = hashSigExpr(expr);
  const existing = this.sigExprCache.get(hash);
  if (existing !== undefined) return existing;
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push(expr);
  this.sigExprCache.set(hash, id);
  return id;
}
```

New pattern (add ValueExpr emit after legacy emit):
```typescript
sigConst(value: ConstValue, type: CanonicalType): SigExprId {
  // ... existing validation and hash-consing ...
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push(expr);
  this.sigExprCache.set(hash, id);

  // Dual-emit: create ValueExpr equivalent
  const veId = this.emitValueExpr({ kind: 'const', type, value });
  this.sigToValue[id as number] = veId;

  return id;
}
```

### Helper method for ValueExpr emission

```typescript
private emitValueExpr(expr: ValueExpr): ValueExprId {
  // Optional: hash-consing for ValueExpr dedup
  const id = valueExprId(this.valueExprs.length);
  this.valueExprs.push(expr);
  return id;
}
```

### Signal method mappings (each sig* method)

| Method | Legacy | ValueExpr | ID Translation |
|--------|--------|-----------|----------------|
| `sigConst(value, type)` | `{ kind: 'const', value, type }` | `{ kind: 'const', type, value }` | None |
| `sigSlot(slot, type)` | `{ kind: 'slot', slot, type }` | `{ kind: 'slotRead', type, slot }` | None |
| `sigTime(which, type)` | `{ kind: 'time', which, type }` | `{ kind: 'time', type, which }` | None |
| `sigExternal(channel, type)` | `{ kind: 'external', which: channel, type }` | `{ kind: 'external', type, channel }` | Note: legacy uses `which`, ValueExpr uses `channel` |
| `sigMap(input, fn, type)` | `{ kind: 'map', input, fn, type }` | `{ kind: 'kernel', type, kernelKind: 'map', input: sigToValue[input], fn }` | `input` SigExprId -> ValueExprId |
| `sigZip(inputs, fn, type)` | `{ kind: 'zip', inputs, fn, type }` | `{ kind: 'kernel', type, kernelKind: 'zip', inputs: inputs.map(i => sigToValue[i]), fn }` | Each SigExprId -> ValueExprId |
| `sigStateRead(stateSlot, type)` | `{ kind: 'stateRead', stateSlot, type }` | `{ kind: 'state', type, stateSlot }` | None |
| `sigShapeRef(topologyId, paramSignals, type, controlPointField?)` | `{ kind: 'shapeRef', topologyId, paramSignals, type, controlPointField? }` | `{ kind: 'shapeRef', type, topologyId, paramArgs: paramSignals.map(s => sigToValue[s]), controlPointField: cpf ? fieldToValue[cpf.id] : undefined }` | Multiple translations |
| `sigReduceField(field, op, type)` | `{ kind: 'reduceField', field, op, type }` | `{ kind: 'kernel', type, kernelKind: 'reduce', field: fieldToValue[field] }` | FieldExprId -> ValueExprId |
| `sigEventRead(eventSlot, type)` | `{ kind: 'eventRead', eventSlot, type }` | `{ kind: 'eventRead', type, eventSlot }` | None |

### Field method mappings

| Method | ValueExpr | ID Translation |
|--------|-----------|----------------|
| `fieldConst(value, type)` | `{ kind: 'const', type, value }` | None |
| `fieldIntrinsic(intrinsic, type)` | `{ kind: 'intrinsic', type, intrinsicKind: 'property', intrinsic }` | None |
| `fieldPlacement(field, basisKind, type)` | `{ kind: 'intrinsic', type, intrinsicKind: 'placement', field, basisKind }` | None |
| `fieldBroadcast(signal, type)` | `{ kind: 'kernel', type, kernelKind: 'broadcast', signal: sigToValue[signal] }` | SigExprId -> ValueExprId |
| `fieldMap(input, fn, type)` | `{ kind: 'kernel', type, kernelKind: 'map', input: fieldToValue[input], fn }` | FieldExprId -> ValueExprId |
| `fieldZip(inputs, fn, type)` | `{ kind: 'kernel', type, kernelKind: 'zip', inputs: inputs.map(i => fieldToValue[i]), fn }` | FieldExprId[] -> ValueExprId[] |
| `fieldZipSig(field, signals, fn, type)` | `{ kind: 'kernel', type, kernelKind: 'zipSig', field: fieldToValue[field], signals: signals.map(s => sigToValue[s]), fn }` | FieldExprId + SigExprId[] -> ValueExprId + ValueExprId[] |
| `fieldStateRead(stateSlot, type)` | `{ kind: 'state', type, stateSlot }` | None |
| `fieldPathDerivative(input, operation, type)` | `{ kind: 'kernel', type, kernelKind: 'pathDerivative', field: fieldToValue[input] }` | FieldExprId -> ValueExprId |

### Event method mappings

| Method | ValueExpr | ID Translation |
|--------|-----------|----------------|
| `eventConst(fired, type)` | `{ kind: 'event', type, eventKind: 'const', fired }` | None |
| `eventPulse(type)` | `{ kind: 'event', type, eventKind: 'pulse', source: 'timeRoot' }` | None |
| `eventWrap(signal, type)` | `{ kind: 'event', type, eventKind: 'wrap', input: sigToValue[signal] }` | SigExprId -> ValueExprId |
| `eventCombine(events, mode, type)` | `{ kind: 'event', type, eventKind: 'combine', inputs: events.map(e => eventToValue[e]), mode }` | EventExprId[] -> ValueExprId[] |
| `eventNever(type)` | `{ kind: 'event', type, eventKind: 'never' }` | None |

### Build method update

The `build()` method (or equivalent that constructs CompiledProgramIR) must include:
```typescript
valueExprs: {
  nodes: this.valueExprs,
  sigToValue: this.sigToValue,
  fieldToValue: this.fieldToValue,
  eventToValue: this.eventToValue,
}
```

## File: src/compiler/ir/IRBuilder.ts (interface)

No changes needed -- the IRBuilder interface defines the public API which returns legacy IDs. The dual-emit is an internal implementation detail of IRBuilderImpl.

## Test file: src/compiler/ir/__tests__/dual-emit.test.ts (NEW)

Create a new test file that:
1. Creates an IRBuilderImpl
2. Emits a variety of signal, field, and event expressions
3. Builds the program
4. Asserts `program.valueExprs.nodes.length > 0`
5. Asserts mapping array lengths match legacy table lengths
6. Asserts every ValueExpr in the table has a valid `kind` and `type`
7. Asserts cross-references resolve correctly (e.g., a map's input ValueExprId points to the correct ValueExpr)

Follow pattern from existing test: `src/compiler/__tests__/compile.test.ts`
