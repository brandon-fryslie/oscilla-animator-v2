> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Unified Buffer Strategy: The "Shape Bank" (Read-Only Storage)**.

This document defines the architecture for storing **Topology** (connectivity) separately from **Geometry** (positions). It solves the "Dual Representation" problem by creating a static, efficient lookup table for shape definitions, decoupling the physics simulation from the rendering logic.

# The Unified Buffer Strategy: The "Shape Bank"

**Objective:** Store structural definitions (SVGs, Glyphs, Primitives) in a unified, indexable GPU buffer.

**Invariant:** Topology data is immutable during a Render Pass.

**Mechanism:** A monolithic storage buffer containing packed u32 headers and index data.

## 1. The Philosophy: Topology vs. Geometry

In Oscilla v3.0, we strictly separate "Where it is" from "What it is."

- **Geometry (The "Field"):** Lives in the **Arena**. It is f32 data (positions, colors, thickness). It changes every frame (physics, animation).

- **Topology (The "Shape"):** Lives in the **Bank**. It is u32 data (vertex counts, index connectivity, flags). It rarely changes (only on graph edits or asset loads).

**The Benefit:** A particle system of 10,000 particles is just 10,000 \$(x,y)\$ coordinates in the Arena, all pointing to **Shape ID \#42** (a "Circle") in the Bank. We don't replicate the circle's topology 1000 times. We store it once and reference it.

## 2. The Memory Layout (u32 Storage)

The Shape Bank is a single storage buffer of type array\<u32\>. Unlike the Arena (which uses f32), the Bank is strictly integer-based.

It is partitioned into two regions: **Headers** and **Payloads**.

### 2.1 Region A: The Header Table (Fixed Stride)

The first \$N\$ kilobytes of the buffer are reserved for **Shape Headers**.

- **Stride:** 8 words (32 bytes) per shape.

- **Capacity:** Configurable (e.g., 4096 shapes max).

- **Access:** Direct lookup via ShapeID.

| **Offset (u32)** | **Field Name** | **Description** |
|----|----|----|
| 0 | VertexCount | The number of vertices in this shape (e.g., 4 for a Quad). |
| 1 | IndexCount | The number of indices to draw (e.g., 6 for a Quad). |
| 2 | IndexStart | The offset into **Region B** where the indices begin. |
| 3 | BaseVertex | Added to index values (useful for batching). |
| 4 | Flags | Bitmask: IS_CLOSED (1), IS_FILLED (2), HAS_UV (4). |
| 5 | BoundingBox_Min | Packed f16 (2x16-bit) min bounds (for culling). |
| 6 | BoundingBox_Max | Packed f16 (2x16-bit) max bounds. |
| 7 | Reserved | Padding for alignment/future use. |

### 2.2 Region B: The Payload Heap (Variable Stride)

The rest of the buffer acts as a heap for raw index data.

- **Content:** Arrays of u32 indices (e.g., 0, 1, 2, 0, 2, 3).

- **Allocation:** Contiguous blocks pointed to by IndexStart.

- **Format:** We use u32 indices to support large meshes (\>65k vertices), though for most 2D shapes, the values are small.

## 3. The "Handle" Mechanism

How does the Compute/Render pipeline use this?

### 3.1 The "Shape ID"

The **Shape ID** is simply the index of the header in Region A.

- **ID 0:** Null / Empty.

- **ID 1:** Unit Square.

- **ID 2:** Unit Circle (High Res).

- **ID 3:** User SVG Path "Logo".

### 3.2 The Linkage

1.  **Arena:** A Field\<u32\> (technically stored as f32) contains the Shape ID for each instance.

2.  **Vertex Shader:**

    - Reads InstanceID.

    - Reads ShapeID = Arena_Shapes\[InstanceID\].

    - Reads Header = ShapeBank\[ShapeID \* 8\].

    - Reads Index = ShapeBank\[Header.IndexStart + VertexID\].

