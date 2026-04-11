# B4 — Signal Continuity

**Status:** Design — ready to implement
**Date:** 2026-04-08
**Supersedes:** The V1 continuity-pipeline system deleted in commit 6e2dd20fc (2026-03-22)
**Target stack:** `src/pillars/` backend + `oscilla-rust-renderer` (GPU-native)

---

## What this is

Signal continuity is the property that, when the user edits the node graph mid-playback and the compiler produces a new program, signals that logically correspond between the old and new program have their *phase and state continued* rather than restarted. An oscillator at phase 0.73 stays at phase 0.73. A lag filter's smoothing state carries across. An accumulator keeps accumulating from its current value. The animation flows through the recompile without visible or audible discontinuity.

This is the feature that makes Oscilla feel like *editing a running instrument* instead of *restarting a program*. It is the single distinctive behavior that justifies owning the render stack.

V1 shipped a continuity system on the CPU runtime. That runtime is gone. This document specifies a GPU-native replacement on the Pillars backend and the Rust renderer.

---

## The reframing that makes this tractable

Before any code, one observation that shapes everything: **the frame counter in `oscilla-rust-renderer` persists across `INSTALL_PIPELINE`**, and `sys:time` is a deterministic function of it (`engine.rs:311, 1228, 1511`):

```rust
let time_secs = (self.frame_count as f64 / 60.0) as f32;
```

This means: **any signal expressible as `f(sys:time, instance_data)` is already phase-continuous.** An oscillator written as `sin(time * ω + φ)` reads `time`, `time` advances monotonically through the recompile, and phase lands exactly where it should. A sawtooth written as `fract(time * freq)` continues smoothly. An LFO envelope that's a function of `time mod period` is continuous.

V1 migrated phase state because V1 ran kernels on CPU with wallclock time, and oscillators integrated phase per-frame. The new architecture doesn't need that work — phase is a pure function of time, time is a pure function of frame count, frame count persists. This is correct by construction, not by any migration logic.

> **Insight — why this is load-bearing:** the decision to make `sys:time` deterministic from a monotonic frame counter was made for determinism reasons, but it turns out to be the single most important continuity decision in the renderer — probably without being planned as such. It means continuity splits into two cleanly separated problems with very different costs, and one of them is already solved.

So continuity splits into **tiers**:

| Tier | What it covers | Cost |
|---|---|---|
| **0** | Time-pure signals: oscillators, LFOs, envelopes, scrolling patterns — anything `f(time, instance_data)` | **Free. Already works.** |
| **1** | Scalar state: UnitDelay, Lag, Accumulator, SampleHold, Slew, one-pole IIR filters | **This document** |
| **2** | Field state: per-instance versions of Tier 1, with lane remapping when InstanceDomain changes | Follow-up doc |
| **3** | Structural migration: block topology changes (e.g., delay length 1→4) | Research |

The scope of this document is **Tier 1**. Tier 2 is designed to slot in without breaking changes. Tier 3 is reserved as an escape hatch but not built.

---

## Principles

These are the non-negotiables the design must satisfy. The rest of the document is measured against them.

1. **`[LAW:dataflow-not-control-flow]`** Every compile produces the same output shape. A patch with zero stateful blocks produces a continuity manifest with zero entries, not a missing continuity manifest. The migration phase always runs; it copies zero bytes in the trivial case. No "is continuity needed?" branch anywhere.

2. **`[LAW:one-source-of-truth]`** A state slot has exactly one authoritative identity: a `StateId` derived from a stable block ID plus a block-declared state-kind label. There is no second lookup path.

3. **`[LAW:single-enforcer]`** State migration happens at exactly one point in the codebase: the worker's `INSTALL_PIPELINE` handler, in a dedicated migration phase that runs before the new pipeline's first frame.

4. **`[LAW:verifiable-goals]`** Determinism is a test, not a hope. The acceptance criterion is: given identical inputs (old state buffer, old manifest, new manifest), migration produces a bit-identical new state buffer, runnable in CI.

5. **Migration is causal, not wallclock-synchronized.** If recompile takes 50ms, the animation resumes at the next *frame*, not at `old_frame_time + 50ms`. This matches how `sys:time` already behaves and how modular synths work.

6. **State lives on the GPU.** No CPU readback. Migration is GPU-side buffer operations in a single command submission.

