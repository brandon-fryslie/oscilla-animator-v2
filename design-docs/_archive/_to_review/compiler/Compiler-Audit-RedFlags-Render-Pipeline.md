# Compiler Audit Red Flags: Render Pipeline

Scope: RenderIR assembly, render pass execution, and Canvas2D rendering in the IR runtime path (Instances2D + Paths2D).

## Critical

- Instances2D execution treats several optional attributes as required (size, colorRGBA, opacity, shapeId). `renderInstances2DPass` calls `requireAttribute()` for these, which throws when the compiler omits them, while `InstanceBufferSetIR` marks them optional. This can hard-fail rendering even when defaults should apply. Ref: `src/editor/runtime/renderPassExecutors.ts`.
- Render pass ordering ignores `header.z`. `executeRenderAssemble` appends passes in discovery order without sorting, and `Canvas2DRenderer.renderFrame()` renders in that order. Any z-order semantics defined in RenderIR are currently inert. Refs: `src/editor/runtime/executor/steps/executeRenderAssemble.ts`, `src/editor/runtime/canvasRenderer.ts`.
- Clear spec is hardcoded to `clear: { mode: "none" }` when assembling frames. If the runtime expects background clearing from the patch or UI settings, this will silently preserve previous frame contents. Ref: `src/editor/runtime/executor/steps/executeRenderAssemble.ts`.

## High

- Path clipping is declared but not implemented. `applyPassHeader()` warns and skips path-based clipping, so any `ClipSpecIR` path clip emitted by the compiler will be ignored. Ref: `src/editor/runtime/renderPassExecutors.ts`.
- Instances2D material support is limited to `shape2d` with `flat` shading. If the compiler emits `sprite` or `glyph` materials, the renderer logs a warning and draws nothing. This is a silent correctness failure for any non-shape2d passes. Ref: `src/editor/runtime/renderPassExecutors.ts`.

## Medium

- `buildInstancesPass` does not plumb several supported attributes (rot, shapeId, strokeWidth, strokeColorRGBA), and always forces `shapeId` to scalar 0. This makes the IR capabilities appear richer than the runtime actually uses. Ref: `src/editor/runtime/executor/steps/executeRenderAssemble.ts`.
- Paths2D render ignores `pathPointLen` for validation. The decoder advances by command stream alone, so malformed or mismatched buffers can read past the intended path segment without an explicit guard. Refs: `src/editor/runtime/executor/steps/executeRenderAssemble.ts`, `src/editor/runtime/renderPassExecutors.ts`.
- Overlays are supported by `RenderFrameIR` and `Canvas2DRenderer.renderFrame()`, but `executeRenderAssemble` never produces overlay passes, so any overlay system wired at compile time has no execution path. Ref: `src/editor/runtime/executor/steps/executeRenderAssemble.ts`.

## Notes

- The codebase still includes the older `RenderCmd` / `RenderTree` pipeline alongside the IR path. That is fine for now, but any UI integration that still calls `Canvas2DRenderer.render()` instead of `renderFrame()` will bypass the IR pipeline entirely. Ref: `src/editor/runtime/canvasRenderer.ts`.
