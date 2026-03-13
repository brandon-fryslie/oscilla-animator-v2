# Shapes 2: Parametric Curve - TO-REVIEW Items

## Item 1: GPU vs CPU Vertex Evaluation
**Spec says**: "the GPU evaluates continuous mathematical functions on the fly" - vertex shader fetches control points from Arena and applies cubic Bezier polynomial. "The final 3D coordinates are never written back to VRAM."
**Implementation**: `src/runtime/ParametricCurveGeometry.ts` evaluates cubic Bezier on the CPU. `buildCubicRibbonContour()` computes positions and extrudes a ribbon contour on the CPU. Results are written to shape bank as control-point words in `src/runtime/ValueExprMaterializer.ts:163-169`. The Rust renderer in `engine.rs:556-561` reads these pre-computed control points from the shape bank and uses them as vertex positions directly.
**Gap**: The spec envisions GPU-side analytical evaluation in the vertex shader (reading control points from Arena, computing positions via Bezier math). The implementation does CPU-side evaluation and uploads pre-computed vertex positions. This is functionally equivalent but misses the GPU compute benefit for large instance counts.
**Classification**: TO-REVIEW - CPU evaluation works correctly and produces correct geometry. GPU evaluation would be more efficient for many instances but is a performance optimization, not a correctness issue. The current approach may actually be simpler and more debuggable. The key question is whether the control-point SoA layout matches the spec's Arena layout expectation.

## Item 2: SoA Channel Allocation for Control Points
**Spec says**: AC 1.1: "GpuLayout must register exactly 8 sequential scalar offsets" for cubic Bezier (P0_X, P0_Y, P1_X, P1_Y, P2_X, P2_Y, P3_X, P3_Y).
**Implementation**: Control points are stored as a Field<vec2> with 4 lanes (PARAMETRIC_CUBIC_CONTROL_POINT_COUNT=4 in `src/shapes/parametric-contract.ts:7`). The control points flow as a single vec2 field, not 8 separate scalar channels. At shape bank packing time (`ValueExprMaterializer.ts:163-169`), they are interleaved as [x0,y0,x1,y1,...].
**Gap**: Layout is interleaved vec2 (AoS-like within the param block) rather than 8 separate SoA scalar channels. This is packed into the shape bank param block as u32-bitcast floats. The spec's SoA layout is for GPU Arena compute; the current implementation stores them in the shape bank's param block instead.
**Classification**: TO-REVIEW - Different storage strategy (shape bank param block vs Arena SoA channels). Both are valid but serve different execution models (CPU pre-compute vs GPU compute).

## Item 3: Template t-Value Generation
**Spec says**: AC 1.2: "ShapeBank payload must contain exactly 5 f32 values (bit-cast to u32): [0.0, 0.25, 0.5, 0.75, 1.0]" for Resolution=4.
**Implementation**: `src/runtime/ParametricCurveGeometry.ts:29-37` `generateParametricTemplateTValues()` generates correct t-values: for resolution=4, produces `[0.0, 0.25, 0.5, 0.75, 1.0]` (5 samples). However, these t-values are used on the CPU side for `buildCubicRibbonContour()`, not stored in the ShapeBank.
**Gap**: t-values are generated correctly but consumed CPU-side rather than stored in ShapeBank for GPU vertex shader consumption. Since the spec envisions GPU-side evaluation, the t-values would be the ShapeBank template. In the current CPU model, they are transient computation.
**Classification**: TO-REVIEW - Correct t-value generation. Storage location differs from spec (transient CPU vs GPU ShapeBank template).

## Item 4: Collinear Tangent / NaN Guardrail
**Spec says**: AC 2.2: "Inject collapsed control points (all equal). Output must not emit NaN." Also pitfall: "Always add a microscopic epsilon to the tangent before normalization."
**Implementation**: `src/runtime/ParametricCurveGeometry.ts:81-93` `normalizeWithFallback()` handles zero-length tangents by falling back to a previous tangent direction, then to (1,0). This is actually better than the spec's epsilon approach because it maintains direction continuity.
**Gap**: NaN guardrail is implemented and is superior to the spec's epsilon recommendation. Fully compliant.
**Classification**: TO-REVIEW - Implemented with a better strategy than spec suggests (fallback tangent chain vs epsilon).

## Item 5: Register Ceiling for Control Points
**Spec says**: Hard Invariant 2: "maximum number of control points C evaluated in a single WGSL shader must be strictly capped (e.g., C <= 16)."
**Implementation**: `src/shapes/parametric-contract.ts:7` sets `PARAMETRIC_CUBIC_CONTROL_POINT_COUNT = 4`. The ParametricCurve2D block enforces exactly 4 control points at `src/blocks/shape/parametric-curve-2d.ts:91-95`.
**Gap**: Currently hardcoded to 4 (cubic Bezier). The cap of 16 from the spec is not explicitly enforced as a maximum because only cubic is supported. If higher-degree curves are added, a cap enforcement would be needed.
**Classification**: TO-REVIEW - Implicitly compliant (only cubic/4 points supported). Explicit cap not enforced for future curve types.
