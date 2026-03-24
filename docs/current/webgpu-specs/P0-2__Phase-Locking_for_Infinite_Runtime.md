> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/current/webgpu-specs/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **Phase 0: The f32 Phase-Lock**.

# Phase 0: The f32 Phase-Lock

## Related Contracts

- `docs/current/webgpu-specs/IMPLEMENTATION-INDEX.md`
- `docs/current/webgpu-specs/P3-1_CPU_to_GPU_Input_Marshalling.md`
- `docs/current/webgpu-specs/P3-2_GPU_Compute_Dispatch_Explained.md`

**Objective:** Guarantee infinite-runtime temporal stability under the WebGPU-oriented `f32` contract.

// [LAW:one-source-of-truth] Runtime time channels are produced by `resolveTime` and consumed through canonical time expressions (`tMs`, `dt`, `phaseA`, `phaseB`, `pulse`, `palette`, `energy`).
// [LAW:single-enforcer] Phase boundedness for stateful phase accumulators is enforced at runtime write boundaries (`applyStateWritePolicy`) and phasor lowering (`Wrap01`).

## 1. Canonical Time Contract

### 1.1 Delta Time Is First-Class

1. Runtime computes per-frame `dt` from absolute frame timestamps.
2. `dt` is part of the canonical time payload emitted to execution.
3. Backward absolute-time movement clamps to `dt = 0` (no reverse phase accumulation).

### 1.2 Bounded Phase Channels

1. `phaseA` and `phaseB` are always resolved in `[0, 1)`.
2. Phase wrapping uses canonical `wrapPhase` semantics.
3. Time-model transitions preserve continuity through phase-offset reconciliation.

### 1.3 Monotonic Runtime Time

1. `tMs` is monotonic at runtime (never decreases across frames).
2. Runtime continuity and hot-swap paths are evaluated against this monotonic clock.

// [LAW:dataflow-not-control-flow] Time channels are resolved every frame in a fixed order; stability is encoded in bounded values (`dt`, wrapped phases), not conditional execution paths.

## 2. Stateful Oscillation Contract

### 2.1 Phasor Is Stateful

1. `Phasor` stores persistent phase state.
2. Per frame, it computes increment from `frequency * dtSeconds`.
3. It writes wrapped phase (`Wrap01`) back to state and output.

### 2.2 Waveshapers Consume Phase

1. `Oscillator` and trigonometric transforms operate as waveshaping over phase/radians inputs.
2. Canonical infinite-runtime motion path is phase-driven (bounded) rather than unbounded time accumulation.

### 2.3 Runtime State Writes Preserve Bounds

1. Runtime phase-like state writes pass through state write policy wrapping.
2. Long-run execution keeps phasor state finite and in `[0,1)`.

## 3. Verification Gates

Run these commands to validate this contract:

1. `pnpm vitest run src/runtime/__tests__/phase-continuity-offset.test.ts`
2. `pnpm vitest run src/runtime/__tests__/temporal-comparison.test.ts`
3. `pnpm vitest run src/runtime/__tests__/executeFrameStepped.test.ts`
4. `pnpm vitest run src/__tests__/forbidden-patterns.test.ts`

## 4. Non-Goals in This Phase

1. Offline export/bake-time exact frame-phase upload is not part of the current runtime contract.
2. Any future export pipeline must define its own deterministic phase source without weakening the live runtime phase-lock contract.

// [LAW:no-mode-explosion] Export-specific phase policies stay outside live runtime execution unless they become canonical and singular.

## 5. Contract Acceptance Criteria

This contract is satisfied when all of the following remain true:

1. Runtime emits stable, monotonic time channels with `dt` as canonical input.
2. Stateful phasor execution remains bounded in `[0,1)` over long horizons.
3. Hot-swap/time-model transitions preserve phase continuity.
4. Regression tests enforce these invariants.
