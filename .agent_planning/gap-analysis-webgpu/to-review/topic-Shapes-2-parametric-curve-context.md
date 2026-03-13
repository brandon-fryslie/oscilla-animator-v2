# Context: Shapes 2 - Parametric Curve

## Target State
Per spec, Type 2 shapes should:
1. Store a t-value template in ShapeBank (tiny, resolution-dependent)
2. Store per-instance control points in Arena SoA channels
3. Evaluate cubic Bezier position + tangent analytically in the vertex shader
4. Extrude ribbon cross-section using tangent normal in vertex shader
5. Never write computed vertices back to VRAM

## Current State
The implementation uses a hybrid CPU/GPU approach:
1. `ParametricCurve2D` block (`src/blocks/shape/parametric-curve-2d.ts`) registers a cubic path topology and creates a shapeRef with resolution/thickness params and control point field
2. `ParametricCurveGeometry.ts` provides CPU-side Bezier evaluation and ribbon extrusion
3. `ValueExprMaterializer.ts:140-196` materializes shapeRef expressions by evaluating control points from the expression table and packing them into the shape bank param block as u32-bitcast vec2 pairs
4. The Rust renderer reads pre-computed vertex positions from the shape bank, not raw control points
5. Vertex shader receives pre-triangulated geometry, not analytical t-values

## Files Involved
- `src/blocks/shape/parametric-curve-2d.ts` - Block definition
- `src/shapes/parametric-contract.ts` - Contract constants (resolution, thickness, control point count)
- `src/blocks/shape/_topology-helpers.ts:70-81` - Cubic path topology creation
- `src/runtime/ParametricCurveGeometry.ts` - CPU-side Bezier math
- `src/runtime/ValueExprMaterializer.ts:140-196` - Shape bank materialization
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:500-598` - Geometry realization
- `src/compiler/backend/render-materialization-pipeline.ts:161-187` - Parametric base field resolution

## Suggested Approach
The current CPU approach is pragmatic and correct. To move toward the spec's GPU-native model:
1. Phase 1: Keep CPU evaluation for correctness baseline
2. Phase 2: Implement GPU vertex shader path where control points are in Arena SoA and t-values are ShapeBank template
3. Phase 3: Use GPU path for high-instance-count scenarios, CPU path as fallback

The `render-materialization-pipeline.ts:175-177` already accommodates parametric base fields, suggesting the architecture is preparing for GPU-side control point reads.

## Risks
- Moving to GPU evaluation requires WGSL shader generation for Bezier math (Naga integration)
- Control point layout must change from shape bank param block to Arena SoA channels
- Cross-cutting change across materializer, compiler, and renderer
