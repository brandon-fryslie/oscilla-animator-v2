---

## parent: ../INDEX.md topic: camera-projection order: 18 tier: T2

# Camera & Projection

## Overview

Camera projection is a **Matrix Generation Kernel** executed entirely on the GPU as a specialized 1-thread compute pass. Because camera parameters are fully modulatable values driven by the node graph, the CPU has no per-frame knowledge of the camera state. The projection kernel condenses the evaluated spatial data into a single 4x4 View-Projection Matrix ($VP$).

This matrix is stored in a dedicated GPU buffer where the hardware pipeline consumes it to transform World space coordinates into Clip space (Normalized Device Coordinates).

The Camera & Projection system provides:

* Two projection modes: orthographic (default) and perspective.
* An optional Camera block for modulating projection parameters via the graph.
* Hardware-native frustum culling and depth buffering contracts.

**Architectural position**: Matrix generation is a GPU compute responsibility, executed strictly after the main Simulation pass (so values are fully evaluated) but before Draw-Prep (so instances can be culled).

---

## GPU Matrix Generation Pipeline

The compilation phase emits a dedicated `@workgroup_size(1)` compute kernel to resolve the camera matrix every frame.

### Execution Order

1. **Simulation Passes:** Evaluates all graph logic, writing the final `one:float` values for camera Pan, Zoom, Tilt, etc., into the global GPU State Buffer.
2. **Matrix Generation Pass (1 Thread):** Reads the assigned offsets from the State Buffer, reads the physical aspect ratio from the global uniforms, and executes the math to build the $VP$ matrix. It writes this matrix to a dedicated `CameraState` storage buffer.
3. **Draw-Prep Pass:** Reads the $VP$ matrix to perform Frustum Culling, dropping instances that fall outside the view frustum.
4. **Vertex Shader:** Reads the $VP$ matrix to project local geometric coordinates to Clip space.

### Projection Kernels (WGSL)

The generated compute pass utilizes one of two mathematical kernels to build the final $VP$ matrix:

**`build_ortho_matrix`** (System Default)

* **Parameters:** `center` (vec2), `zoom` (float), `aspectRatio` (float).
* **Identity proof requirement:** For $Z = 0.0$ and default parameters, the resulting matrix maps the $[0, 1]^2$ World space region exactly to the $[-1, 1]^2$ Clip space region, accounting for aspect ratio. This ensures 2D layout computations translate perfectly to the screen without distortion.

**`build_perspective_matrix`**

* **Parameters:** `center` (vec3), `distance` (float), `tilt` (float), `yaw` (float), `fovY` (float), `near` (float), `far` (float), `aspectRatio` (float).
* **Transformation Output:** Standard perspective projection matrix ($P$) multiplied by a LookAt view matrix ($V$).

---

## Camera Block

The **Camera block** is a render-side declaration block. It defines the modulation sources for camera parameters but does **NOT** produce node-graph outputs consumed by other blocks.

### Camera Block Rules

**Cardinality:**

* Exactly **0 or 1** Camera block per patch.
* **2 or more** Camera blocks → compile error.
* *Rationale:* Single camera source of truth. Multiple cameras are only permitted when multi-view render target models are introduced (e.g., split-screen).

**Category:**

* Render-side declaration.
* Not a compute node.
* Not a source block.

**Port Set** (all optional inputs, type `one:T`):

| Port | Type | Default (if not connected) |
| --- | --- | --- |
| `center` | `one:vec2` | `(0.5, 0.5)` |
| `distance` | `one:float` | `2.0` |
| `tilt` | `one:float` | `35.0` (degrees) |
| `yaw` | `one:float` | `0.0` (degrees) |
| `fovY` | `one:float` | `45.0` (degrees) |
| `near` | `one:float` | `0.01` |
| `far` | `one:float` | `100.0` |
| `projection` | `one:int` | `0` (0=ortho, 1=perspective) |

**Notes:**

* All inputs are modulatable (they accept time-varying values evaluated during the Simulation pass).
* `projection` discriminates the matrix kernel branching logic: `0` = ortho, `1` = perspective.

---

## Compile-Time Resolution

The compiler determines the structure of the 1-Thread Matrix Generation pass based on the presence of the Camera block. There is no runtime CPU evaluation.

1. **Camera Block Present:**
* The compiler hardcodes the physical State Buffer offsets of the evaluated ports into the matrix generation WGSL.
* The GPU reads these dynamically computed values at frame-time to construct the matrix.
* Unconnected ports compile to their static default values.


