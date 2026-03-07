Here is the completely rewritten, optimized specification for Oscilla's coordinate system. It formalizes the standard 5-space matrix pipeline, decouples layout math from screen resolution, implements proper DPI awareness, and protects procedural SDFs from distortion by enforcing uniform scaling.

---

## parent: ../INDEX.md topic: coordinate-spaces order: 16

# Coordinate Spaces & Transforms

> Formal definition of the five-space coordinate model, matrix transformation pipeline, and spatial semantics.

**Related Topics**: [02-block-system](./02-block-system.md), [04-compilation](./04-compilation.md), [05-runtime](./05-runtime.md), [06-renderer](./06-renderer.md)
**Key Terms**: [Local Space](../GLOSSARY.md#local-space), [World Space](../GLOSSARY.md#world-space), [Clip Space](../GLOSSARY.md#clip-space), [scale](../GLOSSARY.md#scale)
**Relevant Invariants**: [I15](../INVARIANTS.md#i15-renderer-is-a-sink-not-an-engine)

---

## Overview

Oscilla uses a formalized 5-space coordinate model driven entirely by standard matrix algebra. Every geometric value exists within one of these spaces, and transitions between spaces are executed via 4x4 matrix multiplication in the WebGPU hardware pipeline:

| Space | Role | Range | Engine Owner |
| --- | --- | --- | --- |
| **Local (L)** | Geometry definition & SDF math | Centered at (0,0), magnitude $O(1)$ | JS / ShapeBank |
| **World (W)** | Absolute instance placement | Unbounded Cartesian $\mathbb{R}^3$ | JS Layout / Compute Pass |
| **View (V)** | Camera-relative world | Unbounded Cartesian $\mathbb{R}^3$ | Engine (Camera Uniforms) |
| **Clip (C)** | Hardware normalized box | $X,Y \in [-1, 1]$, $Z \in [0, 1]$ | WGSL Vertex Shader |
| **Viewport (P)** | Rasterized physical output | $X \in [0, W_{px}]$, $Y \in [0, H_{px}]$ | WebGPU Rasterizer |

---

## Local Space

### Definition

Local space is the coordinate system in which abstract geometry and control points are mathematically defined. Every shape's geometry is authored relative to its own origin.

**Properties**:

* Origin at `(0, 0, 0)`.
* Magnitude $O(1)$. For 2.5D generative shapes, the default bounds are typically a unit square `[-0.5, 0.5]`.
* Absolutely no relation to screen position, aspect ratio, or camera zoom.
* For Procedural / Signed Distance Field (SDF) shapes, Euclidean distance is perfectly preserved here.

### The "Bounds" Paradigm vs. Anisotropic Scaling

Oscilla does **not** use anisotropic matrix scaling (e.g., stretching a shape's X-axis by 2.0 via a transform matrix) for procedural shapes. Matrix-level anisotropic scaling mathematically breaks SDF Euclidean distance calculations, causing fuzzy rendering artifacts and distorted border radii.

Instead, shapes that require non-uniform dimensions (like a wide rectangle) accept explicit `bounds` (e.g., `width` and `height`) as parameters in Local space. The geometry itself is generated to fit those bounds, while the shape's coordinate transform remains strictly isotropic (uniform).

---

## World Space

### Definition

World space is the absolute, unbounded simulation domain. Layout blocks, physics kernels, and particle systems produce positions in World space.

**Properties**:

* Range: Unbounded Cartesian space $\mathbb{R}^3$ ($-\infty$ to $+\infty$).
* The $Z=0$ plane is the canonical 2D surface.
* Layout blocks produce `Field<vec3>` positions (or `vec2` implicitly at $Z=0$).

### The Canonical Visible Region

While World space is infinite, the unit cube `[0, 1]³` represents the **Canonical Visible Region** when the camera is at its default state (Pan: `0,0`, Zoom: `1.0`).

* Layout kernels typically target this `[0, 1]` region to place objects "on canvas".
* However, coordinates like `x = 5.0` are mathematically valid (representing an instance 5 canvas-widths to the right, waiting to be panned into view or affected by physics).

---

## View & Clip Space (The Camera Domain)

### View Space

View space represents the World coordinates translated and rotated relative to the active camera. If a user pans the canvas to the right, the camera moves right, which means the View space coordinates of all objects move to the left.

### Clip Space (NDC)

Clip space is the mandatory Normalized Device Coordinate (NDC) system required by WebGPU.

* **Aspect Ratio Correction:** The conversion from View to Clip space is where the screen's aspect ratio is resolved via an Orthographic or Perspective Projection matrix.
* This structural isolation guarantees that a perfect circle in World space remains a perfect circle on a 16:9 monitor, without Layout or Compute kernels ever needing to know the screen's dimensions.

---

## Viewport Space (DPI Awareness)

### Definition

Viewport space maps the hardware Clip coordinates to the physical pixels of the monitor.

**Properties**:

* Handled automatically by the WebGPU rasterizer based on the `wgpu::Surface` configuration.
* **Strictly Physical:** Viewport dimensions are always physical pixels, not CSS logical pixels.
* The engine computes `Physical = Logical \times devicePixelRatio` during initialization and resize events to guarantee crisp rendering on High-DPI/Retina displays.

---

## The Transform Chain

Transitions between spaces are strictly enforced via 4x4 Transformation Matrices. The full transform from local geometry to hardware clip space is computed as follows:

### 1. The Model Matrix (Local $\rightarrow$ World)

The Compute Shader builds a Model Matrix ($M$) for each instance, combining its Translation ($T$), Rotation ($R$), and Uniform Scale ($S$).

$$M = T(pos_{world}) \cdot R(\theta) \cdot S(scale)$$

$$p_{world} = M \cdot p_{local}$$

### 2. The View-Projection Matrix (World $\rightarrow$ Clip)

The CPU constructs a combined View-Projection Matrix ($VP$) representing the Camera's Pan, Zoom, and Aspect Ratio. This is passed to the GPU as a single uniform variable (`global.view_proj_matrix`).

$$p_{clip} = VP \cdot p_{world}$$

### 3. The Combined Vertex Shader Execution

The Uber Shader condenses the spatial pipeline into highly optimized matrix multiplications:

$$p_{clip} = VP \cdot (M \cdot p_{local})$$

---

## `scale` Semantics

### Definition

`scale` is the **strictly isotropic (uniform) scale factor** applied to an instance's Model Matrix.

* Type: `Signal<float>` or `Field<float>`.
* Semantics: Scales the Local space geometry uniformly across all axes before placing it in World space.
* Because it is strictly uniform, it guarantees that procedural SDFs, stroke widths, and anti-aliasing math remain mathematically flawless regardless of transform depth.

*(Note: The legacy `scale2` anisotropic property is deprecated at the transform level. Non-uniform dimensions are handled by defining `bounds` during Local geometry generation).*

---

## Coordinate-Space Enforcement

Coordinate spaces are enforced by block-level naming conventions and typing:

| Name Pattern | Space | Type Target | Example |
| --- | --- | --- | --- |
| `bounds`, `controlPoints`, `path` | Local | Geometry Definition | `vec2`, `float` |
| `position`, `offset`, `center` | World | Layout / Physics | `vec3`, `vec2` |
| `viewProj`, `camera` | View/Clip | Uniforms | `mat4x4` |
| `resolution`, `pixel` | Viewport | Renderer internals | `vec2` |

Connecting ports of different spaces (e.g., feeding a World position into a Local geometry bound) without an explicit conversion block is a semantic error caught by naming convention.

---

## Impact on Other Topics

### Block System (Topic 02)

* Primitive blocks define geometry in **Local space**, accepting `bounds` rather than downstream anisotropic scaling.
* Layout blocks produce absolute positions in **World space** (unbounded $\mathbb{R}^3$).

### Compilation (Topic 04)

* The compiler emits WGSL that explicitly respects the matrix multiplication order.
* Screen dimensions and aspect ratios are completely purged from layout compilation logic.

### Runtime (Topic 05)

* Field buffers for positions hold **World space** coordinates.
* Camera Pan and Zoom are mapped directly to a 4x4 matrix on the CPU before transmission to the GPU.

### Renderer (Topic 06)

* The Uber Shader receives `p_{local}` from the ShapeBank.
* The Vertex stage performs $VP \cdot M \cdot p_{local}$ to output Clip space.
  * The Rasterizer handles the final Clip $\rightarrow$ Viewport space conversion automatically.