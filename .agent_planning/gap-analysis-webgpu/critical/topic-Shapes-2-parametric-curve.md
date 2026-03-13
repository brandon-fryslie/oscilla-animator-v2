# Shapes 2: Parametric Curve - CRITICAL Items

## Item 1: No GPU-Side Vertex Shader Bezier Evaluation
**Spec says**: "The Vertex Shader fetches the 4 control points from the Arena and applies the Cubic Bezier polynomial." "The final 3D coordinates are never written back to VRAM." AC 2.1: "Execute a headless WebGPU pipeline. Query the Vertex Shader output at t=0.5."
**Implementation**: Bezier evaluation happens entirely on the CPU in `src/runtime/ParametricCurveGeometry.ts:39-57` and `buildCubicRibbonContour()`. Results are written to shape bank param block as pre-computed vertex positions. The vertex shader simply reads these positions as local vertex coordinates. No Bezier math exists in any WGSL shader.
**Gap**: The entire GPU-side parametric evaluation pipeline is missing. The vertex shader does not evaluate Bezier curves - it receives pre-computed vertices. This means:
- No GPU-side analytical tangent computation
- No GPU-side 2.5D extrusion
- Control points are re-uploaded every frame (wasteful for many instances)
- AC 2.1 (vertex shader Bezier output) cannot pass
**Classification**: CRITICAL - The spec's core architectural benefit of Type 2 shapes (GPU evaluates math, CPU only sends control points) is not realized. The current CPU evaluation works but defeats the purpose of GPU-driven parametric rendering. For small instance counts this is acceptable; for the 10,000+ instance target it becomes a bottleneck.

## Item 2: No Naga Shader Generation for Parametric Curves
**Spec says**: AC 3.1: "Vertex Shader must not contain dynamic array indexing for control points. The Naga AST must explicitly construct variables via direct offset reads."
**Implementation**: No Naga-generated parametric vertex shader exists. The Naga shim (`src/compiler/wasm/rust/oscilla-naga-shim/`) generates compute shaders for the simulation pipeline but does not generate specialized vertex shaders for Type 2 shapes.
**Gap**: No vertex shader generation via Naga for parametric curves. The spec requires compile-time shader specialization that unrolls control point access. This is entirely missing.
**Classification**: CRITICAL - Blocks the GPU-native parametric rendering path. Without Naga-generated vertex shaders, Type 2 shapes cannot achieve their spec'd performance characteristics.
