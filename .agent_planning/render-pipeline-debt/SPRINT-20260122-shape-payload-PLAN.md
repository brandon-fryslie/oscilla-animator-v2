# Sprint: shape-payload - Fix Shape Payload Placeholder in BufferPool and IR Bridges

Generated: 2026-01-22
Confidence: HIGH
Status: READY FOR IMPLEMENTATION
Bead: oscilla-animator-v2-ms5.16

## Sprint Goal

Complete the shape payload integration at the three placeholder boundaries: BufferPool format mapping, IR bridge type mapping, and ScheduleExecutor signal evaluation. The Shape2D runtime storage is already fully implemented — these placeholders are the missing wiring.

## Current State

The Shape2D runtime (RuntimeState.ts) is fully implemented:
- `SHAPE2D_WORDS = 8` fixed-width packed records in Uint32Array
- `readShape2D()` / `writeShape2D()` utilities
- `ValueStore.shape2d` bank
- `createValueStore()` accepts shape2dSlotCount

Three placeholders prevent this from working end-to-end:

1. **BufferPool.ts:32** — maps `shape` → `'f32'` (should be `'shape2d'`)
2. **bridges.ts:216** — maps `shape` → `{ kind: 'number' }` (should be `{ kind: 'shape' }`)
3. **ScheduleExecutor.ts:209** — throws on `shape2d` storage (should write shape record)
4. **SignalEvaluator.ts:199** — returns `0` for shapeRef (needs to return shape data for ScheduleExecutor)

## Work Items

### P0: Add `shape2d` BufferFormat and fix mapping

**File:** `src/runtime/BufferPool.ts`

1. Add `'shape2d'` to `BufferFormat` union type
2. Change `case 'shape':` from `return 'f32'` to `return 'shape2d'`
3. Add `case 'shape2d':` to `allocateBuffer()` — allocate `new Uint32Array(count * SHAPE2D_WORDS)`

**Acceptance Criteria:**
- [ ] `getBufferFormat('shape')` returns `'shape2d'`
- [ ] `allocateBuffer('shape2d', N)` returns `Uint32Array` of size `N * 8`
- [ ] Exhaustive switch in `allocateBuffer` still compiles (no `never` error)

### P1: Add `shape` kind to ShapeDescIR and fix bridge

**Files:** `src/compiler/ir/program.ts`, `src/compiler/ir/bridges.ts`, `src/compiler/ir/__tests__/bridges.test.ts`

1. Add `| { readonly kind: 'shape' }` to `ShapeDescIR` union in program.ts
2. Change `case 'shape':` in `payloadTypeToShapeDescIR` from `{ kind: 'number' }` to `{ kind: 'shape' }`
3. Update test expectation in bridges.test.ts to expect `{ kind: 'shape' }`

**Acceptance Criteria:**
- [ ] `payloadTypeToShapeDescIR('shape')` returns `{ kind: 'shape' }`
- [ ] TypeScript compiles with the new union member
- [ ] bridges.test.ts passes with updated expectation

### P2: Handle shape2d storage in ScheduleExecutor evalSig

**File:** `src/runtime/ScheduleExecutor.ts`

The `evalSig` case currently throws when `storage === 'shape2d'`. When a shapeRef signal is evaluated, SignalEvaluator returns a numeric topologyId (we'll change the placeholder to return the topologyId). ScheduleExecutor should:

1. Check `if (storage === 'shape2d')` — write a Shape2D record to the shape2d bank
2. The `SigExprShapeRef` node has `topologyId` — use it to populate the record
3. Write using `writeShape2D(state.values.shape2d, offset, record)`

**Acceptance Criteria:**
- [ ] Shape signals with `shape2d` storage don't throw
- [ ] Shape2D record is written with correct topologyId
- [ ] Non-shape signals still work unchanged (f64 path)

### P3: Fix SignalEvaluator shapeRef to return meaningful data

**File:** `src/runtime/SignalEvaluator.ts`

The `shapeRef` case currently returns `0`. Since ScheduleExecutor now handles the shape2d write directly, we need to decide what `evaluateSignal` returns for shapes. Two options:

- **Option A**: Return the topologyId as a number (ScheduleExecutor uses it to populate the record). Simple, maintains the function signature `evaluateSignal → number`.
- **Option B**: Remove `shapeRef` from SigExpr entirely and handle it as a separate step kind.

Option A is simpler and doesn't break the type system. The ScheduleExecutor reads `step.expr` to get the SigExprShapeRef node and populates the full record from it.

1. Change shapeRef case to return `expr.topologyId` (meaningful value, not 0)
2. ScheduleExecutor: when `storage === 'shape2d'`, access the expr node directly to build the full record

**Acceptance Criteria:**
- [ ] `evaluateSignal` for shapeRef returns topologyId (not 0)
- [ ] ScheduleExecutor accesses the shapeRef expr to build full Shape2DRecord
- [ ] All existing tests pass

### P4: Add tests

**File:** `src/runtime/__tests__/shape-payload.test.ts` (new)

Test cases:
1. `getBufferFormat('shape')` returns `'shape2d'`
2. BufferPool allocates correct Uint32Array for shape2d
3. `payloadTypeToShapeDescIR('shape')` returns `{ kind: 'shape' }`
4. ScheduleExecutor evalSig writes Shape2D record for shapeRef signals

## Dependencies

- Shape2D runtime storage (RuntimeState.ts) — already complete
- SigExprShapeRef type exists in IR types — already defined

## Risks

- **Low**: Changes to ShapeDescIR union could affect consumers that switch on `kind`. TypeScript exhaustive checks will catch these.
- **Low**: BufferFormat addition could break exhaustive switches in other files. Already confirmed only `allocateBuffer` switches on it.