This allows **Heterogeneous Instancing**. Instance 0 can draw a Square, and Instance 1 can draw a Circle, within the *same* draw call, simply by pointing to different headers.

## 4. Lifecycle & Allocation Strategy

Since the Bank is "Read-Only" during the render pass, updates happen via CPU uploads.

### 4.1 Static Assets (The "Immutable" Zone)

Primitives (Square, Circle, Triangle) and imported assets (SVGs, Fonts) are uploaded once at startup or load time.

- **Allocator:** Stack-based (append only).

- **Defragmentation:** None required (unless the user deletes a massive font).

### 4.2 Dynamic Topology (The "Procedural" Zone)

Some blocks (like Polygon or TextGenerator) generate new topology every frame.

- **Challenge:** We cannot re-upload the entire buffer at 144Hz.

- **Solution:** A **Ring Buffer** section at the end of the Payload Heap.

  - **Frame N:** The CPU writes new indices to the Ring Buffer head.

  - **Upload:** The CPU uploads *only* the dirty slice of the Ring Buffer (queue.writeBuffer).

  - **Header Update:** The CPU updates the Header (Region A) to point to the new offset in the Ring Buffer.

### 4.3 The "Default" Topologies

To save bandwidth, the Bank comes pre-loaded with standard primitives at fixed IDs.

- **ID 1 (Line Strip):** A "Virtual" topology. We don't store indices 0, 1, 2.... The shader generates them: index = vertex_id. The Header sets IndexCount = 0 to signal "Procedural Indexing".

- **ID 2 (Quad):** 0, 1, 2, 2, 1, 3 (Triangle Strip for a quad).

## 5. Shader Implementation (WGSL)

Here is exactly how the Bank is bound and read in the Vertex Shader.

Code snippet

struct ShapeHeader {\
vertex_count: u32,\
index_count: u32,\
index_start: u32,\
base_vertex: u32,\
flags: u32,\
// ... packed bounds ...\
}\
\
@group(0) @binding(2) var\<storage, read\> shape_bank: array\<u32\>;\
\
fn get_header(shape_id: u32) -\> ShapeHeader {\
let base = shape_id \* 8u; // Stride is 8\
return ShapeHeader(\
shape_bank\[base + 0u\],\
shape_bank\[base + 1u\],\
shape_bank\[base + 2u\],\
shape_bank\[base + 3u\],\
shape_bank\[base + 4u\]\
);\
}\
\
fn get_index(header: ShapeHeader, vertex_id: u32) -\> u32 {\
// Optimization: If IndexCount is 0, use Identity Indexing (Line Strip)\
if (header.index_count == 0u) {\
return vertex_id;\
}\
// Otherwise read from Payload Heap\
return shape_bank\[header.index_start + vertex_id\];\
}

## 6. The "Text" Special Case

Text Rendering is the ultimate stress test for the Shape Bank.

- **Font Atlas:** The Glyphs (curves) are stored as Shapes in the Bank. 'A' is ID 100, 'B' is ID 101.

- **String Generation:** When the user types "HELLO", the TextGenerator block produces a Field of Instances.

  - Instance 0: Pos=(0,0), ShapeID=107 ('H')

  - Instance 1: Pos=(10,0), ShapeID=104 ('E')

- **Rendering:** The renderer draws 5 instances. Each instance pulls a different topology from the Bank. Zero CPU triangulation required.

## 7. Summary of Requirements

1.  **Refactor ShapeBank:** Move from runtime/Arena (if it was there conceptually) to a dedicated GPUBuffer manager.

2.  **Implement ShapeAllocator:** A CPU-side service to manage the Heap and Ring Buffer offsets.

3.  **Update CompiledProgramIR:** Add a ShapeTable to the compilation artifact, ensuring static assets are assigned stable IDs.

4.  **Shader Integration:** Inject the get_header and get_index helper functions into every Vertex Shader.

This architecture turns the GPU into a "Geometry Database." The graph logic simply queries this database to decide what to draw, decoupling the *simulation* of motion from the *definition* of form.