7. **Initial compile is not special.** The first pipeline install migrates from an empty continuity buffer. No branch for the first-compile case.

8. **Identity atoms.** `StableBlockId` is an arbitrary unique ID. It is not derived from anything, not computed from source, not recoverable from content. "Same ID = same object" is the entire semantics. Objects that don't have the same ID are different objects, and continuity is not attempted between them. UX concerns like fade-in/fade-out for appearing/disappearing objects are a separate problem and do not belong in the continuity system.

---

## Data model

### `StableBlockId` — identity

```ts
// src/core/ids.ts
export type StableBlockId = string & { readonly __brand: 'StableBlockId' };
```

Rules:

- Assigned at block creation time. UUID v4 in the UI path.
- Stored in the Patch. Round-trips through serialization (JSON, HCL, undo/redo history).
- Copy-paste generates a fresh `StableBlockId` — copied blocks are new objects, their state initializes fresh.
- Never derived from content, position, type, or source location.
- Equality is the entire semantics: same ID = same object.

**HCL fixtures and user-saved patches:**

- **User-saved patches**: the loader errors on blocks without `stableId`. User patches are durable documents where identity must survive disk round-trips, so blanks are a data integrity problem.
- **HCL fixtures**: the loader auto-assigns UUIDs in memory at load time. Fixtures are read-only test data; continuity across reloads is not meaningful for them. The assigned IDs are stable within a session.

**Undo/redo:** the Patch snapshot stores `stableId`, so undo restores IDs verbatim. A block that is deleted and then undone has the same `stableId` it had before deletion. Under normal circumstances, its state is preserved too (see below).

**Composite expansion:** composite *instances* are blocks in the user patch and have their own `StableBlockId`. The internals of a composite definition are not first-class state carriers — editing a composite's definition is an offline authoring task, not a live-editing concern, and is explicitly out of scope for continuity. If a composite definition changes, the instances using it may lose state on next compile; this is acceptable.

### `StateKind` — the block's internal label

A block may declare multiple state slots (a biquad has two prior outputs and two prior inputs). Each slot has a `StateKind` string chosen by the block author. `StateKind` is meaningful only within the block that declares it.

### `StateId` — the migration key

```ts
type StateId = `${StableBlockId}:${StateKind}`;
```

This is the key the migration phase uses to match slots between old and new manifests. It is globally unique within one compile and globally stable across compiles (assuming the block and its declaration survive).

### `StateSlotSpec` — the block's declaration

Added to `ManifestContribution` in `src/pillars/block-api.ts`:

```ts
interface StateSlotSpec {
  kind: StateKind;
  payload: PayloadType;           // determines stride (vec3 = 3 floats, float = 1)
  laneCount: LaneCount;           // Tier 1: always 'one'. Tier 2: { domain: DomainId }
  initial: ReadonlyArray<number>; // values on fresh allocation; length = stride * lanes
  migrationPolicy: MigrationPolicy;
}

type LaneCount = 'one' | { domain: DomainId }; // Tier 2 case reserved

type MigrationPolicy =
  | { kind: 'preserve' }          // bytes copy; requires layout match
  | { kind: 'reinitialize' }      // discard and use initial values
  | { kind: 'custom'; fn: SymbolId }; // Tier 3 escape hatch; not implemented
```

`preserve` is the overwhelmingly common case. `reinitialize` is used when a block's config change invalidates its state (e.g., filter type changes from lowpass to highpass). `custom` is reserved for Tier 3 and is not implemented in this milestone.

**LaneCount discriminant is a kind, not a layout.** Two slots sharing a `StateId` but differing in `laneCount` discriminant (`'one'` vs `{ domain }`) are semantically different objects — a scalar and a field — even if the numeric lane count happens to be 1. They classify as `reinitialize` with reason `kindChanged`, never as any form of preserve. This rule matches V1's handling and prevents a class of subtle bugs where a scalar's prior value would be interpreted as a single-lane field and vice versa.

### `ContinuityManifest` — assembly output

Added to `MemoryManifest` in `src/render/rust/boundary-contract.ts`:

```ts
interface ContinuityManifest {
  slots: Record<StateId, ContinuitySlotEntry>;
  totalBytes: number;             // size of the continuity region
}

interface ContinuitySlotEntry {
  byteOffset: number;             // offset into the continuity buffer (WGSL-aligned)
  byteLength: number;             // stride * laneCount * 4
  laneCount: number;              // Tier 1: always 1
  stride: number;                 // floats per lane, from payload
  initial: ReadonlyArray<number>;
  migrationPolicy: MigrationPolicy;
}
```

