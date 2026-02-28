> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **Phase 0: The SoA Mandate (Completed Baseline)**.

# Phase 0: The Structure-of-Arrays Mandate

**Objective:** Keep runtime memory layout canonical for WebGPU execution: channel-oriented, deterministic, and compiler-owned.

**Current State:** This is no longer a pre-migration plan. It is the enforced baseline contract for `master`.

// [LAW:one-source-of-truth] Arena layout and runtime addressing are emitted by the compiler as authoritative artifacts.
// [LAW:single-enforcer] Runtime reads/writes must resolve through canonical arena descriptors and runtime address tables, not ad-hoc slot derivation.

## 1. Canonical Memory Contract

### 1.1 Arena as Canonical Numeric Store

1. Runtime numeric values live in a contiguous `Float32Array` arena.
2. The compiler emits `arenaLayout` and `runtimeAddressTable` that describe exactly where each slot lives.
3. Runtime execution consumes those artifacts directly.

### 1.2 SoA-First Descriptor Semantics

1. Canonical packing is SoA (`packing: 'soa'`) for slot descriptors.
2. Descriptor fields (`stride`, `laneCount`, `laneStride`, `componentStride`) define lane/component addressing.
3. Descriptor-driven access (`arenaRead`, `arenaWrite`, `arenaIndex`) is the only valid hot-path addressing model.

// [LAW:dataflow-not-control-flow] The same descriptor-based addressing operations run every frame; only input values vary.

### 1.3 Shape/Data Separation

1. Arena stores numeric payloads only (`f32` contract for runtime slot storage).
2. Shape/topology metadata is stored in dedicated non-arena banks (packed `u32` structures), referenced by numeric handles.
3. Arena does not carry object-shaped runtime payloads.

// [LAW:one-way-deps] Render/runtime consume compiler-emitted numeric contracts; they do not re-derive schema from high-level graph objects.

## 2. Compiler Requirements (Now Enforced)

### 2.1 Required Artifacts

The compiler must emit and keep consistent:

1. `slotMeta`
2. `runtimeSlots`
3. `runtimeAddressTable`
4. `arenaLayout`
5. `arenaTotalFloats`

### 2.2 Descriptor Derivation Rules

1. Descriptor `stride` is payload-derived.
2. Descriptor `laneCount` is cardinality-derived (including dynamic-instance max count where applicable).
3. Descriptor `length` is `stride * laneCount`.
4. Default packing preference is SoA.

### 2.3 Determinism

1. Repeated compilation of identical input must produce deterministic arena offsets/descriptors.
2. Descriptor ranges must be non-overlapping for active slots.
3. `arenaTotalFloats` must equal the sum of descriptor lengths.

// [LAW:verifiable-goals] These rules are mechanically enforced by compiler/runtime layout tests.

## 3. Runtime Requirements (Now Enforced)

### 3.1 Addressing and Execution

1. Runtime execution must use compiler-emitted address metadata (no legacy metadata derivation).
2. Arena allocation must exactly match `arenaTotalFloats`.
3. Slot reads/writes in hot paths must route through canonical descriptor-aware indexing.

### 3.2 No Legacy Numeric Paths

1. Legacy `f64`/object runtime storage labels are not part of the canonical slot ABI.
2. Runtime hot paths must not branch on legacy storage labels.
3. Fallback storage models are prohibited for canonical execution.

// [LAW:no-silent-fallbacks] Invalid/legacy addressing assumptions fail fast instead of silently selecting alternate paths.

## 4. Verification Gates

Run these to verify this phase remains complete:

1. `pnpm vitest run src/compiler/__tests__/arena-layout.test.ts`
2. `pnpm vitest run src/runtime/__tests__/ArenaValueStore.test.ts src/runtime/__tests__/RuntimeState-banks.test.ts`
3. `pnpm vitest run src/runtime/__tests__/ExprAddressTable.test.ts`
4. `pnpm vitest run src/__tests__/forbidden-patterns.test.ts src/compiler/__tests__/no-legacy-types.test.ts`

## 5. Remaining Cleanup Scope (Non-Blocking)

This phase is complete, but cleanup work can still reduce migration residue:

1. Remove migration-era language and compatibility comments that no longer describe canonical behavior.
2. Keep shrinking any non-canonical packing compatibility seams where not required by continuity/render contracts.
3. Maintain test gates as the sole enforcement boundary for SoA/ABI invariants.

// [LAW:behavior-not-structure] Keep tests focused on memory and addressing behavior contracts, not historical implementation shape.

## 6. Definition of Done (Phase 0)

Phase 0 is considered complete when all of the following remain true on `master`:

1. Compiler emits deterministic canonical arena/address artifacts.
2. Runtime executes exclusively from those artifacts.
3. Numeric slot ABI stays SoA-first and WebGPU-compatible.
4. Guardrail tests prevent regression to legacy memory/addressing behavior.

This condition is currently met; future work should treat this document as a maintained contract, not a migration checklist.
