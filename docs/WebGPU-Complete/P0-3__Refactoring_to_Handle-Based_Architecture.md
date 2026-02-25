This is the comprehensive technical specification for **Phase 0: The Object Purge**.

This document mandates the complete eradication of JavaScript object references (pointers) from the runtime hot path. It replaces the flexible but unportable "Object Graph" with a strict "Handle-Based" architecture, treating the CPU runtime as if it were already a GPU driver managing VRAM.

# Phase 0: The Object Purge (Numeric Handles)

**Objective:** Eliminate pointer-chasing and Garbage Collection (GC) overhead from the render loop.

**Invariant:** Every data entity passed between blocks must be a scalar number (f32 value or u32 handle).

**Success Criteria:** The evaluate() function of any block can run without allocating a single new JavaScript object.

## 1. The "Handle" Concept

In the current architecture, a Generator block (like Square) likely returns a JavaScript object:

JavaScript

// OLD (Forbidden)\
return {\
type: 'path',\
closed: true,\
vertexCount: 4,\
indices: \[0, 1, 2, 3, 0\]\
};

The GPU cannot read this. The GPU only understands flat memory arrays.

### 1.1 The Numeric Handle

In the new architecture, the Generator returns a **Handle** (a u32 integer).

JavaScript

// NEW (Mandated)\
return 4096; // Handle pointing to index 4096 in the ShapeBank

This Handle is passed through the graph via the Arena (as a float, bit-cast if necessary, or just treated as a raw number). Downstream blocks use this number to look up the actual data in a centralized storage buffer.

## 2. The "Shape Bank" Architecture

We introduce a new centralized memory store called the **Shape Bank**.

### 2.1 Memory Layout

The Shape Bank is a single Uint32Array. It acts as the "Heap" for structural data. It stores **Topology** (connectivity), not **Geometry** (positions).

- **Geometry (Positions):** Lives in the Arena (SoA Fields).

- **Topology (Connectivity):** Lives in the Shape Bank.

**The Stride Layout (Header + Payload):**

Every Shape entry in the Bank follows a strict binary format:

| **Offset** | **Field** | **Type** | **Description** |
|----|----|----|----|
| **0** | IndexCount | u32 | Number of indices in the topology. |
| **1** | IndexOffset | u32 | Offset into the global Index Buffer (if static) or ShapeBank (if inline). |
| **2** | VertexCount | u32 | Number of vertices (defines the Field size). |
| **3** | Flags | u32 | Bitmask: IS_CLOSED (1), IS_FILLED (2), HAS_UV (4). |
| **4...N** | InlineData | u32 | (Optional) Inline index data for dynamic shapes. |

### 2.2 The "Dual Representation" Link

The Handle effectively links the **Field** (Physics) to the **Bank** (Structure).

- **Block A (Spiral Generator):**

  1.  Writes 1000 \$(x,y)\$ positions to Arena (Fields).

  2.  Writes { count: 1000, closed: false } to ShapeBank at index H.

  3.  Outputs H to Arena (Scalars).

- **Block B (Renderer):**

  1.  Reads H from inputs.

  2.  Reads metadata from ShapeBank\[H\].

  3.  Draws ShapeBank\[H\].IndexCount vertices using positions from the input Field.

## 3. The Allocator Strategy (Dynamic vs. Static)

Managing this Uint32Array requires an allocation strategy. Since we are in JS (CPU) for Phase 0, we implement a simplified version of what the GPU will do.

### 3.1 The "Frame Volatile" Allocator

Most shapes in a generative system are dynamic (e.g., a trail that grows). We cannot malloc/free complex heaps every frame.

- **Strategy:** A Linear Allocator (Bump Pointer).

- **Cycle:**

  1.  **Frame Start:** Set ShapeBankPtr = 0.

  2.  **During Frame:** Blocks call allocShape(size). We return the current pointer and increment it.

  3.  **Frame End:** Do nothing. The next frame overwrites the data.

- **Benefit:** Zero GC overhead. \$O(1)\$ allocation cost.

### 3.2 The "Static Asset" Allocator (Phase 1 Prep)