The existing `preserveStateOnRecompile` flag in `MemoryManifest` becomes the signal that this pipeline wants continuity applied. For Tier 0–1 we always set it true.

---

## GPU memory architecture

The current `GpuMemoryArena` allocates fresh on every `install_pipeline()` and drops the old arena. Continuity requires splitting this in two.

```
GpuMemoryArena {
  ephemeral: EphemeralRegion,    // globals, arena scalars, textures, domains
  continuity: ContinuityRegion,  // state slots — survives installs
}
```

The **ephemeral region** is exactly what exists today. No change to allocation strategy, layout, or lifetime. On `install_pipeline()`, a new ephemeral region is allocated and the old one is dropped after the new pipeline's first frame. Zero behavior change for non-stateful patches.

The **continuity region** is new. It's a single `wgpu::Buffer` sized from `ContinuityManifest.totalBytes`. Its layout is determined entirely by the manifest — assembly owns the layout, migration is a pure function of old-manifest → new-manifest.

### Persistent state on the Engine

```rust
pub struct Engine {
    // ... existing fields ...
    continuity_state: Option<ContinuityState>, // NEW — survives install_pipeline
}

struct ContinuityState {
    buffer: wgpu::Buffer,
    manifest: ContinuityManifest, // the manifest this buffer was allocated for
}
```

`continuity_state` is `Option` because the very first compile has nothing to migrate from. After the first `install_pipeline`, it is always `Some`. **The migration code handles `None` as "old manifest is empty, all slots classify as initialize."** No branch elsewhere. `[LAW:dataflow-not-control-flow]`

### Lifetime

- Bootstrap: `continuity_state = None`.
- First `install_pipeline`: allocate new continuity buffer from new manifest, run migration (writes `initial` values to every slot), set `continuity_state = Some(...)`.
- Subsequent `install_pipeline`: allocate new continuity buffer, run migration (reads from old buffer via old manifest, writes to new buffer via new manifest), replace `continuity_state`.
- Old continuity buffer is dropped after migration completes. `wgpu` buffer handles are reference-counted; the drop is safe once the migration submission has executed.

### WGSL alignment

Continuity slots are storage-buffer-backed. Byte offsets must respect WGSL alignment rules:

- `float` / scalar → 4-byte aligned
- `vec2<f32>` → 8-byte aligned
- `vec3<f32>` → 16-byte aligned (WGSL rounds vec3 to vec4 in storage)
- `vec4<f32>` → 16-byte aligned

Assembly computes offsets respecting these. Alignment violations are a silent correctness bug, so a validation pass in assembly asserts that every slot's offset satisfies its payload's alignment requirement.

---

## The migration phase

This is the heart of the design and where the determinism guarantee is earned.

### Trigger

`INSTALL_PIPELINE` message arrives at worker. Worker currently holds pipeline N with `continuity_state` C_N, and receives new payload P_{N+1}. Migration runs **between** parsing P_{N+1} and activating its first frame.

### Phases (in order, within a single `wgpu::Queue::submit`)

**Phase A — Classify.**

For each `stateId` in P_{N+1}'s continuity manifest:

- If `stateId` exists in old manifest AND layout matches exactly (same stride, same laneCount discriminant, same lane count, same payload kind): **class = preserve**.
- If `stateId` exists in old manifest AND payload kind matches AND laneCount discriminant matches, but stride or lane count differs: **class = preservePartial**. Copy `min(oldStride, newStride)` elements per lane (and `min(oldLaneCount, newLaneCount)` lanes for field slots), initialize the remainder from `initial`. This handles payload widening (float → vec2 keeps the float, inits the second component), payload narrowing (vec2 → float keeps the first component, discards the second — reported as lost bytes), and field growth/shrink under index-identity semantics. Derived from V1's partial-copy behavior in `src/runtime/StateMigration.ts:206–213, 247–256`.
- If `stateId` exists in old manifest AND payload kinds are incompatible (float vs bool) OR laneCount discriminants differ (`'one'` vs `{ domain }`): **class = reinitialize** with reason `kindChanged`. A scalar cannot become a field under the same ID, and vice versa.
- If `stateId` is new: **class = initialize**.

