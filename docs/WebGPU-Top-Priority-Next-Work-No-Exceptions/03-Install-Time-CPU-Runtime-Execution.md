# 03 - Install-Time CPU Runtime Execution

Spec target: `../WebGPU-Complete/P5-3__Phased_Rollout__Engine_Migration_Strategy.md`, `../WebGPU-Complete/P3-5__Runtime_Loop__The_Swap_Explained.md`

// [LAW:dataflow-not-control-flow] Install should publish canonical inputs and pipelines, not run a separate CPU execution path that precomputes GPU-owned frame products.

## Where We Are

- `src/services/runtime-hotpath-install.ts:32-66` runs materialize steps on the CPU and writes the results into `state.arena`.
- `src/services/runtime-hotpath-install.ts:68-93` resolves time, clears shape-bank frame state, seeds instance counts, and iterates schedule steps to materialize runtime values on the CPU.
- `src/services/runtime-hotpath-install.ts:102-128` builds install planes by cloning the packed draw-prep sink table and copying live shape-bank words into fresh `Uint32Array` buffers.
- `src/services/RuntimeService.ts:280-320` calls that install path after swap and immediately feeds the CPU-built planes into `renderer.render(...)`.
- `src/render/webgpu/RustWasmWebGPURenderer.ts:705-719` and `src/render/webgpu/RustWasmWebGPURenderer.ts:1013-1041` copy the CPU-built ShapeBank and sink-table words into shared planes for the worker.

## First Draft Proposal

- Reduce install-time work to publishing static assets, canonical arena/header initialization, and compiled GPU pipeline artifacts.
- Do not run CPU materialization to produce live shape payload and draw-prep records as part of renderer install.
- If a first frame needs derived runtime data, run the same GPU frame stages that later frames use, with initial arena/header values already in place.
- Shared-plane publication should carry canonical inputs, not CPU-authored substitutes for GPU work.
