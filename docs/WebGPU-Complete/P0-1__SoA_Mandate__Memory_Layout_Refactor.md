This is the comprehensive technical specification for **Phase 0: The SoA Mandate**.

This document defines the strict memory layout protocols that must be implemented in the current CPU engine *before* any WebGPU migration begins. It ensures that the runtime data structures are no longer optimized for JavaScript objects, but for linear memory access and GPU storage buffer compatibility.

# Phase 0: The Structure of Arrays (SoA) Mandate

**Objective:** Eradicate all "Array of Structures" (AoS) patterns from the hot path.

**Invariant:** Memory is allocated as contiguous, channel-separated blocks.

**Success Criteria:** The application renders identical pixels, but RuntimeState.arena is organized exactly as it will be in VRAM.

## 1. The Memory Model Definition

We are moving from a "Logical Object Model" (where a Particle is an entity with properties) to a "Columnar Data Model" (where properties are arrays that happen to share an index).

### 1.1 The Global Arena

Instead of fragmented arrays, the entire application state lives in one massive Float32Array (the **Host Arena**). This array is virtually partitioned into three zones.

| **Zone** | **Byte Alignment** | **Usage** |
|----|----|----|
| **Zone A: Uniforms** | 256 Bytes | Global parameters (Time, Mouse, Resolution). Fixed size. |
| **Zone B: Scalars** | 16 Bytes | Output of all cardinality: one blocks (LFOs, Math). |
| **Zone C: Fields** | 16 Bytes | Output of all cardinality: many blocks. Variable size. |

### 1.2 The Field Layout (Pure SoA)

This is the most critical change. A Field\<vec3\> with 1000 instances is no longer stored as \[x,y,z, x,y,z...\]. It is decomposed into three distinct, disjoint allocations within the Host Arena.

- **Channel X:** \[x0, x1, ... x999\] (Allocated at OFFSET_X)

- **Channel Y:** \[y0, y1, ... y999\] (Allocated at OFFSET_Y)

- **Channel Z:** \[z0, z1, ... z999\] (Allocated at OFFSET_Z)

**Crucial Padding Rule:**

Every channel allocation must be padded to a **16-byte (4-float) boundary**.

- *Example:* If a field has 5 instances (20 bytes), the next channel cannot start at byte 20. It must start at byte 32 (next 16-byte multiple).

- *Why:* WebGPU Storage Buffers often require aligned reads. If we don't pad on the CPU, a GPU thread reading Channel Y might crash or read garbage due to misalignment.

## 2. The Compiler Refactor (ArenaLayout)

The Compiler's Layout phase currently calculates a single offset and a stride for each block. This must be replaced by a **Multi-Channel Offset Resolver**.

### 2.1 The New SlotMeta Contract

The compiler must track allocations per *channel*, not per slot.

- **Old Way:** Slot 5 (vec3) -\> { offset: 1024, stride: 3 }

- **New Way:** Slot 5 (vec3) -\> { offsets: \[1024, 2048, 3072\], stride: 1 }

### 2.2 The Allocation Algorithm

The compiler iterates through the sorted execution schedule (or topological list) and issues allocations from a "Heap Pointer."

1.  **Initialize:** heap_ptr = UNIFORM_ZONE_SIZE (e.g., 256).

2.  **For Each Scalar Block:**

    - Assign offset = heap_ptr.

    - Increment heap_ptr += 4 (1 float).

    - *Padding:* If heap_ptr % 16 != 0, advance to next multiple.

3.  **For Each Field Block:**

    - Determine instance_count (N).

    - Determine component_count (e.g., 3 for vec3).

    - **Loop (k = 0 to component_count):**

      - Assign offsets\[k\] = heap_ptr.

      - Increment heap_ptr += N \* 4.

      - *Padding:* Align heap_ptr to 16 bytes.

### 2.3 Handling "Views" (Aliasing)

Sometimes a block reads a vec3 but only uses the y component.

- **The Optimization:** The compiler does not need to allocate new memory for a "Split" block. It simply passes the offsets\[1\] (the Y channel) of the source block to the consumer.

- **The Invariant:** Data is never copied unless modified.

## 3. The Runtime Refactor (ScheduleExecutor)

The JavaScript hot loop must be rewritten to respect SoA. This effectively turns the JS engine into a SIMD emulator.

### 3.1 The Loop Inversion

- **Old (AoS):** "For each instance i, execute all blocks."

  - *Why this dies:* Thrashing the instruction cache. Jumping between code for Add, Mul, Sin 10,000 times.