StateIds present in the old manifest but absent from the new manifest: **discarded** (the old buffer will be dropped; nothing to do).

Classification is a pure function over two manifests. It is unit-testable with no GPU involved. **All remapping data is computed statically during classification** — there are no callbacks or lookups consulted during command emission. This is a deliberate departure from V1's `getLaneMapping` callback pattern (`src/runtime/StateMigration.ts:84`): on the GPU side, the command-emission phase must be a straight-line consumer of a fully-specified plan, not a control-flow seam.

**Phase B — Allocate.**

A new continuity buffer, sized from `newManifest.totalBytes`. Initially undefined contents. Populated by Phase C.

**Phase C — Emit migration commands into a single `CommandEncoder`.**

For each slot in the new manifest, one of:

- **preserve** → `copy_buffer_to_buffer(old, oldOffset, new, newOffset, byteLength)` — GPU-side memcpy of the whole slot.
- **preservePartial** → for each lane that survives, `copy_buffer_to_buffer` of `min(oldStride, newStride) * 4` bytes into the new lane's offset, followed by `write_buffer` of the initial tail for any padding elements. For new lanes (field slot grew), a single `write_buffer` of the lane's initial. For dropped lanes (field slot shrank), nothing — the data is simply not copied. All command offsets are pre-computed in Phase A; command emission is a straight loop.
- **initialize** / **reinitialize** → `queue.write_buffer(new, newOffset, bytemuck::cast_slice(initial))` — small CPU→GPU upload.

All commands in one encoder, one submit. Migration is atomic from the renderer's perspective: either frame N+1 sees a fully migrated buffer, or nothing runs.

**Phase D — Swap.**

Once the submit completes, replace `continuity_state` with the new one. The old buffer's handle is dropped; `wgpu` frees it after its last use on the GPU timeline.

**Phase E — Resume.**

Pipeline N+1 starts. Its first frame reads state from the new continuity buffer, which holds exactly the migrated values.

> **Insight — why this is deterministic by construction:** Phase A is pure data-over-data, trivially testable. Phase C uses only `copy_buffer_to_buffer` and `write_buffer`, both of which have well-defined WebGPU semantics. There is no place in this pipeline for "works on Chrome but not Firefox" or "flaky on Metal." Determinism is structural, not a property that has to be defended test by test.

### About the "migration frame gap"

On the V1 CPU runtime, hot-swap was seamless because the CPU runtime could atomically swap program pointers between frames. On GPU, there is a theoretical window between "old pipeline's last frame" and "new pipeline's first frame" during which nothing is being rendered. In practice:

- Migration is a single submission containing a handful of `copy_buffer_to_buffer` / `write_buffer` calls for state sizes measured in kilobytes. Expected duration: sub-millisecond on any modern GPU.
- The browser does not repaint during this gap; it holds the last presented frame. There is no blank.
- At 60fps (~16.7ms per frame), a sub-millisecond migration fits comfortably within the same frame budget as the old pipeline's final work.

The design target is **zero visible gap**. If profiling in Milestone 1 shows otherwise, the fallback is to run migration on a dedicated queue and fence against the next frame's encoder — but we don't build that unless measurement demands it.

### Removed block behavior

Deleting a block usually produces a compile error, in which case no new pipeline is installed and the existing pipeline keeps running — state is preserved automatically. If the delete *does* produce a valid compile (e.g., the block was disconnected), the block's `StateId`s are absent from the new manifest and their state is discarded. If the user then undoes the delete, the block reappears with its original `stableId` via Patch history, and:

- If no intervening compile happened (still a compile error, or delete→undo was a single atomic action), the old pipeline is still running and the state was never discarded.
- If an intervening compile happened and the state was discarded, the undone block's state reinitializes.

This is correct: undo restores *the graph*, not *the running GPU state*. We accept the reinitialize in the rare case it occurs.

---

## IR extensions

The block IR (`src/render/gpu-ir/ir-builders.ts`) gains two primitives:

```ts
stateRead(slotId: StateId): ExprIR
stateWrite(slotId: StateId, value: ExprIR): StatementIR
```

The Naga translator binds these to storage-buffer reads and writes against the continuity buffer at the manifest-declared offset.

