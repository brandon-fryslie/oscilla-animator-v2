# Context: Shapes 1 - Rigid Stamp Critical Items

## Target State
1. Rigid topology payload should be immutable during the frame loop. Geometry is uploaded once at compile time or on graph change, not re-computed every frame.
2. Material class metadata should be populated and used for draw-prep bucketing when different materials are required.

## Current State
1. Shape bank geometry is written every frame in `src/runtime/ValueExprMaterializer.ts:172-196` during `materializeShapeRef()`. Control points are materialized from the expression table each frame, packed into `Uint32Array`, and written to the shape bank. The Rust renderer in `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:500-598` then re-realizes all geometry from these control points.
2. `MaterialClass` at `src/runtime/RuntimeState.ts:30` (word 3) is always 0. No writes to non-zero values anywhere in the codebase.

## Files Involved
- `src/runtime/ValueExprMaterializer.ts` - Shape bank write path
- `src/runtime/RuntimeState.ts` - Header layout, ShapeBankHeaderWord enum
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` - Shape bank geometry realization
- `src/runtime/DrawPrepSinkTablePacker.ts` - Sink table packing (reads materialClass)
- `src/blocks/shape/*.ts` - All shape block lowering (all produce shapeRef expressions)

## Suggested Approach
1. **Immutability**: Separate "static" shapes (geometry doesn't change between recompiles) from "dynamic" shapes (control points driven by runtime signals). Static shapes should have geometry pre-computed and uploaded once. Dynamic shapes (parametric curves, deformed shapes) legitimately need per-frame updates. The spec's "immutable" invariant may need refinement for the path-based architecture.
2. **Material Class**: Implement a material enum or material registry. Each shape block could declare a material class. The compiler assigns material IDs and the draw-prep packer uses them for bucketing. Start with 2-3 material classes: solid-fill, textured, SDF.

## Risks
1. Changing shape bank writes to be compile-time-only would break the current deformation pipeline (shapes like ShapeWobble2D, ShapeTwist2D modify control points at runtime). These need to remain dynamic. The key optimization is avoiding redundant re-upload when control points haven't changed.
2. Material bucketing requires changes to the draw-prep pipeline, sink table format, and Rust renderer dispatch. This is a cross-cutting change.
