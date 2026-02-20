# Unified Field Architecture: Signals Become Fields of Cardinality 1

## Context

The Oscilla runtime has a dual-path architecture: signals in `Float64Array` (`values.f64`), fields in `Map<ValueSlot, unknown>` (`values.objects`). Separate evaluators, schedule steps, state mappings, and IR types exist for each path.

The type system already knows they're the same thing — `CanonicalType.extent.cardinality` distinguishes `one` (signal) from `many` (field). The runtime hasn't caught up.

**Goal:** Everything is a field. Signals become fields of cardinality 1. One evaluator, one step type, one storage path. A single contiguous `Float32Array` arena that IS a GPU buffer.

**Precision:** Float32. Full stop. No Float64 anywhere in value storage. No comparison passes, no precision-sensitive validation, no fallback paths. Animation values are Float32. The arena is GPU/SIMD-ready. Move forward.

**Strategy:** Arena first. Build the unified storage, shim the old evaluators to write to it, remove old storage, then incrementally unify the evaluation paths.

## Why This Works Incrementally

**Key finding:** Signal evaluation is expression-DAG recursive with per-frame caching. When signal B depends on signal A, B's evaluator recursively walks the ValueExpr DAG — it does NOT read from `f64` storage. The materializer also reads signal inputs by calling `evaluateValueExprSignal()` directly.

This means: once the arena replaces f64/objects as storage, both evaluators can coexist writing to the same memory. Readers don't care which evaluator wrote the value — a slot is a slot. Block conversion (signal evaluator → materializer) then becomes an evaluation concern, not a storage concern.

## Current Dual-Path Inventory

### The Fork Point

The split is created in `src/compiler/compile.ts` `convertLinkedIRToProgram()` (lines 322-325):

```typescript
const card = requireInst(type.extent.cardinality, 'cardinality');
const storage: SlotMetaEntry['storage'] = isMany(card) ? 'object' : 'f64';
```

This single decision cascades into every downstream consumer.

### Consumers of the Fork

| Component | Signal Path | Field Path |
|-----------|------------|------------|
| **Storage** | `values.f64: Float64Array` | `values.objects: Map<ValueSlot, unknown>` |
| **Evaluator** | `evaluateValueExprSignal()` → number | `materializeValueExpr()` → Float32Array |
| **Schedule step** | `StepEvalValue` + `EvalStrategy.ContinuousScalar` | `StepMaterialize` |
| **IR output** | `LoweredSignal` | `LoweredField` |
| **State mapping** | `StateMappingScalar` | `StateMappingField` |
| **Cache** | `state.cache.valueExprValues[veId]` (per-expr) | None (full materialize each frame) |
| **Render read** | `state.values.f64[offset]` | `state.values.objects.get(slot)` |
| **Debug viz** | `SignalValueResult` (scalar display) | `FieldValueResult` (histogram/stats) |
| **Multi-component** | `evaluateConstructSignal()` special path | Standard construct materialization |

## Phase 1: Build the Arena

**Goal:** A single `Float32Array` that holds ALL numeric values — both signals and fields.

### 1a. Arena Allocator (`src/runtime/ArenaValueStore.ts` — NEW)

```typescript
interface ArenaSlotDescriptor {
  offset: number;    // Start in arena (Float32 index)
  stride: number;    // Components per element (1=float, 3=vec3, 4=color)
  laneCount: number; // 1=signal, N=field
  length: number;    // = stride * laneCount
}
```

Access pattern: `arena[desc.offset + lane * desc.stride + component]`

Helpers:
- `createArena(totalSize: number): Float32Array`
- `arenaRead(arena, desc, lane, component): number`
- `arenaWrite(arena, desc, lane, component, value): void`
- `arenaSlice(arena, desc): Float32Array` — zero-copy subarray view

### 1b. Compiler Emits Arena Layout

In `src/compiler/compile.ts` `convertLinkedIRToProgram()` (lines 316-334):
- Compute `ArenaSlotDescriptor` for every slot
- Signals: `laneCount = 1`, `length = stride`
- Fields: `laneCount = instanceCount`, `length = stride * instanceCount`
- Bump-allocate: each slot gets next available offset, no overlap
- Add to `CompiledProgramIR`: `arenaLayout: ArenaSlotDescriptor[]` + `arenaSize: number`

### 1c. Allocate Arena in `createProgramState()`

In `src/runtime/RuntimeState.ts`:
- Add `arena: Float32Array` to `RuntimeState` (or `ValueStore`)
- Allocate `new Float32Array(program.arenaSize)` alongside existing f64/objects
- Both storage systems active simultaneously during transition

### Files
- `src/runtime/ArenaValueStore.ts` — NEW: arena types + helpers
- `src/compiler/compile.ts` — arena layout computation in slot loop
- `src/compiler/ir/program.ts` — `CompiledProgramIR` gets `arenaLayout`, `arenaSize`
- `src/runtime/RuntimeState.ts` — arena allocation

### Success Criteria
- Test: compile demo patch → arena layout covers every slot, no overlaps, correct sizes
- Test: arena read/write helpers produce correct values for float, vec3, color strides
- Existing code completely unaffected (arena exists alongside old storage)