**Ordering rule, per frame, per slot:** all `stateRead`s precede all `stateWrite`s for the same slot in the generated WGSL. The lowering pass enforces this: a block that reads-then-writes its own state emits the read as an `ExprIR` used in computing the new value, and the new value as the `stateWrite`. Tier 1 has no cross-slot ordering concerns because each slot is owned by exactly one block; Tier 2 may need explicit ordering for feedback topologies and will extend this rule.

### Example: UnitDelay

```ts
// declaration
stateSlots: [
  { kind: 'prior', payload: float, laneCount: 'one',
    initial: [0], migrationPolicy: { kind: 'preserve' } }
]

// lowering
const prior = ctx.stateRead('prior');
ctx.stateWrite('prior', inputExpr);
return prior;               // output is the prior value
```

### Example: Lag (one-pole lowpass)

```ts
// declaration
stateSlots: [
  { kind: 'y_prev', payload: float, laneCount: 'one',
    initial: [0], migrationPolicy: { kind: 'preserve' } }
]

// lowering
const prev = ctx.stateRead('y_prev');
const y = prev.mul(alpha).add(input.mul(oneMinus(alpha)));
ctx.stateWrite('y_prev', y);
return y;
```

The read-before-write ordering makes the block's semantics unambiguous and makes the state layout a pure declaration.

---

## Worker protocol

The existing `INSTALL_PIPELINE` inbound message does not need a new kind — migration metadata travels inside `PipelineInstallPayload.manifest.continuity`. The worker simply runs the migration phase between parsing the payload and activating the new pipeline.

**One new outbound message** for observability:

```ts
interface ContinuityMigrationReport {
  type: 'CONTINUITY_MIGRATION_REPORT';
  // Slot-level counts
  preserved: number;       // class = preserve
  preservedPartial: number;// class = preservePartial (stride/lane-count changed compatibly)
  reinitialized: number;   // class = reinitialize (kind changed)
  initialized: number;     // class = initialize (new slot)
  discarded: number;       // slots in old manifest, absent from new
  // Lane-level counts (aggregated across all slots, becomes meaningful in Tier 2)
  lanesMigrated: number;
  lanesInitialized: number;
  // Byte-level counts
  bytesCopied: number;     // bytes successfully preserved (full + partial)
  bytesLost: number;       // bytes truncated by preservePartial narrowing (strictly informational)
  totalBytes: number;      // size of new continuity region
  // Timing
  migrationMicros: number; // wall time of the migration submit
  // Optional per-slot detail, gated by a debug flag — off in production
  details?: SlotMigrationDetail[];
}

interface SlotMigrationDetail {
  stateId: StateId;
  action: 'preserved' | 'preservedPartial' | 'reinitialized' | 'initialized' | 'discarded';
  reason?: 'missingOldState' | 'kindChanged' | 'strideChanged' | 'laneCountChanged' | 'removed';
  lanesMigrated?: number;
  lanesInitialized?: number;
  bytesCopied?: number;
  bytesLost?: number;
}
```

The slot-level counts are always populated; lane-level and byte-level counts aggregate across all slots and become most useful in Tier 2 when field slots can be partially remapped. The optional `details` array is gated by a debug flag (`preserveStateDiagnostics` on the manifest, default off) so production installs don't pay the allocation cost.

Delivered to a minimal `ContinuityStore` in `src/stores/` that holds only the last report. The UI uses it to show diagnostics ("28 preserved, 2 partial (12 bytes lost), 3 reinitialized"). This is observability, not correctness — but the V1 system's per-slot `StateMigrationDetail` proved valuable for answering "why didn't my filter's state survive?" and it's cheap to carry forward.

---

## Determinism guarantees and verification

Each guarantee below has a corresponding CI test. Adding the system means adding these tests.

### G1 — Classification is pure

**Claim:** Given two `ContinuityManifest`s, the classification phase produces the same result regardless of invocation order, map iteration order, or any ambient state.

**Test:** TS unit test. Feed in old/new manifest pairs covering every classification outcome. Assert result. Randomize `Record` insertion order to catch iteration-order bugs.

### G2 — Migration is a pure function

**Claim:** Given an old continuity buffer (bytes), an old manifest, and a new manifest, the migrated buffer is bit-identical across runs.

**Test:** Native headless WebGPU test. Two engines, same patch, run N frames, edit identically, download post-migration buffers via `buffer.map_async`, assert bit-identical.

### G3 — Roundtrip continuity (the killer test)

