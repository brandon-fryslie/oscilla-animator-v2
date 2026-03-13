# Context: Shapes 2 - Parametric Curve Critical Items

## Target State
1. GPU vertex shader evaluates Bezier polynomial analytically from 4 control points stored in Arena
2. Naga shim generates specialized WGSL vertex shader with unrolled control point access (no dynamic indexing)
3. ShapeBank stores only t-value template (tiny footprint)
4. Control points stored in Arena SoA channels, not in shape bank param block

## Current State
1. CPU evaluates Bezier and ribbon extrusion in `src/runtime/ParametricCurveGeometry.ts`
2. Pre-computed vertices are packed into shape bank param block in `src/runtime/ValueExprMaterializer.ts:163-169`
3. Rust renderer reads pre-computed positions directly in `engine.rs:556-561`
4. No WGSL shader contains Bezier math
5. The compiler infrastructure partially supports parametric data flow:
   - `shapeRef` expression type includes `controlPointField` (`src/compiler/ir/value-expr.ts:260`)
   - Render materialization pipeline resolves `parameterBaseSlot` (`src/compiler/backend/render-materialization-pipeline.ts:568-574`)
   - But this plumbing is not consumed by the vertex shader

## Files Involved
- `src/runtime/ParametricCurveGeometry.ts` - CPU Bezier math (would be replaced by GPU equivalent)
- `src/runtime/ValueExprMaterializer.ts:140-196` - Shape bank materialization (would change to Arena SoA writes)
- `src/render/webgpu/shaders.ts` - Vertex shader (would need Bezier evaluation)
- `src/compiler/wasm/rust/oscilla-naga-shim/` - Naga shim (would generate parametric vertex shader)
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` - Geometry realization (would read from Arena instead)
- `src/compiler/backend/render-materialization-pipeline.ts` - Already has parameterBaseSlot resolution

## Suggested Approach
1. Keep CPU path as reference implementation and fallback
2. Implement WGSL Bezier evaluation in vertex shader (can be hand-written first, Naga-generated later)
3. Add Arena SoA channel allocation for control points (8 channels for cubic: P0_X, P0_Y, P1_X, P1_Y, P2_X, P2_Y, P3_X, P3_Y)
4. Connect parameterBaseSlot plumbing to vertex shader bind group
5. Add t-value template to ShapeBank (uses existing param block mechanism)
6. Validate with headless render tests (AC 2.1, 2.2)

## Risks
- Transitioning from CPU to GPU evaluation affects all Type 2 shape demos
- Need to handle the vec2 interleaved -> SoA scalar layout change
- Naga shim integration for vertex shader is new territory (currently only compute)
- Must maintain CPU fallback for testing and non-WebGPU environments