## Phase 2: Shim — Old Evaluators Write to Arena

**Goal:** Every value write (signal or field) goes to the arena. Old storage (`f64`, `objects`) becomes a write-through facade, then gets deleted.

### 2a. Signal Writes → Arena

In `src/runtime/ScheduleExecutor.ts`, where `writeF64Scalar()` writes to `state.values.f64[offset]`:
- Also write `state.arena[arenaDesc.offset + component] = value` (Float32)
- For construct signals (`evaluateConstructSignal`): write all components to arena

In `src/runtime/ValueExprSignalEvaluator.ts`:
- Cache stays as-is (expression-level cache for recursive evaluation)
- The arena write is at the STEP level (ScheduleExecutor), not the evaluator level

### 2b. Field Writes → Arena

In `src/runtime/ScheduleExecutor.ts`, where `materializeValueExpr()` returns a buffer and stores in `objects`:
- Write the buffer contents to the arena region instead (or additionally, during transition)
- `materializeValueExpr()` could write directly to arena slice, or we copy after

Better: modify `materializeValueExpr()` to accept a target buffer parameter:
```typescript
function materializeValueExpr(
  exprId, table, instanceId, count, state, program, pool,
  target?: Float32Array  // If provided, write here instead of pool buffer
): Float32Array
```
When `target` is provided (arena subarray), write directly. No BufferPool allocation needed.

### 2c. All Readers → Arena

Migrate readers one at a time:

**RenderAssembler** (`src/runtime/RenderAssembler.ts`):
- Replace `state.values.f64[offset]` reads with `state.arena[arenaDesc.offset + component]`
- Replace `state.values.objects.get(slot) as Float32Array` with `arenaSlice(state.arena, desc)`
- `arenaSlice` returns a zero-copy subarray view — same performance as Map.get() or better

**DebugService** (`src/services/DebugService.ts`):
- Read from arena for both signal and field probes
- `SignalValueResult` → read `arena[desc.offset]`
- `FieldValueResult` → read `arenaSlice(arena, desc)`

**SlotLookupCache** (`src/runtime/SlotLookupCache.ts`):
- Update `SlotLookup` to carry `arenaOffset` instead of (or alongside) `offset` + `storage`
- Eventually, `storage` field disappears — everything is arena

**Continuity system** (`src/runtime/ScheduleExecutor.ts` continuityApply/continuityMapBuild):
- Read/write base buffers from arena slices

### 2d. Delete Old Storage

