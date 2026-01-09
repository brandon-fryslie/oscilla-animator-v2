# Work Evaluation - IR 5-Axes Implementation
**Generated**: 2026-01-09T21:23:00Z
**Scope**: work/ir-5-axes
**Confidence**: FRESH

---

## Goals Under Evaluation

From `.agent_planning/ir-5-axes/DOD-20260109-200000.md`:

### P0-P1: Schema Foundation (In Scope for Current Evaluation)
1. Single source of truth: `CompiledProgramIR` at `src/compiler/ir/program.ts`
2. Forbidden fields eliminated (nodes, buses, constPool, transforms, meta)
3. Dense execution tables with `.nodes[]` arrays
4. Outputs contract with `program.outputs[0].slot`
5. Slot addressing with `SlotMetaEntry.offset` (required, not optional)
6. Axes on every slot via `SlotMetaEntry.type.axes`
7. Schedule execution (runtime executes steps only)
8. DebugIndex present with mandatory fields

### P2-P6: Compiler Passes (Out of Scope - Future Work)
- Passes 0-4: Type system (validate, normalize, type, unify, resolve)
- Passes 5-6: Lowering to execution classes
- Passes 7-8: Schedule construction, slot planning
- Passes 9-10: Constants pool, debug index

**Note**: This evaluation focuses on P0-P1 (schema foundation). Full compiler pipeline implementation is tracked separately.

---

## Previous Evaluation Reference

No previous work evaluation found for this scope. This is the first evaluation.

---

## Persistent Check Results

| Check | Status | Output Summary |
|-------|--------|----------------|
| `npm run typecheck` | ✅ PASS | Clean compile, no errors |
| `npm run test` | ✅ PASS | 68/68 tests passing |

---

## Manual Runtime Testing

### What I Tried

1. **Schema Inspection**: Read `src/compiler/ir/program.ts` to verify CompiledProgramIR structure
2. **Type System Check**: Ran `tsc -b` to verify no forbidden field references
3. **Runtime Import Check**: Verified `src/runtime/ScheduleExecutor.ts` imports CompiledProgramIR
4. **Dense Array Usage**: Checked runtime uses `program.signalExprs.nodes[]` indexing
5. **Outputs Contract**: Verified runtime reads from `program.outputs[0].slot`
6. **Slot Offset Usage**: Verified runtime uses `slotMeta.offset` via `resolveSlotOffset()`
7. **Test Execution**: Ran steel-thread integration test (animated particles)

### What Actually Happened

1. ✅ **Schema exists** at `src/compiler/ir/program.ts` with exact structure per spec
2. ✅ **Type checking passes** - no references to forbidden fields in active code
3. ✅ **Runtime imports CompiledProgramIR** - see `ScheduleExecutor.ts:8`
4. ✅ **Dense arrays used** - `signals[sigId as number]` in SignalEvaluator.ts:36
5. ✅ **Outputs contract working** - `program.outputs[0]` read at ScheduleExecutor.ts:213
6. ✅ **Offset addressing present** - `resolveSlotOffset()` returns `meta.offset` at line 52
7. ✅ **Steel-thread test passes** - 100 animated particles render correctly

---

## Data Flow Verification

Traced complete path from compilation to runtime:

| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| **Compilation** | IRBuilder produces CompiledProgramIR | `builder.build()` returns CompiledProgramIR | ✅ |
| **Dense Arrays** | `.nodes[]` populated from Maps | `Array.from(this.signals.values())` | ✅ |
| **SlotMeta** | Every slot has entry with offset | `slotMeta.push({ slot, storage, offset, type })` | ✅ |
| **Axes** | TypeDesc contains AxesDescIR | `signalTypeToTypeDesc()` bridge function | ✅ |
| **Runtime Import** | executeFrame() uses CompiledProgramIR | Function signature verified | ✅ |
| **Schedule Execution** | Steps executed in order | `for (const step of steps)` loop | ✅ |
| **Offset Access** | slotMeta.offset used | `state.values.f64[offset]` at line 99 | ✅ |
| **Output Extraction** | Frame read from outputs[0].slot | `state.values.objects.get(slot)` | ✅ |

