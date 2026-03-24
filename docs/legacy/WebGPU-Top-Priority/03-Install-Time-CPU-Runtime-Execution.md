# 03 - Install-Time CPU Runtime Execution

Spec target: `../WebGPU-Complete/P5-3__Phased_Rollout__Engine_Migration_Strategy.md`, `../WebGPU-Complete/P3-5__Runtime_Loop__The_Swap_Explained.md`

// [LAW:dataflow-not-control-flow] Install should publish canonical inputs and pipelines, not run a separate CPU execution path that precomputes GPU-owned frame products.

## Where We Are

- `src/compiler/backend/compiled-runtime-install-contract.ts` derives static ShapeBank topology headers and packed draw-prep sink metadata directly from compile-time IR.
- `src/services/compile.worker.ts` threads that compile-owned install contract through the worker payload after pass validation.
- `src/services/RuntimeService.ts:280-320` publishes the worker-owned install payload directly into `renderer.render(...)` during swap.
- `src/render/webgpu/RustWasmWebGPURenderer.ts:705-719` and `src/render/webgpu/RustWasmWebGPURenderer.ts:1013-1041` copy the compile-owned ShapeBank and sink-table words into shared planes for the worker.

## First Draft Proposal

- Reduce install-time work to publishing static assets, canonical arena/header initialization, and compiled GPU pipeline artifacts.
- Do not run CPU materialization to produce live shape payload and draw-prep records as part of renderer install.
- If a first frame needs derived runtime data, run the same GPU frame stages that later frames use, with initial arena/header values already in place.
- Shared-plane publication should carry canonical inputs, not CPU-authored substitutes for GPU work.
