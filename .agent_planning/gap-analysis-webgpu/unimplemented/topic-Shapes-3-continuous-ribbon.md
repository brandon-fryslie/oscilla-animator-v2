# Shapes 3: Continuous Ribbon - UNIMPLEMENTED Items

## Item 1: Ring Buffer History Architecture
**Spec says**: Arena stores ring-buffer history channels: Arena_PosX [f32] (N x H), Arena_PosY [f32] (N x H), Arena_HeadIndex [u32] (N), Arena_ActiveCount [u32] (N). Compute shader increments head index and writes new position each frame.
**Implementation**: No ring buffer implementation exists in `src/runtime/` or `src/render/`. No Trail block or Ribbon block is registered in `src/blocks/shape/index.ts`. No history channel allocation in the Arena.
**Gap**: Entire ring buffer history system is missing. No SoA ring buffer layout, no head index tracking, no active count management.
**Classification**: UNIMPLEMENTED

## Item 2: Virtual Topology / Non-Indexed Draw Mode for Ribbons
**Spec says**: ShapeBank provides virtual-topology metadata only with `topologyMode = NonIndexed/Virtual`. Draw-prep emits non-indexed commands from active history count. DrawPrep kernel calculates vertex count = ActiveCount * 2.
**Implementation**: The DrawPrepSinkIR in `src/compiler/ir/program.ts:382` supports `drawMode: 'nonIndexed'` and the Rust renderer at `render.rs:215-219` calls `draw_indirect` for non-indexed records. However, no ribbon-specific draw-prep logic exists. No dynamic vertex count calculation based on active history.
**Gap**: Non-indexed draw infrastructure exists but no ribbon-specific draw-prep kernel. No dynamic vertex count from active history count.
**Classification**: UNIMPLEMENTED

## Item 3: Vertex Shader Ring Buffer Fetch
**Spec says**: Vertex shader maps VertexID to historical segment via modular arithmetic: SegmentAge = floor(VertexID/2), Side = VertexID % 2, ReadIndex = (HeadIndex - SegmentAge + H) % H. Then fetches position, computes tangent/normal, and extrudes ribbon width.
**Implementation**: No WGSL shader code for ring buffer fetch exists. The current vertex shader (`src/render/webgpu/shaders.ts:144-178`) reads pre-computed vertex positions from an instance data buffer, not from a ring buffer.
**Gap**: Entire vertex shader ring buffer fetch and ribbon extrusion is missing.
**Classification**: UNIMPLEMENTED

## Item 4: Continuity Break Detection
**Spec says**: Hard Invariant 1 (Continuity Mandate): "Any block that forces a position jump must write a special Break flag (NaN or dedicated u32 mask) into the ring buffer. Vertex Shader must detect this break and output degenerate vertices."
**Implementation**: No break flag mechanism exists. No degenerate vertex generation.
**Gap**: Complete continuity break system is missing.
**Classification**: UNIMPLEMENTED

## Item 5: NaN Tangent Guardrail (Zero Velocity)
**Spec says**: AC 2.2: "Output clip_position must not contain NaN. Shader must safely fallback to default width or degenerate triangle" when all positions are identical.
**Implementation**: The `ParametricCurveGeometry.ts:81-93` has NaN guardrails for parametric curves (Type 2) but no equivalent for ribbons.
**Gap**: No ribbon-specific NaN guardrail. Would need to be in WGSL vertex shader.
**Classification**: UNIMPLEMENTED

## Item 6: Maximum History Length Compile-Time Cap
**Spec says**: "Maximum History Length (H): The absolute cap on the number of segments. This dictates memory allocation and cannot be dynamically exceeded."
**Implementation**: No history length parameter exists anywhere.
**Gap**: No compile-time history length configuration.
**Classification**: UNIMPLEMENTED
