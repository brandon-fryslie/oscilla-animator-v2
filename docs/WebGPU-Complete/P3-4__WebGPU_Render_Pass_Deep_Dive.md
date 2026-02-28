> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Runtime Loop: The Render Pass (The "Sink")**.

This document defines the final stage of the pipeline where the abstract simulation state is materialized into pixels. It details the "Vertex Pulling" architecture that replaces traditional Vertex Attributes, the "Uber-Shader" that handles all drawing, and the precise alpha blending mathematics required for professional-grade compositing.

# The Runtime Loop: The Render Pass (The "Sink")

**Objective:** Rasterize the simulation state into the Canvas texture.

**Invariant:** The Render Pass reads the *exact* state produced by the Compute Pass (no double-buffering lag).

**Mechanism:** A RenderPipeline using **Programmable Vertex Pulling** and **Indirect Draw Commands**.

## Scoped IR Implications

- [LAW:one-source-of-truth] Dynamic graph shading logic enters the render stack through validated scoped IR output, not ad hoc WGSL concatenation.
- [LAW:single-enforcer] The renderer composes static pass shaders and graph-generated functions at one deterministic assembly boundary before pipeline creation.
- [LAW:dataflow-not-control-flow] Render pass behavior depends on data produced by prior passes; control-flow shape is fixed by compiled IR artifacts.

## 1. The "Vertex Pulling" Paradigm (No VBOs)

In legacy WebGL/OpenGL, you create a VertexBuffer for positions, another for colors, and bind them with setAttribute.

In Oscilla v3.0, **we do not use Vertex Buffers.**

### 1.1 Why?

- **Flexibility:** A "Vertex Buffer" implies a fixed layout (e.g., vec3 pos, vec4 color). Our graph is dynamic; users can add "Thickness" or "Rotation" fields at runtime.

- **Performance:** Binding VBOs is slow. Reading directly from the **Arena** (Storage Buffer) in the Vertex Shader is fast and allows us to use the same buffer for Compute and Render without copying data.

### 1.2 The Architecture

- **Indices:** We **DO** use a hardware IndexBuffer. This is the **Payload Region** of the ShapeBank.

  - *Usage:* INDEX \| STORAGE \| COPY_DST.

- **Attributes:** We fetch these manually in the Vertex Shader.

  - *Method:* let pos = arena_field_x\[instance_index\];

## 2. The Uber-Shader: Vertex Stage

The Compiler generates a single Vertex Shader that can draw *anything* (Lines, Circles, Trails). It uses a switch or if logic based on the ShapeID.

### 2.1 Inputs

The shader does not declare location(0) inputs. It declares built-ins:

Code snippet

struct VertexOutput {\
@builtin(position) clip_position: vec4\<f32\>,\
@location(0) color: vec4\<f32\>,\
@location(1) uv: vec2\<f32\>,\
@location(2) shape_data: vec4\<f32\> // Radius, Thickness, etc.\
};\
\
@vertex\
fn main(\
@builtin(vertex_index) v_idx: u32, // The Index from ShapeBank\
@builtin(instance_index) i_idx: u32 // The Particle ID\
) -\> VertexOutput { ... }

### 2.2 The Fetch Logic

1.  **Resolve Shape:**

    - Read ShapeID from the Arena: let shape_id = arena_shapes\[i_idx\];

    - Fetch ShapeHeader from the Bank.

2.  **Resolve Local Geometry:**

    - The v_idx tells us *which corner* of the shape we are drawing.

    - *Procedural:* If drawing a Quad, v_idx 0 is (-1, -1). We calculate this mathematically or look it up in a small const array.

3.  **Resolve World Position:**

    - Read pos_x = arena_pos_x\[i_idx\].

    - Read pos_y = arena_pos_y\[i_idx\].

    - *Apply Transform:* world_pos = vec2(pos_x, pos_y) + (local_geo \* scale);

4.  **Aspect Ratio Correction:**

    - The GPU knows the resolution (Uniforms).

    - We apply clip_pos.x /= aspect_ratio here. No matrix uniforms required from CPU.

## 3. The Uber-Shader: Fragment Stage

This is where we handle "Procedural Shapes" (SDFs) to get infinite resolution.

### 3.1 The SDF Trick

If we draw a circle using a mesh, it looks blocky when zoomed in.

Instead, we draw a **Bounding Quad** and compute the circle in the pixel shader.

- **Vertex Shader:** Output uv coordinates (-1 to +1).