**Claim:** Given a running patch with stateful blocks, running frame K → snapshotting → reinstalling the *same* pipeline → running frame K+1 produces the same output as running frame K+1 without reinstall.

**Test:** Render patch for K frames, capture frame K+1 output. Repeat, but install-same-payload before frame K+1, capture again. Assert bit-identical output.

This is the test that catches the subtle bug class "migration preserves bytes but block reads from a different offset on the new pipeline." That produces identical buffers but different outputs.

### G4 — Identity stability under Patch edits

**Claim:** Editing a block's connections or config (without deleting the block) preserves its `StableBlockId`, preserving its `StateId`, preserving its continuity.

**Test:** TS unit test on Patch mutation API. Create a block, capture `stableId`, perform every supported edit kind, assert `stableId` unchanged.

### G5 — Tier 0 time continuity

**Claim:** `f(sys:time)` signals are phase-continuous across any pipeline install.

**Test:** Native headless. Render a pure sine wave for N frames. At frame N/2, trigger a no-op pipeline reinstall. Assert output at frame N/2+1 equals `sin((N/2+1)/60.0 * ω)` to floating-point precision. No drift.

### What is *not* guaranteed

- **Cross-device GPU determinism.** WebGPU does not guarantee bit-identical floating-point across GPUs. Continuity is deterministic *within a session on one device*.
- **Composite definition edits.** Out of scope by design (see §Data model).
- **Tier 3 structural changes** (e.g., UnitDelay length 1→4). Classified as `reinitialize` in Tier 1.

---

## Milestones

### M0 — Identity (prerequisite)

- `StableBlockId` branded type in `src/core/ids.ts`.
- `stableId` field on `Block` in `src/graph/Patch.ts`. UI generates UUID v4 on creation.
- Patch serialization round-trips `stableId`.
- HCL loader: auto-assign in memory for fixtures; error on user-saved patches without IDs.
- `stableId` propagates through `src/graph/normalize.ts` and into `NormalizedNode` in `src/pillars/frontend/normalized-graph.ts`.
- Test G4 passes.

**Gate:** `stableId` appears on every `NormalizedNode`; Patch mutation test suite passes.

### M1 — Infrastructure (plumbing, zero stateful blocks)

- `StateSlotSpec`, `ContinuityManifest`, `ContinuitySlotEntry` in `src/render/rust/boundary-contract.ts` (Zod + serde).
- Extend `ManifestContribution` in `src/pillars/block-api.ts` with optional `stateSlots`.
- Extend `src/pillars/lowering/` to collect slots into a `ContinuityManifest` during harvest.
- Extend `src/pillars/assembly/` to emit the manifest into `PipelineInstallPayload.manifest.continuity`, respecting WGSL alignment.
- Rust: split `GpuMemoryArena` into ephemeral + continuity regions. Add `continuity_state: Option<ContinuityState>` to `Engine`.
- Implement the migration phase (classify + execute) in `install_pipeline`.
- Emit `CONTINUITY_MIGRATION_REPORT`.
- Minimal `ContinuityStore` in `src/stores/` — holds last report only.
- Tests G1, G2, G5 pass.

**Gate:** existing Pillars fixtures render identically with continuity enabled, reporting zero preserved / zero initialized. No visible gap during pipeline reinstall on test hardware.

### M2 — First stateful block (`UnitDelay`) + G3

- Implement `UnitDelay` in `src/pillars/blocks/`. One scalar state slot, `preserve` policy.
- Add `stateRead` / `stateWrite` to `src/render/gpu-ir/ir-builders.ts`.
- Extend the Naga translator (`oscilla-rust-renderer/src/translator.rs`) to lower state ops to WGSL storage buffer reads/writes.
- Fixture: UnitDelay chain fed by a time-driven sawtooth (Tier 0 upstream, Tier 1 in the delay).
- Screenshot gate via `get-screenshot-of-payload-tester.sh`.
- Test G3 passes bit-for-bit.

**Gate:** UnitDelay continues across reinstall. Roundtrip test bit-identical.

### M3 — The useful stateful block set

Port (or newly implement) `Lag`, `Accumulator`, `SampleHold`, `Slew`. Each is its own small PR with a fixture and test. All use the same `stateRead` / `stateWrite` machinery and the same `preserve` migration policy.

**Gate:** a reasonably complex patch using several blocks survives live editing with visible phase continuity.

