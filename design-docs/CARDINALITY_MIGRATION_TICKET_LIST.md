# Cardinality Unification — Full Ticket List

Ordered execution plan for the cardinality unification migration.
All tickets use the `oscilla-animator-v2-` prefix (shortened below).

---

## Runtime Prerequisite (Now Complete)

The CT/ICT cardinality-policy refactor that unblocked this migration is complete:

| Ticket | Title | Status |
|--------|-------|--------|
| **cpc** | Implement cardinalityVar system for compile-time cardinality resolution | **DONE** |
| **cpc.1** | Migrate math/signal/lens blocks to explicit CT/ICT cardinality policies | **DONE** |
| **cpc.2** | Migrate layout/render/field/domain blocks to explicit CT/ICT cardinality policies | **DONE** |
| **cpc.3** | Remove legacy cardinality fallback from frontend extraction and adapter planning | **DONE** |
| **cpc.4** | Delete obsolete mode-based tests and enforce no-legacy-cardinality-patterns | **DONE** |

This ticket list now tracks the remaining runtime/compiler migration to remove the signal concept.

---

## Pre-Work (before arena begins) — COMPLETE

These reduce the arena migration's touch surface from ~6 files with ~3 caches
to ~2 files with ~1 addressing structure.

| # | Ticket | Title | Status |
|---|--------|-------|--------|
| 1 | **f433** | Unify slot lookup maps into single ExprAddressTable | **DONE** (63a7aac1) — `SlotLookupCache.ts` → `ExprAddressTable.ts`. Three WeakMap caches unified into single `ExprAddressTable` interface. All consumers migrated. |
| 2 | **9t64** | Centralize storage class derivation into single deriveStorageClass() | **DONE** (63a7aac1) — `src/compiler/ir/storage-class.ts` with `deriveStorageLayout()`. `compile.ts` inline derivation replaced with single call. |

---

## Phase 1 — Build the Arena (COMPLETE)

Build a contiguous Float32Array that holds all numeric values. Both old storage
and arena active simultaneously — zero risk to existing code.

| # | Ticket | Title | Notes | Status |
|---|--------|-------|-------|--------|
| 3 | **objx** | (EPIC) Build the Float32 Arena | Parent epic. | **DONE** |
| 4 | **objx.1** | Create ArenaValueStore module with types and helpers | `ArenaSlotDescriptor`, `createArena`, `arenaRead`, `arenaWrite`, `arenaSlice`. New file: `src/runtime/ArenaValueStore.ts`. | **DONE** |
| 5 | **objx.2** | Compiler emits arena layout in convertLinkedIRToProgram | Bump-allocate descriptors in the slot loop. Add `arenaLayout` and `arenaTotalFloats` to `CompiledProgramIR`. Depends on objx.1. | **DONE** |
| 6 | **objx.3** | Allocate arena Float32Array in createProgramState | Add `arena: Float32Array` to `RuntimeState`. Allocate alongside existing storage. Depends on objx.1, objx.2. | **DONE** |

---

## Phase 2 — Shim Old Evaluators to Arena + Delete Old Storage (COMPLETE)

Wire both evaluators to write through to arena, migrate all readers, then delete
old storage.

| # | Ticket | Title | Notes | Status |
|---|--------|-------|-------|--------|
| 7 | **zdru** | (EPIC) Shim to Arena + Delete Old Storage | Parent epic. Depends on objx. | OPEN |
| 8 | **zdru.1** | Wire signal evaluation writes to arena | Write-through: both f64 AND arena get written. | **DONE** |
| 9 | **zdru.2** | Wire field materialization writes to arena | `materializeValueExpr()` gets optional target buffer param. | **DONE** |
| 10 | **zdru.3** | Migrate RenderAssembler to read from arena | Hot render path. Depends on zdru.1, zdru.2. | **DONE** |
| 11 | **zdru.4** | Migrate DebugService to read from arena | Update EdgeValueResult construction. Depends on zdru.1, zdru.2. | **DONE** |
| 12 | **zdru.5** | Update SlotLookupCache for arena-only lookups | Arena-aware lookups from `program.arenaLayout`. Depends on zdru.1, zdru.2. | **DONE** |
| 13 | **zdru.6** | Migrate continuity system to read/write arena | Base buffers from arena slices. Depends on zdru.1, zdru.2. | **DONE** |
| 14 | **zdru.7** | Delete f64 and objects storage | `ValueStore.f64` removed. Numeric materialize/continuity paths now require arena descriptors; numeric object-map fallback is removed. `values.objects` is constrained to render-frame and non-numeric payload references. Depends on zdru.1–6. | **DONE** |

zdru.1 and zdru.2 can be done in parallel. zdru.3–6 can be done in parallel
after both writers land.

---

## Phase 3 — Prove the Pattern (Const + Math) (IN PROGRESS)

Convert Const as proof-of-concept, then prime the pipeline with easy blocks.

| # | Ticket | Title | Notes | Status |
|---|--------|-------|-------|--------|
| 15 | **99dq** | (EPIC) Prove the Pattern | Parent epic. Depends on zdru. | OPEN |
| 16 | **99dq.1** | Create SCALAR_INSTANCE_ID for cardinality-one materialization | Well-known InstanceId with count=1. | **DONE** |
| 17 | **99dq.2** | Convert Const block to LoweredField(count=1) | Proof-of-concept. Depends on 99dq.1. | OPEN |
| 18 | **99dq.3** | Convert ~10–20 easy/medium blocks | Math, simple signal generators. Depends on 99dq.2. | OPEN |