- **Fragment Shader:**\
  Code snippet\
  @fragment\
  fn main(in: VertexOutput) -\> @location(0) vec4\<f32\> {\
  // 1. Calculate Distance\
  let dist = length(in.uv) - 1.0; // Negative inside, Positive outside\
  \
  // 2. Antialiasing (The Derivative Trick)\
  // fwidth() tells us how much 'uv' changes per pixel.\
  // We use this to soften the edge exactly 1 pixel wide.\
  let delta = fwidth(dist);\
  let alpha = 1.0 - smoothstep(-delta, delta, dist);\
  \
  // 3. Discard if invisible\
  if (alpha \< 0.01) { discard; }\
  \
  return in.color \* alpha;\
  }

- **Result:** A mathematically perfect circle at any zoom level, drawn using just 4 vertices.

## 4. The Render Pass Encoder

The CPU side of the render loop is surprisingly simple because the heavy lifting was done in "Draw Prep."

### 4.1 The Pass Descriptor

We use a **Load/Store** strategy that respects the web's compositing model.

- **Color Attachment 0:** The MSAA Texture (Multisampled).

  - loadOp: 'clear' (Clear to clearColor).

  - storeOp: 'discard' (We resolve it, so we don't need to store the MSAA data).

- **Resolve Target:** The Canvas Texture (SwapChain).

  - loadOp: 'clear' (Or load if layering).

  - storeOp: 'store' (Keep the pixels).

### 4.2 The Execution Loop

TypeScript

// RuntimeExecutor.ts\
const pass = encoder.beginRenderPass(descriptor);\
\
pass.setPipeline(renderPipeline);\
pass.setBindGroup(0, frameBindGroup); // Arena, Bank, Uniforms\
\
// Bind the ShapeBank Payload as Index Buffer\
// This allows the Indirect Draw to reference indices.\
pass.setIndexBuffer(shapeBankBuffer, 'uint32');\
\
// The Loop\
for (let i = 0; i \< activeRenderers.length; i++) {\
// Indirect Draw\
// Offset is i \* 20 bytes (size of DrawIndexedIndirectArgs)\
pass.drawIndexedIndirect(indirectBuffer, i \* 20);\
}\
\
pass.end();

## 5. Alpha Blending & Compositing

This is a common failure point in WebGPU apps. The browser composites your canvas with the HTML page.

### 5.1 Premultiplied Alpha

Oscilla must output **Premultiplied Alpha**.

- **Standard Alpha:** (R, G, B, A) = (1, 1, 1, 0.5) (White at 50%).

- **Premultiplied:** (R, G, B, A) = (0.5, 0.5, 0.5, 0.5).

- **Why:** It is the only way to correctly blend "Additive" (Fire) and "Alpha" (Glass) layers in the same pass.

### 5.2 The Blend State

Our RenderPipeline must use this configuration:

TypeScript

blend: {\
color: {\
srcFactor: 'one', // Add the new color (it's already premultiplied)\
dstFactor: 'one-minus-src-alpha', // Fade the background\
operation: 'add'\
},\
alpha: {\
srcFactor: 'one',\
dstFactor: 'one-minus-src-alpha',\
operation: 'add'\
}\
}

### 5.3 The Shader Responsibility

The Fragment Shader **must** output premultiplied values.

Code snippet

// Correct\
return vec4(color.rgb \* color.a, color.a);

## 6. Multi-Sampling (MSAA)

To avoid jagged edges on geometry (e.g., lines), we enable 4x MSAA.

### 6.1 Resource Allocation

We allocate a private texture_2d\<f32\> with sampleCount: 4.

- **Size:** Matches the canvas.

- **Reallocation:** Must be destroyed and recreated whenever the canvas resizes.

### 6.2 The Pipeline Flag

multisample: { count: 4 } must be set in the createRenderPipeline descriptor.

- *Note:* This pipeline is incompatible with non-MSAA passes. If the user disables AA in settings, we must switch to a different pipeline object.

## 7. Summary of Implementation

1.  **Refactor RenderPipeline:** Remove all vertexBuffers descriptors. Switch to storage-based pulling.

2.  **Update Vertex Shader:** Implement fetch_shape_header(shape_id) and aspect ratio logic.

3.  **Update Fragment Shader:** Implement SDF antialiasing (fwidth) for procedural shapes.

4.  **Configure Blending:** Enforce Premultiplied Alpha everywhere.

5.  **Integrate Indirect:** Use drawIndexedIndirect pointing to the buffer populated by the Draw Prep kernel.

This sink consumes the chaos of the physics engine and outputs a clean, antialiased, composited image, ready for the user's display. It is the final "Read" operation of the frame.
