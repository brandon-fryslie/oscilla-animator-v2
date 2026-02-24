# Seam Inventory

// [LAW:one-source-of-truth] Inventory captures one canonical W1/W14 seam list used by planning/execution.
// [LAW:verifiable-goals] Every seam entry names a concrete code location and deterministic replacement direction.

## Class 1
- [S1] Code location: src/runtime/ValueExprMaterializer.ts:204
  Why seam: Field materialization still writes/reads vector payloads with interleaved AoS indexing (`i * stride + c`).
  Proposed change: Route construct/extract/broadcast/kernel buffer writes through shared SoA lane-plane helpers once canonical slot-plane descriptors exist.

- [S2] Code location: src/runtime/ContinuityApply.ts:162
  Why seam: Continuity mapping/apply loops are stride-interleaved (`newBufIdx = i * stride + s`), binding continuity behavior to AoS layout.
  Proposed change: Switch continuity apply/mapping transfer to per-component planes (`componentPlane + lane`) with deterministic lane mapping unchanged.

- [S3] Code location: src/runtime/RenderAssembler.ts:1039
  Why seam: Render assembly currently requires interleaved vec3/vec4 style buffers and slices by fixed AoS strides.
  Proposed change: Introduce render input adapters that read canonical SoA component planes and produce the existing renderer-facing packed scratch buffers at one boundary.

- [S4] Code location: src/compiler/compile.ts:331
  Why seam: Address table currently emits scalar expression arena addresses as one flat offset map, which is insufficient for multi-component SoA reads.
  Proposed change: Emit canonical expression-to-slot descriptor mapping (or expression-to-plane offsets) so runtime reads do not infer layout from stride math.

- [S5] Code location: src/__tests__/forbidden-patterns.test.ts
  Why seam: No static gate currently blocks new AoS hot-path formulas from reappearing during migration.
  Proposed change: Add W1/W14 bans for `lane * stride + component` style indexing in runtime/materializer/continuity/render hot-path modules.

// [LAW:one-source-of-truth] S6/S7/S8 class-2 contract unknowns were resolved in Ae1.
// Remaining work is class-1 migration execution against the locked contracts.
- [S6] Code location: src/runtime/ArenaValueStore.ts:8
  Why seam: Canonical descriptor contract is now explicit (`packing`, `laneStride`, `componentStride`) but producers/consumers still run AoS packing.
  Proposed change: flip runtime/compiler descriptor emission + read/write helpers to SoA packing and migrate remaining AoS consumers.

- [S7] Code location: src/compiler/ir/program.ts:347
  Why seam: RuntimeAddressTable now carries canonical scalar address metadata, but downstream modules still depend on offset-only maps.
  Proposed change: migrate remaining runtime readers to `scalarExprToArenaAddress`/descriptor-driven reads and remove offset-only compatibility path.

- [S8] Code location: src/runtime/RuntimeState.ts:665
  Why seam: Persistent state is now arena-backed (`stateArena` + view), but frame semantics still model single-bank writes only.
  Proposed change: introduce explicit read/write bank semantics on state arena segment for full ping-pong ownership.

## Class 2
- none
