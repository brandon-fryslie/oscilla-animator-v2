# WebGPU P2/P3 Audit (2026-03-02)

Historical audit snapshot only. This document does not define active architecture or readiness criteria.
Canonical WebGPU architecture/design source remains `docs/WebGPU-Complete/`.

## Evidence Baseline
- Audit evidence references were captured against commit `6dd5b3730eeae7a90550ff741db6d360405a31e7` (`origin/master` at capture time).

## Scope
- Phase 2 (P2-1..P2-4)
- Phase 3 (P3-1..P3-5)

## Summary
- Readiness scripts report overall ready state (`overall: ready` / `overall=ready`).
- Core P2 compiler-worker boundary is in place.
- Active runtime wiring is still partial for full P3 contract execution.

## Findings

### P0: Compiled Naga WGSL is only published to simulation pipeline
// [LAW:one-source-of-truth] Compiler artifact publication should have one canonical runtime boundary.
- Runtime publishes only `compiledComputeWgsl` via `rebuildSimulationPipeline`.
- No active publish path for assembly WGSL / uber render WGSL, despite Rust exports existing.
- Evidence:
  - `src/services/RuntimeService.ts:247`
  - `src/services/RuntimeService.ts:268`
  - `src/services/compile-worker-protocol.ts:11`
  - `src/render/rust/worker-protocol.ts:20`
  - `src/render/rust/engine.worker.ts:356`
  - `src/render/wasm/oscilla_rust_renderer.ts:167`
  - `src/render/wasm/rust/oscilla-rust-renderer/src/lib.rs:86`

### P0: P3 draw-prep/render behavior remains placeholder in active Rust path
// [LAW:single-enforcer] Draw-prep sink metadata should drive indirect args through one execution boundary.
- `drawPrepProgram.sinks` compiles, but active renderer input publishes only counters/word counts.
- Default assembly shader sets indirect instance count from `global_uniforms[4].x`.
- Evidence:
  - `src/compiler/compile.ts:799`
  - `src/render/webgpu/RustWasmWebGPURenderer.ts:163`
  - `src/render/webgpu/RustWasmWebGPURenderer.ts:165`
  - `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:57`
  - `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:68`

### P1: Naga error mapping still collapses validator failures to Module-level location
// [LAW:single-enforcer] Validation boundary must preserve handle-level error identity once.
- TS parser supports `Expression[...]` and `Statement[...]`.
- Rust shim currently emits validator failure location as `"Module"`, limiting source-map mapping.
- Evidence:
  - `src/compiler/naga-compile.ts:20`
  - `src/compiler/wasm/rust/oscilla-naga-shim/src/lib.rs:638`

### P1: Scoped lowering boundary exists, but semantic coverage is partial
// [LAW:dataflow-not-control-flow] Structured lowering shape exists, but semantic completeness is incomplete.
- `evalOne` is lowered with typed-copy semantic fallback.
- `render`/`eventDispatch`/`continuityMapBuild` remain non-compute in lowering coverage.
- Evidence:
  - `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts:667`
  - `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts:701`
  - `src/compiler/compile.ts:315`

### P1: Readiness gates can overstate runtime reality
// [LAW:verifiable-goals] Gate criteria should include active runtime-path checks, not artifact status alone.
- Gate scripts are deterministic but mostly based on artifact status/completion metadata.
- Evidence:
  - `scripts/webgpu-readiness-check.mjs:121`
  - `scripts/webgpu-migration-readiness.mjs:191`
  - `src/render/webgpu/index.ts:1`

### P2: P2-1 doc completion note over-claims strict boot boundary
// [LAW:one-source-of-truth] Doc claims should match actual boot ownership.
- Startup compile is async worker-driven.
- Naga boot still occurs lazily inside compile flow, not strict pre-accept boundary.
- Evidence:
  - `docs/WebGPU-Complete/P2-1_Async_Compiler_Service_Architecture.md:200`
  - `src/services/RuntimeService.ts:305`
  - `src/compiler/naga-compile.ts:95`
  - `src/compiler/naga-bridge.ts:26`

## Verification Executed
- `pnpm -s typecheck`
- `pnpm -s vitest run src/services/__tests__/RuntimeService.test.ts src/services/__tests__/AsyncCompilerService.test.ts src/compiler/__tests__/naga-compile.test.ts`
- `pnpm -s vitest run src/render/webgpu/__tests__/WebGPURenderer.test.ts src/services/__tests__/AnimationLoop.test.ts`
- `node scripts/webgpu-readiness-check.mjs`
- `node scripts/webgpu-migration-readiness.mjs`
- `pnpm -s build:naga-shim`
- `pnpm -s build:rust-renderer`
