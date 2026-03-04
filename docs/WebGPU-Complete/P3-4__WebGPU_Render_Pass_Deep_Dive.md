> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Runtime Loop: The Render Pass (The "Sink")**.

This document defines the final stage of the pipeline where simulation state is rasterized to pixels. It covers programmable vertex pulling, shared camera/depth contracts, and strict indirect command execution.

# The Runtime Loop: The Render Pass (The "Sink")

**Objective:** Rasterize simulation state into the canvas texture.

**Invariant:** Render pass reads exactly the state produced by prior compute/draw-prep passes.

**Mechanism:** One render pipeline family using storage-buffer vertex pulling + indirect command streams.

## Scoped IR Implications

- [LAW:one-source-of-truth] Dynamic graph shading logic enters rendering through validated scoped IR output.
- [LAW:single-enforcer] Renderer composes static pass shaders and graph-generated functions at one deterministic assembly boundary.
- [LAW:dataflow-not-control-flow] Render behavior is data-driven via compiled artifacts and sink metadata.

## 1. Vertex Pulling (No CPU VBO Authoring in Hot Path)

Traditional vertex attributes are replaced by storage-buffer reads.

- **Topology source:** ShapeBank payload/virtual topology descriptors.
- **Attribute source:** Arena channels (position, rotation, scale, params).
- **Benefit:** compute and render share memory without copy/repack per frame.

## 2. Vertex Stage Contract

### 2.1 Inputs

Vertex shader consumes built-ins:

- `@builtin(vertex_index) v_idx`
- `@builtin(instance_index) i_idx`

and reads shape/header + arena fields via storage bindings.

### 2.2 Fetch/Transform Flow

1. Resolve sink/shape metadata.
2. Resolve local geometry (indexed payload or virtual topology interpretation).
3. Resolve world position from arena channels.
4. Apply **shared `view_projection_matrix`** from frame uniforms.

Camera contract is global and uniform across shape classes (Rigid/Parametric/Ribbon/Procedural/Text).

## 3. Fragment Stage Contract

### 3.1 Procedural (SDF) Path

Procedural shapes use proxy geometry + fragment-space distance evaluation.

- Use `fwidth`-based AA.
- Discard outside support window.
- Output premultiplied alpha.

### 3.2 Depth/Blend Policy

- Opaque pass: depth test/write ON.
- Transparent pass (including text/MSDF by default): depth test ON, depth write OFF.
- If procedural 2.5D path writes `frag_depth`, it must follow explicit depth safety rules.

## 4. Render Pass Encoder

### 4.1 Bindings

- Bind frame group(s): arena, shape bank, uniforms, materials.
- Bind index buffer before indexed loop.

### 4.2 Execution Loops (Two Indirect Streams)

```ts
const pass = encoder.beginRenderPass(descriptor);
pass.setPipeline(renderPipeline);
pass.setBindGroup(0, frameBindGroup);

// Indexed region
pass.setIndexBuffer(shapeBankIndexPayload, 'uint32');
for (let i = 0; i < indexedRecordCount; i++) {
  pass.drawIndexedIndirect(indirectBuffer, indexedRegionBase + i * 20);
}

// Non-indexed region
for (let j = 0; j < nonIndexedRecordCount; j++) {
  pass.drawIndirect(indirectBuffer, nonIndexedRegionBase + j * 16);
}

pass.end();
```

The two streams are ABI-distinct and must never be mixed by stride.

## 5. Alpha Compositing

Premultiplied alpha is mandatory.

Blend state:

- color: `src=one`, `dst=one-minus-src-alpha`, `op=add`
- alpha: `src=one`, `dst=one-minus-src-alpha`, `op=add`

Fragment output must be premultiplied (`vec4(rgb * a, a)`).

## 6. MSAA

- Use MSAA render target (`sampleCount=4`) when enabled.
- Recreate MSAA resources on canvas resize.
- Pipeline variants must match sample count.

## 7. Canonical Requirements

1. Renderer consumes compiler/runtime artifacts only; no ad hoc draw-count logic.
2. Render loop executes indexed + non-indexed indirect streams separately.
3. Shared camera/depth contract applies to all shape classes.
4. Premultiplied alpha and transparency depth policy are enforced uniformly.
5. No legacy fallback renderer ownership in canonical runtime path.

This sink consumes GPU-simulated state and emits stable composited output with hardware-correct indirect execution.