---

## Phase 4 — Convert All Remaining Blocks

Hardest first. Validate assumptions before converting the long tail.

| # | Ticket | Title | Notes |
|---|--------|-------|-------|
| 19 | **wbhc** | (EPIC) Convert All Remaining Blocks | Parent epic. Depends on 99dq. |
| 20 | **wbhc.1** | Wave 1: Expression block (HARDEST) | Dynamic type resolution, component reconstruction. |
| 21 | **wbhc.2** | Wave 2: Broadcast block (HARD) | field-of-1 to field-of-N, adapter system implications. Depends on wbhc.1. |
| 22 | **wbhc.3** | Wave 3: Multi-component blocks (MEDIUM-HARD) | vec3, color, construct. Delete `evaluateConstructSignal()`. Depends on wbhc.1, wbhc.2. |
| 23 | **wbhc.4** | Wave 4: Stateful blocks (MEDIUM) | accumulator, unit-delay, lag. Two-phase lowering. Depends on wbhc.2, wbhc.3. |
| 24 | **wbhc.5** | Wave 5: Remaining blocks (EASY) | Adapters, lenses, mop up. Depends on wbhc.3, wbhc.4. |

---

## Phase 5 — IR & Type Cleanup: Delete Dual-Path Vestiges

Delete everything left over from the old signal/field split.

| # | Ticket | Title | Notes |
|---|--------|-------|-------|
| 25 | **v91n** | (EPIC) Delete Dual-Path Vestiges | Parent epic. Depends on wbhc. |
| 26 | **v91n.1** | Merge LoweredSignal + LoweredField into unified LoweredValue | Single IR type. |
| 27 | **v91n.2** | Unify StateMappingScalar + StateMappingField | Single StateMapping with laneCount. Depends on v91n.1. |
| 28 | **v91n.3** | Simplify EvalStrategy, merge StepEvalValue + StepMaterialize | Continuous or Discrete only. Depends on v91n.1. |
| 29 | **v91n.4** | Replace zipSig kernel with zip + implicit broadcast | Depends on v91n.3. |
| 30 | **v91n.5** | Delete ValueExprSignalEvaluator and evaluateConstructSignal | DELETE entire file. Depends on v91n.3, v91n.4. |
| 31 | **v91n.6** | Delete BufferPool | DELETE `src/runtime/BufferPool.ts`. Depends on v91n.5. |
| 32 | **v91n.7** | Delete remaining dual-path vestiges | fieldSlotSet, objectSlots, storage field. Depends on v91n.1–6. |
| 33 | **v91n.8** | Add forbidden pattern tests | CI grep checks prevent regression. Depends on v91n.7. |

---

## Active Workstreams (Current Beads State)

`IN_PROGRESS`:
- **wbhc.1** — Wave 1: Expression conversion
- **wbhc.2** — Wave 2: Broadcast conversion
- **v91n.1** — LoweredSignal/LoweredField unification
- **v91n.3** — Step/EvalStrategy unification
- **v91n.4** — zipSig removal
- **v91n.5** — ValueExprSignalEvaluator/evaluateConstructSignal deletion
- **v91n.6** — BufferPool deletion

This list should mirror beads; if it drifts, beads is authoritative.

---

## Closed / Not Applicable

| Ticket | Title | Disposition |
|--------|-------|-------------|
| **cpc**, **cpc.1**, **cpc.2**, **cpc.3**, **cpc.4** | CT/ICT cardinality policy refactor | Closed. This blocker is complete; migration now focuses on runtime/compiler dual-path deletion. |
| **73lv** | Zero-cardinality enforcement | Closed (will not do). "Put constants in a lookup table" is a separate optimization with no change in effort if done later. |
| **0l3** | Typed scalar banks (f32/i32/shape2d) | Closed (subsumed). The arena IS the typed Float32 bank; shape2d bank already exists. |

---

## Dependency Graph

```
f433 (unify slot maps) ──┐
                         ├──→ objx.1 → objx.2 → objx.3
9t64 (deriveStorageClass)┘          │
                                    ↓
                    zdru.1 (signal writes) ──┐
                    zdru.2 (field writes)  ──┤
                                             ├──→ zdru.3 (render reads)
                                             ├──→ zdru.4 (debug reads)
                                             ├──→ zdru.5 (slot lookups)
                                             ├──→ zdru.6 (continuity)
                                             └──→ zdru.7 (delete old storage)
                                                        │
                                                        ↓
                              99dq.1 → 99dq.2 → 99dq.3
                                                   │
                                                   ↓
                        wbhc.1 → wbhc.2 → wbhc.3 → wbhc.4 → wbhc.5
                                                                │
                                                                ↓
               v91n.1 → v91n.2              v91n.1 → v91n.3 → v91n.4
                                                               │
                                                               ↓
                                                    v91n.5 → v91n.6
                                                               │
                                                               ↓
                                                    v91n.7 → v91n.8
```

**Total**: 2 pre-work + 3 Phase 1 + 7 Phase 2 + 3 Phase 3 + 5 Phase 4 + 8 Phase 5 = **28 tasks** across 5 epics.