Once all writers and readers use the arena:
- Remove `ValueStore.f64` from `RuntimeState.ts`
- Remove `ValueStore.objects` (keep ONLY for `renderFrameSlot` — a non-numeric object reference)
- Remove `createValueStore()` that allocates f64
- The `shape2d` bank stays (it's `Uint32Array`, not numeric values)

### Files
- `src/runtime/ScheduleExecutor.ts` — arena writes for all step types
- `src/runtime/ValueExprMaterializer.ts` — optional target buffer parameter
- `src/runtime/RenderAssembler.ts` — arena reads
- `src/services/DebugService.ts` — arena reads
- `src/runtime/SlotLookupCache.ts` — arena-aware lookups
- `src/runtime/RuntimeState.ts` — delete f64/objects (keep objects for renderFrameSlot)

### Success Criteria
- All demo patches render identically (visual validation)
- `state.values.f64` no longer accessed anywhere
- `state.values.objects` only used for renderFrameSlot
- Performance: no regression (expect improvement from cache locality)

## Phase 3: Migrate a Slice Natively (Prove the Pattern)

**Goal:** Convert a small set of blocks to use materialization with count=1 through the arena, exercising the full native path end-to-end.

### 3a. Create `SCALAR_INSTANCE`

- Define `SCALAR_INSTANCE_ID` as a well-known `InstanceId` in `src/compiler/ir/Indices.ts`
- Register it in `program.instances` with `count: 1` during compilation
- All cardinality-one materializations reference this instance

### 3b. Convert Const Block

`src/blocks/signal/const.ts`:
- Lower function: produce `LoweredField` with `instanceId: SCALAR_INSTANCE_ID` instead of `LoweredSignal`
- Schedule: emits `StepMaterialize(count=1)` instead of `StepEvalValue`
- Materializer handles count=1 natively → writes to arena slice

### 3c. Prime the Pipeline (~10-20 easy/medium blocks)

Convert a batch of straightforward blocks to exercise the pattern at scale:

**Math blocks** (cardinality-generic, use `zipAuto()`):
- `add.ts`, `sub.ts`, `mul.ts`, `div.ts`, `modulo.ts`
- `sin.ts`, `cos.ts`
- `clamp.ts`, `smoothstep.ts`, `wrap01.ts` (if signal-capable)
- `scale-bias.ts`

**Simple signal blocks:**
- `oscillator.ts`, `phasor.ts`, `hash.ts`

All use `cardinalityMode: 'preserve'`. Same mechanical change as Const.

### 3d. Validate

- Downstream unconverted signal blocks still work (recursive evaluation)
- Compile + typecheck passes
- Demo patches using converted blocks render correctly
- State write/read still works for converted blocks

### Success Criteria
- 10-20 blocks converted via materialization through arena
- Mix of old-path (signal evaluator) and new-path (materializer) blocks coexist
- All demo patches work
- Pattern is proven, pipeline is primed

## Phase 4: Convert Remaining Blocks — Hardest First

**Goal:** All blocks produce `LoweredField`. No more `LoweredSignal`.

**Strategy: hardest first.** Tackle the blocks that are most likely to reveal fundamental assumption failures BEFORE converting the remaining 90%. If Expression or Broadcast break the model, we find out now — not after converting everything else.

### Conversion Order

**Wave 1 — Expression block (HARDEST):**
- `src/blocks/math/expression.ts` — component reconstruction logic needs update
- Dynamic type resolution + runtime reconstruction of components at lowering time
- Special logic (lines ~161-197) extracts components and reconstructs — assumes signal evaluation
- This is the block most likely to reveal if the model needs adjustment
- If this works, everything else is easier

**Wave 2 — Broadcast semantics change (HARD):**
- `src/blocks/field/broadcast.ts` — input changes from "signal" to "field of cardinality 1"
- Semantically: now a cardinality-1-to-many expansion (still correct, but adapter matching changes)
- Adapter spec: `from: { extent: 'any' }` — does auto-insertion still work?
- Materializer broadcast kernel reads signal inputs via `evaluateValueExprSignal()` — needs arena read
- Multi-component broadcast passes `signalComponents` separately — rethink with materialized inputs

**Wave 3 — Multi-component / construct (MEDIUM-HARD):**
- Blocks producing vec3/vec4/color construct expressions
- Materializer already handles construct for fields (ValueExprMaterializer.ts:96-104)
- For count=1, loop runs once. Each component materializes to single float. Works.
- Delete `evaluateConstructSignal()` from ScheduleExecutor after this wave

**Wave 4 — Stateful blocks (MEDIUM):**
- `accumulator.ts`, `unit-delay.ts`, `lag.ts`
- State allocation unchanged (1 value per state slot, still Float64 in `state.state[]`)
- State read/write steps are independent of value storage
- Two-phase lowering (lowerOutputsOnly + lower) — verify stateRead expr types are correct for materialization

**Wave 5 — Remaining easy blocks (MOP UP):**
- Any remaining unconverted adapter blocks, lens blocks, color blocks, layout blocks
- Mechanical conversions following established pattern

### Per-wave verification
- `npm run typecheck` passes
- `npm run test` — no new failures
- Visual validation of affected demo patches

## Phase 5: IR & Type Cleanup

**Goal:** Delete all vestiges of the dual-path architecture.

### Deletions
1. `LoweredSignal` → merge into `LoweredValue` (in `lowerTypes.ts`)
2. `StateMappingScalar` + `StateMappingField` → unified `StateMapping` (in `types.ts`)
3. `EvalStrategy` → simplify to `Continuous | Discrete` (cardinality is in arena descriptor)
4. `StepEvalValue` + `StepMaterialize` → unified `StepEvaluate`
5. `zipSig` kernel → replace with `zip` + implicit broadcast for mixed cardinalities
6. `ValueExprSignalEvaluator.ts` — DELETE entire file
7. `evaluateConstructSignal()` — DELETE
8. `BufferPool.ts` — DELETE (arena replaces it)
9. `fieldSlotSet`, `objectSlots` tracking — DELETE
10. `SlotMetaEntry.storage` field — DELETE (everything is arena)
11. `SCALAR_INSTANCE_ID` — may keep or replace with proper cardinality-one instance semantics

### Forbidden Pattern Tests
Add to `src/__tests__/forbidden-patterns.test.ts`:
- `LoweredSignal` must not exist
- `StateMappingScalar` / `StateMappingField` must not exist
- `evaluateValueExprSignal` must not exist
- `values\.f64` must not exist in runtime code
- `BufferPool` must not be imported

## Phase Dependencies

```
Phase 1 (Build arena) → Phase 2 (Shim: everything writes/reads arena → delete old storage)
                              ↓
                         Phase 3 (Convert slice natively: Const + math)
                              ↓
                         Phase 4 (Convert all remaining blocks, 5 waves)
                              ↓
                         Phase 5 (IR/type cleanup + deletion)
```

## GPU Compatibility

The arena is GPU-ready by design — a contiguous `Float32Array` is directly mappable as a WebGPU storage buffer. However, building a GPU render path is a separate workstream. **Recommendation:** Defer GPU rendering to a follow-on. The arena layout guarantees zero-copy upload capability. A WebGPU smoke test (upload arena to GPU, read back, verify) could be done as a quick validation after Phase 2, but full GPU rendering is its own project.

## First Step

**Phase 1: Build the arena.** Create `ArenaValueStore.ts`, compute arena layout in the compiler, allocate alongside existing storage. Zero risk to existing code. Proves the memory model.

Then immediately into **Phase 2a-2b:** wire both evaluators to write through to the arena. This is the critical transition — once everything writes to the arena, the old storage is dead weight.
