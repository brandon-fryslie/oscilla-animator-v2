# Shapes 0: Shape Taxonomy Overview - TRIVIAL Items

## Item 1: Taxonomy Class Enumeration
**Spec says**: Five taxonomy classes: Rigid (1), Parametric (2), Ribbon (3), Procedural/SDF (4), Text Hybrid (5).
**Implementation**: Shape blocks in `src/blocks/shape/` implement Type 1 (Ellipse, Rect, ProceduralPolygon, ProceduralStar) and Type 2 (ParametricCurve2D). No explicit taxonomy enum exists.
**Gap**: No code maps block types to taxonomy class numbers. Classification is implicit in topology/draw-mode choices.
**Classification**: TRIVIAL - The taxonomy classification is enacted through structural choices (path topology, drawMode, etc.) rather than an explicit enum. No functional impact.

## Item 2: Shared Camera/Depth Contract Naming
**Spec says**: "one frame `view_projection_matrix`" as part of shared camera/depth contract.
**Implementation**: `src/render/webgpu/shaders.ts:128` has `build_view_projection_matrix()`. Rust renderer in `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:1222` builds `view_proj` as a 4x4 matrix. `src/render/types.ts:13` defines `MatrixViewportContract`.
**Gap**: Naming is `view_proj` / `viewProjection` / `MatrixViewportContract` vs spec's `view_projection_matrix`. Functionally identical.
**Classification**: TRIVIAL - Naming convention difference only.

## Item 3: Implementation Notes Documentation
**Spec says**: "New shape types should extend existing class behavior where possible" and "define header metadata additions, draw-prep ABI mapping, render/depth/blend policy, machine-verifiable acceptance criteria."
**Implementation**: No formal extension protocol is documented in code, but the architecture naturally supports it through `registerDynamicTopology()` in `src/shapes/registry.ts:236`.
**Gap**: No formal "how to add a new taxonomy class" guide in code. Spec note is advisory, not an enforcement requirement.
**Classification**: TRIVIAL - Advisory guidance, not a code requirement.