### M4 — Field state (Tier 2)

Separate design document. Extends `StateSlotSpec.laneCount` to `{ domain: DomainId }`, adds lane remapping by stable instance identity, adds a migration compute shader for the `migrate` classification. Do not begin until M0–M3 are solid.

---

## Files to change

| File | Change |
|---|---|
| `src/core/ids.ts` | Add `StableBlockId` |
| `src/graph/Patch.ts` | Add `stableId` to `Block`, serialization |
| `src/graph/normalize.ts` | Propagate `stableId` |
| `src/patch-dsl/` | HCL loader: auto-assign for fixtures, error for user patches missing IDs |
| `src/pillars/block-api.ts` | `stateSlots` in `ManifestContribution`; context helpers `stateRead`/`stateWrite` |
| `src/pillars/frontend/normalized-graph.ts` | `stableId` on `NormalizedNode` |
| `src/pillars/lowering/manifest-merge.ts` | Collect and merge state slots |
| `src/pillars/assembly/` | Emit `ContinuityManifest`, WGSL alignment validation |
| `src/render/rust/boundary-contract.ts` | Zod schemas for `ContinuityManifest`, `StateSlotSpec` |
| `src/render/gpu-ir/ir-builders.ts` | `stateRead`, `stateWrite` primitives |
| `src/render/gpu-ir/compile.ts` | Walker handles state ops |
| `src/render/rust/worker-protocol.ts` | `CONTINUITY_MIGRATION_REPORT` outbound message |
| `oscilla-rust-renderer/src/mmu.rs` | Split arena into ephemeral + continuity |
| `oscilla-rust-renderer/src/engine.rs` | `continuity_state`, migration phase in `install_pipeline` |
| `oscilla-rust-renderer/src/translator.rs` | Lower state ops to WGSL storage buffer I/O |
| `src/stores/ContinuityStore.ts` | New, minimal — holds last migration report |
| `src/pillars/blocks/unit-delay.ts` | M2 |
| `src/pillars/blocks/{lag,accumulator,sample-hold,slew}.ts` | M3 |
| `src/__tests__/continuity-*.test.ts` | G1–G5 determinism suite |

---

## Open questions (non-blocking)

1. **Exact UUID implementation** — `crypto.randomUUID()` is browser-native and sufficient. No library needed. Confirm in M0.

2. **Migration profiling on real hardware** — expected sub-millisecond but should be measured in M1 on the test target GPUs before committing to "zero visible gap."

3. **V1 `StateMigration.ts` archaeology — done.** Read `src/runtime/StateMigration.ts` (dead code) 2026-04-08. Findings folded into this document: (a) stride-compatible partial copy added as `preservePartial` class, (b) per-slot diagnostic details added to the migration report, (c) `laneCount` discriminant kind-change rule made explicit, (d) lane mappings computed statically in Phase A rather than via runtime callbacks, (e) lane-level counters added to the report. The V1 implementation is otherwise not a good reference: its state buffer was a `Float32Array` mutated in place, which doesn't map to the GPU submission model at all.

4. **Interaction with the 4-Pillar refactor.** This plan targets `src/pillars/` directly, which is the correct destination. Implementation should sequence after the 4-Pillar foundations are stable enough to take structural additions — otherwise we build on shifting ground. Baking continuity in at the earliest stable point is the goal.

---

## Appendix: what changed from V1

| Concern | V1 (deleted) | This design |
|---|---|---|
| Runtime | CPU frame executor | GPU via Rust renderer |
| State storage | `Float32Array` in JS | `wgpu::Buffer` on GPU |
| Block identity | Sequential `b0`, `b1`, ... (broken across reloads) | `StableBlockId` UUIDs (stable) |
| State migration | JS `migrateState()` function | GPU `copy_buffer_to_buffer` + `write_buffer` |
| Time continuity | Integrated wallclock phase | Already free via deterministic frame counter |
| First-compile special case | Yes | No — empty old manifest is the normal case |
| Lane remapping | Full implementation (scalar + field) | Tier 1: none. Tier 2: planned |
| Diagnostic UI | Full `ContinuityStore` with per-slot inspection | Minimal `ContinuityStore` with last-report only |

The V1 design was shaped by CPU-runtime constraints that no longer apply. The new design is smaller, more deterministic, and inherits Tier 0 for free from an unrelated architectural decision.
