# Shapes 4: Procedural Volume (SDF) - UNIMPLEMENTED Items

## Item 1: SDF Fragment Shader Evaluation
**Spec says**: Fragment shader evaluates SDF equation per-pixel: distance field computation, fwidth()-based anti-aliasing, early discard, and premultiplied alpha output.
**Implementation**: `src/compiler/ir/types.ts:327` has a comment mentioning "SDF/Type 2 compatibility" for scaleSlot, indicating awareness. `src/blocks/shape/rect.ts` has a description "Generates rounded-rect geometry" with superellipse math (corner rounding), but this is computed as control-point geometry, not as an SDF equation in a fragment shader.
**Gap**: No SDF fragment shader exists. No per-pixel distance field evaluation. No fwidth() anti-aliasing. The current pipeline only supports vertex-defined geometry rendered via triangle rasterization.
**Classification**: UNIMPLEMENTED

## Item 2: Proxy Geometry (Bounding Quad/Cube)
**Spec says**: "Proxy geometry in ShapeBank bounds fragment workload." A rigid 2D quad proxy requires exactly 4 vertices and 6 indices. Every 2D procedural shape can point to the same ShapeID.
**Implementation**: No proxy quad geometry concept exists. All shapes generate full control-point geometry.
**Gap**: No shared proxy quad topology. No mechanism for shapes to share a single topology with different fragment shader equations.
**Classification**: UNIMPLEMENTED

## Item 3: Per-Instance SDF Parameters in Arena
**Spec says**: Arena provides per-instance equation params (Radius, CornerRounding, Thickness, etc.) read by fragment shader via instance_index.
**Implementation**: Per-instance parameters are available in the Arena for transform data (posX, posY, scale, rotation, color). No SDF-specific parameters (radius, corner rounding) are allocated in Arena channels.
**Gap**: No SDF parameter channels in Arena. The block's parameter values (e.g., rect cornerRadius) are computed in the expression table and materialized as control points, not as SDF uniforms.
**Classification**: UNIMPLEMENTED

## Item 4: Dynamic Bounding Box Scaling
**Spec says**: Hard Invariant 1: "Proxy Geometry must fully encapsulate the mathematical shape at all times." AC 1.1: "The bounds must not be hardcoded." Compiler must inject automatic bounding-box scaling.
**Implementation**: No bounding box scaling logic exists. Shape bounds are packed in ShapeBankHeaderWord.BoundsMinPacked/BoundsMaxPacked (words 12-13) but are always 0.
**Gap**: Bounds fields exist in the header but are never written. No automatic bounding box scaling from SDF parameters.
**Classification**: UNIMPLEMENTED

## Item 5: Uniform Scale Constraint for SDF
**Spec says**: Hard Invariant 3: "Non-uniform scaling must be applied inside the SDF equation, not via the outer Transform Matrix."
**Implementation**: StepRender has `scaleSlot` described as "Strictly isotropic uniform scalar for SDF/Type 2 compatibility" (`src/compiler/ir/types.ts:327`). This is a single scalar, not vec2, which enforces uniform scaling.
**Gap**: The scalar scale constraint exists and is SDF-compatible. However, since no SDF pipeline exists, this is anticipatory rather than tested.
**Classification**: UNIMPLEMENTED - The uniform scale constraint is architecturally present but untested without SDF shapes.

## Item 6: Custom frag_depth Output for 2.5D
**Spec says**: "The fragment shader must write its own depth based on the SDF evaluation to ensure proper intersection with Type 1/2/3 meshes."
**Implementation**: The current render pipeline has depth write enabled (`depth_write_enabled: true` in `render.rs:145`) but all depth values come from vertex positions, not fragment shader depth writes.
**Gap**: No fragment shader depth write (`frag_depth`) support. The current pipeline uses vertex-interpolated depth only.
**Classification**: UNIMPLEMENTED

## Item 7: Overdraw Prevention
**Spec says**: AC 2.2: "GPU must register exactly 0 fragment executions" for zero-radius SDF. "Vertex Shader must have collapsed the proxy quad."
**Implementation**: No overdraw prevention mechanism exists. No vertex shader proxy quad collapse.
**Gap**: No overdraw mitigation strategy.
**Classification**: UNIMPLEMENTED