---

## Break-It Testing

### Input Attacks (Deferred - No User Input Layer Yet)
- N/A - Compiler operates on programmatic graph construction
- Will be relevant when editor UI integration happens

### State Attacks

| Attack | Expected | Actual | Severity |
|--------|----------|--------|----------|
| **Run same frame twice** | Second execution uses cache | Cache stamps validated | ✅ OK |
| **Execute with missing slot** | Error thrown | `resolveSlotOffset()` throws on missing slot | ✅ OK |
| **Access undefined signal** | Error thrown | `signals[id]` check + throw at SignalEvaluator:38 | ✅ OK |

### Flow Attacks

| Attack | Expected | Actual | Severity |
|--------|----------|--------|----------|
| **Skip compilation** | Runtime requires CompiledProgramIR | Type system enforces parameter | ✅ OK |
| **Mutate program during execution** | Immutable readonly fields prevent | All fields are `readonly` | ✅ OK |

---

## Evidence

### 1. CompiledProgramIR Schema (program.ts:52-76)
```typescript
export interface CompiledProgramIR {
  readonly irVersion: IrVersion;
  readonly signalExprs: SignalExprTable;
  readonly fieldExprs: FieldExprTable;
  readonly eventExprs: EventExprTable;
  readonly constants: { readonly json: readonly unknown[] };
  readonly schedule: ScheduleIR;
  readonly outputs: readonly OutputSpecIR[];
  readonly slotMeta: readonly SlotMetaEntry[];
  readonly debugIndex: DebugIndexIR;
}
```

### 2. Dense Array Construction (builder.ts:332-334)
```typescript
const signalExprs = { nodes: Array.from(this.signals.values()) };
const fieldExprs = { nodes: Array.from(this.fields.values()) };
const eventExprs = { nodes: Array.from(this.events.values()) };
```

### 3. SlotMeta with Axes (builder.ts:401-406)
```typescript
slotMeta.push({
  slot,
  storage,
  offset,
  type: typeDesc,  // Contains axes + shape
});
```

### 4. Runtime Offset Addressing (ScheduleExecutor.ts:95-99)
```typescript
const { storage, offset } = resolveSlotOffset(program, step.target);
if (storage === 'f64') {
  state.values.f64[offset] = value;
}
```

### 5. Outputs Contract (ScheduleExecutor.ts:212-226)
```typescript
if (program.outputs.length > 0) {
  const outputSpec = program.outputs[0];
  // ... store frame in slot ...
  const outputFrame = state.values.objects.get(slot);
  return outputFrame as RenderFrameIR;
}
```

---

## Assessment

### ✅ Working (All P0-P1 Criteria Met)

#### 1. Single Source of Truth
- ✅ `CompiledProgramIR` is the only authoritative schema
- ✅ Located at `src/compiler/ir/program.ts`
- ✅ Runtime imports only this interface
- ✅ Legacy `IRProgram` marked `@deprecated` in types.ts:311

#### 2. Forbidden Fields Eliminated
- ✅ `tsc` reports zero references to forbidden fields in active code
- ✅ Comments mention them only for documentation
- ✅ `program.nodes`, `program.buses`, `program.constPool`, `program.transforms`, `program.meta` do not exist

#### 3. Dense Execution Tables
- ✅ `signalExprs.nodes[]` is dense array
- ✅ `fieldExprs.nodes[]` is dense array
- ✅ `eventExprs.nodes[]` is dense array
- ✅ Runtime uses array indexing: `signals[sigId as number]`
- ✅ No hash-map lookups in hot path

#### 4. Outputs Contract
- ✅ `program.outputs` exists and is populated
- ✅ Runtime reads from `program.outputs[0].slot`
- ✅ Type: `readonly OutputSpecIR[]`

#### 5. Slot Addressing
- ✅ Every slot has `SlotMetaEntry` with `offset: number`
- ✅ `offset` is required (not optional) per TypeDesc:135
- ✅ Runtime uses `slotMeta.offset` via `resolveSlotOffset()`
- ✅ Runtime NEVER computes offsets (uses pre-computed values)