- **New (SoA):** "For each Block, execute for all instances i."

  - *Why this flies:* The JIT compiles the block logic *once*. The CPU pre-fetches the linear arrays (Channel X, Channel Y) into L1/L2 cache.

### 3.2 The Vector Math Logic

Since JS doesn't have operator overloading for float\[\], the runtime logic for a vec3 addition must be explicitly unrolled by the ScheduleWalker.

**The "Unrolled" Execution Plan:**

When the runtime encounters an Add(vec3, vec3) instruction:

1.  **Load Pointers:** Get ptrA_x, ptrA_y, ptrA_z, ptrB_x, etc. from the AddressTable.

2.  **Loop (Channel 0):** out_x\[i\] = A_x\[i\] + B_x\[i\] (for all i).

3.  **Loop (Channel 1):** out_y\[i\] = A_y\[i\] + B_y\[i\] (for all i).

4.  **Loop (Channel 2):** out_z\[i\] = A_z\[i\] + B_z\[i\] (for all i).

*Note:* While this looks verbose in JS, it is mathematically identical to what the GPU threads will do.

## 4. The Data Migration Strategy

How do we move existing data types into this strict f32 world?

### 4.1 Booleans and Flags

- **Storage:** Stored as f32 (0.0 or 1.0).

- **Why:** GPU bit-packing is expensive/complex in standard WGSL without bitwise extensions. f32 is "native" speed.

- **Logic:** Select(a, b, cond) becomes mix(a, b, cond).

### 4.2 Matrices (mat2, mat3, mat4)

- **Decomposition:** Matrices are treated as N column vectors.

  - mat2 -\> 2 columns -\> 4 components -\> 4 SoA Channels.

  - mat4 -\> 4 columns -\> 16 components -\> 16 SoA Channels.

- **Memory:** No special 4x4 blocks. Just 16 parallel float arrays.

### 4.3 Color

- **Storage:** 4 Channels (r, g, b, a).

- **Space:** Always linear f32 (0.0 - 1.0). No uint8 packing in the Arena. Packing only happens at the very last step (the Sink) if required by the texture format.

## 5. The "Shape Bank" Separation

The SoA Mandate strictly forbids "Pointer" or "Object" types in the Arena. This creates a problem for Geometry signals (e.g., Shape).

### 5.1 The Problem

A Shape is not a number. It's a topology (a list of connections).

### 5.2 The Solution: The Handle Pattern

The compiler must create a secondary memory bank: ShapeBank (Uint32Array).

1.  **CPU Logic:** When a Polygon block runs, it writes its vertex count and index offsets into the ShapeBank.

2.  **Arena Logic:** The Polygon block outputs a single f32 value into the Arena: the **Shape ID**.

3.  **Downstream:** A Deform block reads the **Shape ID** from the Arena, casts it to int, looks up the topology in the ShapeBank, and then processes the vertex positions from the Arena.

## 6. Verification & Debugging

How do we know "Phase 0" is working without a GPU?

### 6.1 The "Memory Dump" Test

- **Tool:** Create a visualizer that renders the Float32Array as a pixel grid (gray-scale).

- **Expectation:** You should see distinct "stripes" of data.

  - A sine wave LFO will look like a smooth gradient in the Scalar Zone.

  - A geometry field will look like repeating gradients in the Field Zone.

- **Failure State:** If you see "static" or "noise," your offsets are wrong, or you are reading uninitialized padding bytes.

### 6.2 The Regression Suite

Run the existing Golden Image tests.

- If the SoA refactor is correct, the output pixels of the Canvas2D renderer should be **identical** to the AoS version (within floating-point epsilon).

- *Note:* Any deviation implies a logic error in the "Unrolled" math loops.

## 7. Summary of Required Changes

1.  **Refactor ir/layout.ts:**

    - Remove stride property.

    - Add channelOffsets: number\[\].

    - Implement 16-byte alignment logic.

2.  **Refactor runtime/Arena.ts:**

    - Ensure it can resize dynamically while preserving alignment gaps.

3.  **Refactor runtime/ScheduleExecutor.ts:**

    - Delete the "Instance Inner Loop."

    - Implement "Block Inner Loop" (iterating over arrays).

4.  **Refactor blocks/\*.ts:**

    - Update every evaluate function to accept Float32Array pointers for inputs/outputs instead of objects.

This phase is the "Great Filter." If the application survives this refactor, the migration to WebGPU is effectively just "Changing the backend driver." The data is already ready.
