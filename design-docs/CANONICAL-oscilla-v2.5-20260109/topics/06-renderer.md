---
parent: ../INDEX.md
topic: renderer
order: 6
---

# Renderer

> The renderer is a pure sink. All geometry and command logic is GPU-driven.

**Related Topics**: [05-runtime](./05-runtime.md), [02-block-system](./02-block-system.md), [16-coordinate-spaces](./16-coordinate-spaces.md)
**Key Terms**: [Indirect Buffer](../GLOSSARY.md#indirect-buffer), [Vertex Pulling](../GLOSSARY.md#vertex-pulling), [Shape Bank](../GLOSSARY.md#shape-bank)
**Relevant Invariants**: [I15](../INVARIANTS.md#i15-renderer-is-a-sink-not-an-engine), [I16](../INVARIANTS.md#i16-real-render-ir), [I17](../INVARIANTS.md#i17-planned-batching), [I18](../INVARIANTS.md#i18-temporal-stability-in-rendering)

---

## Overview

The renderer is the **rasterization stage** of Oscilla. It consumes indirect command streams produced by the `DrawPrep` pass. Key principles:

- **Sink, not engine** (Invariant I15)
- **Indirect Execution**: The GPU determines draw counts and topology.
- **Vertex Pulling**: Geometry is fetched from the `ShapeBank` via `VertexID`.
- **Alpha Compositing**: Strict premultiplied alpha mandate.

---

## Render Contract (Invariant I15)

### What the Renderer Does

- Executes indirect draw loops (indexed and non-indexed).
- Rasterizes simulation state using programmable vertex pulling.
- Applies global camera uniforms (View-Projection matrix).
- Performs hardware depth testing and blending.

### What the Renderer Does NOT Do

- **No CPU draw calls**: No `draw(N)` from the main thread.
- **No dynamic topology creation**: Resolved in `ShapeBank`.
- **No creative logic**: All motion and layout are simulation outputs in the Arena.

---

## Render Data Model: GPU-Driven Commands

The renderer does not consume a CPU-assembled `RenderFrameIR`. Instead, it reads from two hardware-native streams in the **Indirect Buffer**.

### Indexed Stream (`drawIndexedIndirect`)

Used for **Rigid** and **Parametric** shapes with explicit index payloads.
- **ABI**: 20-byte `DrawIndexedIndirectArgs` records.
- **Region**: Region A of the monolithic indirect buffer.

### Non-Indexed Stream (`drawIndirect`)

Used for **Virtual** and **Ribbon** shapes (generated on-the-fly).
- **ABI**: 16-byte `DrawIndirectArgs` records.
- **Region**: Region B of the monolithic indirect buffer.

---

## Vertex Stage: Programmable Fetching

Traditional vertex attributes are replaced by **Vertex Pulling** from GPU storage buffers.

### Inputs

The vertex shader consumes hardware built-ins:
- `@builtin(vertex_index)`: Used to look up topology in the `ShapeBank`.
- `@builtin(instance_index)`: Used to look up simulation state in the `Arena`.

### Execution Flow

1. **Header Fetch**: Resolves the `ShapeHeaderV1` (16 words) from the `ShapeBank`.
2. **Topology Resolve**: Fetches local-space coordinates (indexed payload or virtual equation).
3. **Instance Fetch**: Reads world position, rotation, and scale from the `Arena` (SoA).
4. **Transform**: Applies the matrix chain ($VP \cdot M$) defined in [Topic 16](./16-coordinate-spaces.md).

---

## Fragment Stage: Procedural & Composition

### Alpha Compositing (Premultiplied Alpha)

Oscilla mandates **premultiplied alpha** for all compositing to avoid dark halos at edges.

**Blend State**:
- `color: { src: one, dst: one-minus-src-alpha, op: add }`
- `alpha: { src: one, dst: one-minus-src-alpha, op: add }`

**Output**: Fragments must return `vec4(rgb * alpha, alpha)`.

### Procedural (SDF) Path

For Type 4 shapes, the fragment shader executes analytical distance equations:
- **Anti-Aliasing**: Uses `fwidth()` hardware derivatives for sub-pixel edge softening.
- **Early Discard**: Aborts execution if the distance is beyond the AA window.

---

## Hardware Integration

### The Indirect Loop

The renderer executes the frame by walking the indirect buffer regions:

```ts
const pass = encoder.beginRenderPass(descriptor);
pass.setPipeline(renderPipeline);
pass.setBindGroup(0, frameBindGroup); // Arena + ShapeBank + Uniforms

// 1. Indexed Region (20-byte stride)
pass.setIndexBuffer(shapeBankIndexPayload, 'uint32');
for (let i = 0; i < indexedRecordCount; i++) {
  pass.drawIndexedIndirect(indirectBuffer, indexedRegionBase + i * 20);
}

// 2. Non-Indexed Region (16-byte stride)
for (let j = 0; j < nonIndexedRecordCount; j++) {
  pass.drawIndirect(indirectBuffer, nonIndexedRegionBase + j * 16);
}
pass.end();
```

### Depth and Multi-Pass

- **Opaque Pass**: Depth test and write enabled.
- **Transparent Pass**: Depth test enabled, depth write disabled (painter's algorithm).
- **MSAA**: 4x Multi-Sample Anti-Aliasing is standard for the physical output.

---

## See Also

- [05-runtime](./05-runtime.md) - How `DrawPrep` populates the command buffer
- [16-coordinate-spaces](./16-coordinate-spaces.md) - The 5-space matrix pipeline
- [18-camera-projection](./18-camera-projection.md) - Matrix generation kernel
- [Invariant: I15](../INVARIANTS.md#i15-renderer-is-a-sink-not-an-engine)
