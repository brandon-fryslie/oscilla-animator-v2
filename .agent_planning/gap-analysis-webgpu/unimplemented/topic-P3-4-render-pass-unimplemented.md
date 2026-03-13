# P3-4: WebGPU Render Pass - UNIMPLEMENTED Items

## Item 1: Procedural SDF Fragment Path
**Spec says**: Procedural shapes use proxy geometry + fragment-space distance evaluation. Use fwidth-based AA. Discard outside support window.
**Implementation**: No SDF/procedural fragment evaluation exists in the uber shader. Fragment shader simply outputs color with premultiplied alpha (`engine.rs:398-402`). No fwidth(), no discard, no distance evaluation. All shapes are rendered as solid-fill triangles.
**Gap**: Procedural shape rendering (circles, rounded rectangles, SDF shapes) is not implemented. All shapes render as polygonal meshes without per-fragment SDF evaluation.
**Classification**: UNIMPLEMENTED

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:396-402` (fragment shader)

## Item 2: No Legacy Fallback Renderer Check
**Spec says**: No legacy fallback renderer ownership in canonical runtime path.
**Implementation**: The implementation does satisfy this: there is no legacy fallback renderer. `createWebGPURenderer()` in `RustWasmWebGPURenderer.ts:1524-1528` explicitly states "[LAW:no-silent-fallbacks] WebGPU renderer creation is hard-fail only. No legacy renderer path is allowed." However, the Canvas2DRenderer and SVGRenderer still exist in the codebase at `src/render/Canvas2DRenderer.ts` and `src/render/SVGRenderer.ts`.
**Gap**: Legacy renderers exist in the codebase but are not wired into the canonical runtime path. They should be audited for removal to enforce the "no fallback" policy.
**Classification**: UNIMPLEMENTED (cleanup)

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/webgpu/RustWasmWebGPURenderer.ts:1524-1528`
