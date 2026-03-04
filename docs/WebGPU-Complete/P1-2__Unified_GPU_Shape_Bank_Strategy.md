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

    - Reads Header = ShapeBank\[ShapeID \* 16\] (canonical `ShapeHeaderV1` stride: 16 words / 64 bytes).

    - Reads topology references from the header.

This allows heterogeneous shape usage in one frame, but not arbitrary mixed topology inside one indexed indirect record. Draw Prep must bucket sinks into compatible command records (indexed vs non-indexed, plus topology/material compatibility).

## 4. Lifecycle & Allocation Strategy

Since the Bank is "Read-Only" during the render pass, updates happen via CPU uploads.

### 4.1 Static Assets (The "Immutable" Zone)

Primitives (Square, Circle, Triangle) and imported assets (SVGs, Fonts) are uploaded once at startup or load time.

- **Allocator:** Stack-based (append only).

- **Defragmentation:** None required (unless the user deletes a massive font).

### 4.2 Dynamic Topology (The "Procedural" Zone)

Some blocks (like user-generated polygons) can produce dynamic topology.

- **Challenge:** We cannot re-upload the full ShapeBank at frame rate.

- **Solution:** A bounded dynamic region at the end of the payload heap.

  - Update only dirty slices (`queue.writeBuffer`) when topology actually changes.

  - Update corresponding headers to point at the new payload ranges.

  - Do not treat per-frame topology churn as the default path.

### 4.3 The "Default" Topologies

To save bandwidth, the Bank comes pre-loaded with standard primitives at fixed IDs.

- **ID 1 (Line Strip):** A "Virtual" topology. We don't store explicit index payload for this primitive; topology is resolved by shader logic and `topologyMode = NonIndexed/Virtual` metadata.

- **ID 2 (Quad):** 0, 1, 2, 2, 1, 3 (Triangle Strip for a quad).

## 5. Shader Implementation (WGSL)

The bank is bound once and decoded through canonical `ShapeHeaderV1` helpers.

Code snippet

struct ShapeHeaderV1 {\
kind: u32,\
topology_mode: u32,\
flags: u32,\
material_class: u32,\
index_count: u32,\
first_index: u32,\
base_vertex: i32,\
vertex_count: u32,\
first_vertex: u32,\
param_block_offset: u32,\
param_block_words: u32,\
_reserved0: u32,\
bounds_min_packed: u32,\
bounds_max_packed: u32,\
_reserved1: u32,\
_reserved2: u32,\
}\
\
@group(0) @binding(2) var\<storage, read\> shape_bank: array\<u32\>;\
\
fn get_header(shape_id: u32) -\> ShapeHeaderV1 {\
let base = shape_id * 16u; // 16-word stride\
// decode 16 words into ShapeHeaderV1\
}

## 6. The "Text" Special Case

Text rendering uses a hybrid ownership model.

- **CPU/Worker shaping:** UTF-8 decode, bidi/ligatures, kerning, line-wrap.
- **GPU rendering:** shared text quad topology + MSDF atlas sampling.
- **Arena data:** glyph instance transforms, glyph indices, style params.
- **ShapeBank data:** stable text proxy topology and atlas metadata tables.

Rendering stays in the same indirect pipeline; text records are typically non-indexed or indexed-quad batches depending on chosen proxy layout.

## 7. Summary of Requirements

1.  **Refactor ShapeBank:** Move from runtime/Arena (if it was there conceptually) to a dedicated GPUBuffer manager.

2.  **Implement ShapeAllocator:** A CPU-side service to manage immutable and dynamic payload regions.

3.  **Update CompiledProgramIR:** Add a ShapeTable plus draw-mode metadata so Draw Prep can emit indexed and non-indexed command streams.

4.  **Shader Integration:** Inject canonical `ShapeHeaderV1` decode helpers into vertex/fragment stages where needed.

This architecture turns the GPU into a "Geometry Database." The graph logic simply queries this database to decide what to draw, decoupling the *simulation* of motion from the *definition* of form.
