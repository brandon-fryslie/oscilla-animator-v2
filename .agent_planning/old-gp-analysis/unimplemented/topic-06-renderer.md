---
topic: 06
name: Renderer
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: unimplemented
audited: 2026-01-23T12:00:00Z
item_count: 5
blocks_critical: [C-9]
---

# Topic 06: Renderer — Unimplemented

## Items

### U-21: Layer system
**Spec requirement**: Multi-layer rendering with explicit ordering
**Scope**: new layer concept in render IR
**Blocks**: C-9 (needs DrawPathInstancesOp first)
**Evidence of absence**: No "layer" concept in RenderPassIR or RenderFrameIR

### U-22: Culling
**Spec requirement**: Frustum/viewport culling to skip off-screen instances
**Scope**: new culling stage before render
**Blocks**: nothing — standalone optimization
**Evidence of absence**: No culling logic in render pipeline

### U-23: RenderDiagnostics
**Spec requirement**: Render performance metrics and error reporting
**Scope**: new diagnostic collector in render path
**Blocks**: nothing — standalone
**Evidence of absence**: No render-specific diagnostics

### U-24: RenderError + fallback
**Spec requirement**: Structured render errors with fallback rendering (e.g., pink error shapes)
**Scope**: new error type + fallback renderer
**Blocks**: nothing — standalone
**Evidence of absence**: No "RenderError" type in src/render/

### U-25: RenderBackend interface
**Spec requirement**: Abstract interface that Canvas2D and SVG implement, enabling new backends
**Scope**: Extract interface from existing renderers
**Blocks**: nothing — standalone refactor
**Evidence of absence**: Canvas2DRenderer and SVGRenderer exist but don't implement a shared interface

### U-28: FillSpec/StrokeSpec discriminated unions
**Spec requirement**: FillSpec = `{ kind: 'none' } | { kind: 'solid'; color } | { kind: 'gradient'; stops }`. StrokeSpec similar.
**Scope**: refactor PathStyle internals
**Blocks**: C-12 (PathStyle restructure)
**Evidence of absence**: PathStyle uses optional Uint8ClampedArray buffers for fill/stroke color rather than discriminated unions

### U-29: Temporal stability mechanism (I18)
**Spec requirement**: Old program renders until new is ready. Atomic swap. No blank frames during compile/swap.
**Scope**: double-buffered frame output or similar
**Blocks**: nothing — standalone
**Evidence of absence**: No explicit atomic swap mechanism preventing blank frames