For imported SVGs or Fonts, we don't want to re-upload them every frame.

- **Strategy:** Reserve the *bottom* half of the Shape Bank for Static Assets.

- **Implementation:** The Frame Volatile pointer starts at STATIC_BOUNDARY (e.g., index 1,000,000) instead of 0.

## 4. Refactoring the Blocks

Every block that produces or consumes "Geometry" must be rewritten.

### 4.1 The Generator Pattern (Producer)

**Old Logic:**

return new Path({ points: ... })

**New Logic:**

TypeScript

evaluate(ctx) {\
// 1. Calculate Geometry (Positions)\
// ... write to ctx.outputs.position (Arena Field) ...\
\
// 2. Allocate Topology\
const handle = ctx.runtime.shapeAllocator.alloc(4); // 4 u32 words for header\
\
// 3. Write Topology Header\
const bank = ctx.runtime.shapeBank;\
bank\[handle + 0\] = numPoints; // IndexCount\
bank\[handle + 1\] = 0; // IndexOffset (0 = sequential line strip)\
bank\[handle + 2\] = numPoints; // VertexCount\
bank\[handle + 3\] = IS_CLOSED_BIT;\
\
// 4. Output the Handle\
// Write 'handle' (casted to f32) to ctx.outputs.shape\
ctx.outputs.shape\[0\] = handle;\
}

### 4.2 The Deformer Pattern (Transformer)

Deformers (like Noise or Transform) usually operate on the *Field* (Arena), not the *Shape* (Bank).

- **Pass-Through:** Most deformers simply **pass the Handle ID** from input to output unchanged.

- **Action:** They only modify the Arena (Positions). They don't touch the ShapeBank.

### 4.3 The Assembler/renderer (Consumer)

The final step (the Sink) reads the handle.

- **Action:**

  1.  Read HandleID from input wire.

  2.  Retrieve ShapeData from ShapeBank\[HandleID\].

  3.  Generate the Draw Command using ShapeData.IndexCount and the linked Field data.

## 5. Handling "List of Objects" (Multi-Instance)

What if a Generator produces 10 circles?

In the AoS world, this was \[Circle, Circle, Circle\].

In the SoA/Handle world, this is a **Field of Handles**.

### 5.1 The Field\<Handle\>

The "Shape" output port usually has cardinality: one (one topology for the whole stream).

- **Scenario:** A particle system where every particle is a *different* shape (Square, Circle, Triangle).

- **Implementation:** The "Shape" wire becomes a Field\<u32\> (stored as f32 in Arena).

- **Renderer:** Iterates through the Instance Count. For each instance \$i\$, it reads Handle\[i\] to decide what topology to draw.

*Note:* For v3.0, we prioritize **Instancing** (One Handle, Many Positions) over **Multi-Shape** (Many Handles, Many Positions) because it is drastically faster on the GPU.

## 6. Verification: The "No-Alloc" Test

How do we prove Phase 0 is successful?

### 6.1 The Heap Snapshot Test

1.  **Tool:** Chrome DevTools Memory Profiler.

2.  **Action:** Record an Allocation Timeline while the patch is running.

3.  **Pass:** You should see **zero** (or near-zero) allocations of Object, Array, or Path2D during the animation loop. The only memory activity should be writing numbers into the pre-allocated Float32Array (Arena) and Uint32Array (ShapeBank).

4.  **Fail:** If you see "Sawtooth" memory graphs (GC spikes), a block is still creating temporary objects.

## 7. Summary of Required Changes

1.  **New Runtime Primitive:** ShapeBank (Uint32Array) added to RuntimeState.

2.  **New Service:** ShapeAllocator (Bump pointer logic).

3.  **Update canonical-types.ts:** Define HANDLE type (alias for f32 in Arena, treated as u32 in logic).

4.  **Refactor Generators:** Update Circle, Rect, Polygon, Spiral to write to ShapeBank and output a Handle.

5.  **Refactor Sink:** Update RenderAssembler to read Handles and lookup topology from the Bank.

This refactor bridges the gap between JavaScript's "Reference" world and the GPU's "Pointer" world. Once this is done, "uploading to GPU" is just a memcpy.