#### 6. Axes on Every Slot
- ✅ `SlotMetaEntry.type.axes` is present on all slots
- ✅ Bridge function `signalTypeToTypeDesc()` always includes axes
- ✅ No runtime defaults - axes come from compiler
- ✅ Axes correctly map: signal | field | event | value

#### 7. Schedule Execution
- ✅ Runtime executes schedule steps only
- ✅ No node tables, no dynamic dispatch
- ✅ Phase ordering implicit in step order (verified in steel-thread test)

#### 8. DebugIndex Present
- ✅ `program.debugIndex` is mandatory field
- ✅ Contains `stepToBlock` and `slotToBlock` maps
- ✅ Contains `ports[]` array (empty for now, structure present)
- ✅ Contains `slotToPort` map (empty for now, structure present)

#### 9. Tests
- ✅ All 68 existing tests pass
- ✅ Steel-thread integration test validates end-to-end flow
- ✅ Type checking passes with no errors

---

### ⚠️ Partial Implementation Notes (Not Blocking)

These are noted for completeness but do NOT block P0-P1 completion:

#### 1. Schedule Type Still Abstract
- **Status**: `ScheduleIR = unknown` (program.ts:307)
- **Impact**: Works for current steel-thread test
- **Future**: Will be defined in P4 (Passes 7-8)
- **DoD Status**: Not required for P0-P1

#### 2. Port Bindings Array Empty
- **Status**: `debugIndex.ports = []` (builder.ts:423)
- **Impact**: No port provenance yet
- **Future**: Will be populated in P6 (Pass 10)
- **DoD Status**: Structure present, data population is P6

#### 3. Constants Pool Empty
- **Status**: `constants.json = []` (builder.ts:439)
- **Impact**: No JSON constants yet
- **Future**: Will be populated in P6 (Pass 9)
- **DoD Status**: Structure present, not needed for current tests

#### 4. Simplified Offset Computation
- **Status**: IRBuilder assigns `offset = slotId` for f64 storage
- **Impact**: Works correctly for single storage class
- **Future**: Will be per-storage when multiple storage classes exist
- **DoD Status**: Meets requirement (offsets are pre-computed, not runtime-derived)

---

### ❌ Not Working

**NONE** - All P0-P1 acceptance criteria are met.

---

### ⚠️ Ambiguities Found

**NONE** - Implementation follows spec exactly.

---

## Missing Checks (implementer should create)

The current implementation has adequate test coverage for P0-P1:

1. ✅ **Schema validation** - Type system enforces structure
2. ✅ **Integration test** - steel-thread.test.ts validates end-to-end
3. ✅ **Type checking** - tsc validates forbidden fields eliminated

**Future checks needed for P2-P6** (out of scope for this evaluation):
- Compiler pass 0: Invalid graph rejection tests
- Compiler pass 1: Normalization idempotency tests
- Compiler passes 2-4: Type assignment and unification tests
- Compiler passes 5-6: Lowering correctness tests
- Compiler passes 7-8: Schedule determinism tests
- Runtime: Mixed storage class offset tests (when f32/i32/u32 added)

---

## Verdict: COMPLETE ✅

**All P0-P1 acceptance criteria met.**

The Compiler & IR 5-Axes foundation (P0-P1) is complete and ready for use:

1. ✅ CompiledProgramIR is single source of truth
2. ✅ Forbidden fields eliminated
3. ✅ Dense execution tables implemented
4. ✅ Outputs contract working
5. ✅ Slot addressing with required offsets
6. ✅ Axes on every slot type
7. ✅ Schedule execution operational
8. ✅ DebugIndex structure present
9. ✅ All 68 tests passing

**Next Steps**:
- P2-P6 implementation tracked separately
- Current foundation is stable and can be built upon
- Steel-thread test provides regression protection

---

## What Needs to Change

**NOTHING** - Implementation is complete for P0-P1 scope.

---

## Questions Needing Answers (if PAUSE)

**N/A** - No blockers or ambiguities found.

