# Shapes 1: Rigid Stamp - TO-REVIEW Items

## Item 1: ShapeHeaderV1 Schema (16 words / 64 bytes)
**Spec says**: Rigid shapes use canonical `ShapeHeaderV1` (16 words / 64 bytes) with fields: kind=rigid, topologyMode=indexed, indexCount, firstIndex, baseVertex, optional paramBlockOffset/paramBlockWords, packed bounds.
**Implementation**: `src/runtime/RuntimeState.ts:23-61` defines `SHAPE_BANK_HEADER_WORDS = 16` and `ShapeBankHeaderWord` enum with Kind(0), TopologyMode(1), Flags(2), MaterialClass(3), IndexCount(4), FirstIndex(5), BaseVertex(6), VertexCount(7), FirstVertex(8), ParamBlockOffset(9), ParamBlockWords(10), Reserved0(11), BoundsMinPacked(12), BoundsMaxPacked(13), Reserved1(14), Reserved2(15). Rust mirror at `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:5`.
**Gap**: Header schema matches spec exactly. All named fields present. Bounds are packed at words 12-13. Two reserved words at 14-15 for future use. Note: `kind=1` is used for all shapes currently (line 181 of ValueExprMaterializer.ts writes `kind: 1`), not distinguishing rigid vs parametric vs other types.
**Classification**: TO-REVIEW - Schema matches spec structurally. The `kind` field is always `1` rather than distinguishing taxonomy classes. This may be intentional (all shapes are control-point-based) or may need extension.

## Item 2: Compile-Time Triangulated Geometry
**Spec says**: Compile-time inputs include "triangulated local geometry (positions + optional normals/UVs)."
**Implementation**: Current shapes generate control-point paths at compile time via block lowering. The Rust renderer's `realize_shape_bank_geometry()` in `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:500-598` triangulates closed shapes using fan triangulation at shape bank realization time. Geometry is positions-only (vec2), no normals or UVs.
**Gap**: No UVs or normals are generated. Fan triangulation is used (simple but may produce degenerate triangles for non-convex shapes). This is adequate for current 2D shapes but won't scale to imported 3D meshes.
**Classification**: TO-REVIEW - Works for current simple 2D primitives. May need proper triangulation (ear-clipping) and UV/normal support for future mesh imports.

## Item 3: Draw-Prep Bucket Splitting
**Spec says**: "Draw-prep must split incompatible rigid records (topology/material differences)." and AC 1.3: "draw-prep emits separate indexed records per compatible bucket."
**Implementation**: `src/runtime/DrawPrepSinkTablePacker.ts:141-149` enforces that all instances in a single sink have the same shape handle (heterogeneous handles throw). `src/runtime/DrawPrepSinkTablePacker.ts:195-207` orders sinks by draw mode (indexed first, then non-indexed). The compiler creates one sink per render step/instance group.
**Gap**: Bucket splitting happens at compile time (one sink per render block). Runtime validates handle homogeneity but doesn't dynamically split. This is correct for the current architecture where each render block maps to one sink. True dynamic bucketing by topology/material is not needed because the compiler already separates them.
**Classification**: TO-REVIEW - Compiler-side splitting is arguably better than runtime bucketing. Matches spec intent even if mechanism differs.
