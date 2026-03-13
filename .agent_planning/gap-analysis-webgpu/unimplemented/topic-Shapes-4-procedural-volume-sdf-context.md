# Context: Shapes 4 - Procedural Volume (SDF)

## Target State
Type 4 (Procedural Volume / SDF) shapes require:
1. Fragment-driven rendering where geometry is evaluated per-pixel via SDF math
2. Proxy quad geometry in ShapeBank (4 vertices, 6 indices, shared across all SDF shapes)
3. Per-instance SDF parameters (radius, corner rounding, etc.) in Arena channels
4. Fragment shader with distance field evaluation, fwidth() AA, early discard, premultiplied alpha
5. Dynamic bounding box scaling in vertex shader
6. Custom frag_depth output for 2.5D depth compositing
7. Overdraw prevention (collapse proxy quad for zero-size shapes)

## Current State
No SDF rendering exists. The codebase has zero SDF fragment shader code, zero proxy geometry support, and zero per-pixel distance evaluation.

Relevant existing infrastructure:
- `src/compiler/ir/types.ts:327` scaleSlot comment mentions "SDF/Type 2 compatibility" - indicates design awareness
- `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs:134` already uses `PREMULTIPLIED_ALPHA_BLENDING`
- `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs:143-149` has depth stencil state
- Rect block in `src/blocks/shape/rect.ts` has superellipse corner rounding math (could be replaced by SDF equivalent)
- Header bounds fields at words 12-13 exist but are unused

## Files Involved (would need to be created/modified)
- NEW: `src/blocks/shape/sdf-circle.ts`, `sdf-rounded-rect.ts`, etc. - SDF shape blocks
- NEW: SDF fragment shader WGSL (could be in `src/render/webgpu/shaders.ts` or generated via Naga)
- MODIFY: `src/shapes/registry.ts` - Proxy quad topology registration
- MODIFY: `src/runtime/ValueExprMaterializer.ts` - SDF parameter materialization
- MODIFY: `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs` - Separate render pipeline for SDF
- MODIFY: `src/runtime/DrawPrepSinkTablePacker.ts` - SDF-specific draw-prep

## Suggested Approach
1. Register a shared proxy quad topology (4 verts, 6 indices)
2. Create SDF block definitions that declare parameter channels
3. Generate SDF fragment shader (static or via Naga AST)
4. Create a second render pipeline with SDF fragment stage
5. Route SDF draw calls through the new pipeline (material class bucketing)
6. Implement bounding box scaling and overdraw prevention

## Risks
- Requires a second render pipeline (or uber-shader branching, which the spec discourages)
- frag_depth output requires pipeline configuration changes
- Material bucketing (missing, per Critical item in Shapes 1) blocks SDF pipeline separation
- SDF math correctness for complex shapes requires careful testing