2. **No Camera Block (System Defaults):**
* The compiler generates a minimal compute pass that strictly writes the default Orthographic identity matrix to the `CameraState` buffer using a zoom of `1.0` and a center of `(0.5, 0.5)`.



---

## Hardware Execution Contracts

Legacy $O(N)$ CPU-side arrays for `screenPosition`, `depth`, and `visible` are deprecated. The GPU fulfills these contracts natively through the graphics hardware pipeline.

### 1. Visibility Contract (Draw-Prep Culling)

Visibility determination is the responsibility of the GPU Draw-Prep pass.

* The kernel evaluates the World-space bounding box of an instance multiplied by the $VP$ matrix.
* If the transformed bounds lie entirely outside the Clip space volume ($X, Y \notin [-1, 1]$ or $Z \notin [0, 1]$), the instance is discarded.
* The GPU bypasses the `atomicAdd` for that instance in the indirect command buffer, guaranteeing the vertex shader never executes for invisible geometry.

### 2. Screen Position & Depth (Vertex Shader)

The Uber Shader receives the Local geometry and applies the transform chain:

$$p_{clip} = VP \cdot (M_{model} \cdot p_{local})$$

* **Screen Position** is handled implicitly by the WebGPU hardware rasterizer mapping the $X,Y$ Clip coordinates to physical Viewport pixels.
* **Depth** is the resulting $Z$ coordinate in Clip space, which is automatically written to the depth attachment.

---

## Depth Ordering (Z-Buffer)

CPU-side stable sorting permutations are deprecated. Depth ordering is natively enforced by the **Hardware Depth Buffer (Z-Buffer)**.

### Ordering Rules

**Primary key:** `Z` Clip coordinate (Hardware `LessEqual` depth compare).

* The Rust renderer provisions a `wgpu::TextureFormat::Depth32Float` attachment.
* As the rasterizer processes fragments, it writes the Clip space $Z$ value to the depth texture.
* Fragments with a smaller $Z$ value (nearer to camera) strictly overpaint fragments with a larger $Z$ value (farther from camera).
* **Tie-break:** Co-planar geometry (identical $Z$) relies on WebGPU indirect draw-call submission order.

**Stability:** The Z-buffer operates per-pixel, providing mathematically perfect intersection rendering (e.g., intersecting planes) which CPU sorting cannot achieve.

---

## StepRender Contract (Updated)

```typescript
interface StepRender {
  positionXYSlot: ValueSlot;           // cardinality=many(instanceId)
  positionZSlot: ValueSlot | null;     // optional, cardinality=many(instanceId)
  shapeSlot: ScalarSlotRef;            // shape2d handle, cardinality=one
  colorSlot: ValueSlot;                // cardinality=one or many
  scaleSlot: ValueSlot;                // Isotropic uniform scale
  rotationSlot: ValueSlot | null;      // optional
  // ... additional render properties
}

```

**Position contract:**

* `positionXYSlot` and `positionZSlot` represent absolute coordinates in **World Space**.
* Mismatched `instanceId` cardinality between X/Y and Z slots results in a compile error.

**See also:** [06-renderer.md](https://www.google.com/search?q=./06-renderer.md) for full StepRender specification.

---

## Related Topics

* [16-coordinate-spaces](https://www.google.com/search?q=./16-coordinate-spaces.md) — The 5-space matrix pipeline definitions.
* [05-runtime](https://www.google.com/search?q=./05-runtime.md) — Compute shader execution phasing.
* [06-renderer](https://www.google.com/search?q=./06-renderer.md) — WebGPU Global Uniforms and Depth Target configuration.

## Key Terms

* **$VP$ Matrix** — The combined 4x4 View-Projection matrix computed on the GPU.
* **Draw-Prep Culling** — GPU compute pass that drops mathematically invisible instances from the indirect draw buffer.
* **Z-Buffer** — Hardware-accelerated 32-bit float texture that enforces physical depth occlusion.

## Relevant Invariants

* **I15** (Renderer is sink) — The renderer consumes the $VP$ matrix to rasterize, but does not alter logical World coordinates.
* **I1** (Single source of truth) — Exactly one $VP$ matrix governs the unified physical Viewport per frame.
* **I4** (Single enforcer) — Depth ordering is enforced exclusively by the physical WebGPU Depth Target.