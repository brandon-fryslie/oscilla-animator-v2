This is the comprehensive technical specification for **The Unified Buffer Strategy: The "Arena" (Ping-Pong Storage)**.

This document defines the physical memory architecture of the GPU runtime. It describes how Oscilla v3.0 manages the massive, mutable state of the instrument without triggering race conditions in a parallel execution environment.

# The Unified Buffer Strategy: The "Arena"

**Objective:** Create a collision-free, massively parallel memory space for the entire graph state.

**Invariant:** Every bit of data that changes per frame lives here.

**Mechanism:** Double-Buffered "Ping-Pong" storage to enforce strict Read-Modify-Write safety.

## 1. The Physics of Ping-Pong

In a massive parallel environment (like a GPU with 10,000 threads), you cannot safely read and write to the same memory address simultaneously. If Thread A reads Position\[0\] while Thread B writes to it, the result is undefined (glitching).

To solve this, we allocate **two identical buffers**:

1.  **Arena_A** (Buffer ID: 0)

2.  **Arena_B** (Buffer ID: 1)

### 1.1 The Frame Cycle

The runtime maintains a parity bit: FrameIndex % 2.

- **Frame N (Even):**

  - **Input (Read-Only):** Arena_A is bound to @group(0) @binding(0).

  - **Output (Write-Only):** Arena_B is bound to @group(0) @binding(1).

  - *Logic:* Kernels read state from A, compute, and write new state to B.

- **Frame N+1 (Odd):**

  - **Input (Read-Only):** Arena_B is bound to @group(0) @binding(0).

  - **Output (Write-Only):** Arena_A is bound to @group(0) @binding(1).

  - *Logic:* Kernels read state from B, compute, and write new state to A.

### 1.2 The "Copy" Myth

We do **not** copy the entire buffer content from A to B at the end of the frame. That would be a waste of bandwidth. The "State" naturally migrates because the kernels explicitly write the result to the Output buffer every frame. If a value doesn't change, the kernel effectively copies it: out\[i\] = in\[i\].

## 2. The Anatomy of the Arena (Memory Map)

The Arena is a single contiguous f32 array (effectively a ByteAddressBuffer). However, it is rigorously partitioned into functional zones. The compiler hardcodes these offsets.

### Zone 1: The Global Header (Fixed Size: 256 Bytes)

- **Access:** Read-Only for Compute, Write-Only for CPU Upload.

- **Purpose:** The "Console" of the instrument.

- **Layout:**

  - 0x00 - 0x03: **Global Time** (f32, wrapped or raw).

  - 0x04 - 0x07: **Delta Time (\$dt\$)** (f32).

  - 0x08 - 0x0F: **Resolution** (vec2\<f32\>).

  - 0x10 - 0x17: **Mouse Position** (vec2\<f32\>).

  - 0x18 - 0x1F: **Mouse Buttons / Modifiers** (Bitmask as f32).

  - 0x20 - 0xFF: **Reserved** (Future expansion for MIDI/Audio FFT buckets).

### Zone 2: The Scalar Zone (Variable Size)

- **Access:** Random Access (Uniform-like).

- **Purpose:** Holds the output of all cardinality: one blocks (LFOs, Math, Envelopes).

- **Structure:** Tightly packed f32 values.

- **Padding:** Aligned to 16 bytes at the end of the zone.

- **Addressing:**

  - LFO_1_Out \$\rightarrow\$ Arena\[Offset_Scalar_Base + 0\]

  - Math_Add_2 \$\rightarrow\$ Arena\[Offset_Scalar_Base + 1\]

### Zone 3: The Field Zone (Variable Size - The "Bulk")

- **Access:** Coalesced Linear Access (SoA).

- **Purpose:** Holds the geometry, simulation data, and instance attributes.

- **Structure:** Channel-Separated Arrays.

- **Layout Example (1000 Particles):**

  - Offset_Field_Base + 0: **Position X** (1000 floats).

  - Offset_Field_Base + 4000: **Position Y** (1000 floats).

  - Offset_Field_Base + 8000: **Color R** (1000 floats).

  - *Note:* The gap between X and Y is exactly InstanceCount \* 4 bytes (padded to 256-byte alignment for optimal GPU caching).

### Zone 4: The State Zone (Variable Size)

- **Access:** Read (Previous) / Write (Next).

- **Purpose:** The memory for UnitDelay, Lag, Phasor, and Physics.

- **Critical Behavior:** This is the only zone where \$t-1\$ matters.

  - Kernel reads State\[i\] from **Input Buffer**.

  - Kernel calculates NewState.

  - Kernel writes NewState to **Output Buffer**.

### Zone 5: The Gauge Zone (Variable Size)

- **Access:** Read/Write.

- **Purpose:** Stores the "Continuity Offsets" used to smooth out hot-swap discontinuities.

- **Lifecycle:**

  - CPU calculates Gauge = Old_Val - New_Val on graph edit.

  - CPU uploads Gauge to this zone.

  - Compute Shader reads Gauge, decays it (Gauge \*= 0.9), and adds it to the output.

  - Compute Shader writes the decayed Gauge back to the Output Buffer.

## 3. Addressing & Alignment Rules

The GPU is picky about how it reads memory. We must adhere to **std430** layout rules, even though we are managing the bytes manually.

### 3.1 The "Lane" Concept

Every compute thread knows its GlobalInvocationID.x. We call this lane.

- **Scalar Read:** val = Arena\[Offset\] (The lane is ignored; all threads read the same address).

- **Field Read:** val = Arena\[Offset + lane\] (Each thread reads its neighbor).

### 3.2 Alignment Padding

- **Scalar-to-Field Transition:** The start of the Field Zone must be aligned to **256 bytes**. This ensures that the first field access is perfectly aligned with the GPU's memory bus width.

- **Field-to-Field Transition:** The start of *every* Field Channel (e.g., Position Y) should ideally be aligned to **256 bytes** (or at minimum 16 bytes).

  - *Implementation:* If InstanceCount is 100, the size is 400 bytes. We round up to 512 bytes (or 256 aligned) before starting the next channel. This wastes VRAM but maximizes bandwidth.

## 4. Expansion & Resizing (The "Realloc" Event)

What happens when the user increases InstanceCount from 1,000 to 1,000,000? The buffer is too small.

### 4.1 The Growth Strategy

We do not reallocate every frame. We use a **Geometric Growth** strategy (like std::vector).

1.  **Detection:** Compiler calculates RequiredSize.

2.  **Check:** If RequiredSize \> CurrentBufferSize:

3.  **Allocate:** Create New_Arena_A and New_Arena_B with size RequiredSize \* 1.5.

4.  **Migrate (The Hard Part):**

    - We cannot just discard the old data (the simulation would reset).

    - We issue a specialized **"Migration Compute Dispatch"**.

    - This shader reads from Old_Arena using the *Old Layout Offsets*.

    - It writes to New_Arena using the *New Layout Offsets*.

5.  **Destroy:** Release Old_Arena_A and Old_Arena_B.

6.  **Bind:** Update BindGroups to point to the new buffers.

### 4.2 The "Defrag" Strategy

When a user deletes a node, holes appear in the layout.

- **Phase 0:** We ignore it. The buffer keeps the holes (wasted VRAM).

- **Phase 1:** On the next Resize Event (growth), the compiler "compacts" the layout, removing the holes during the Migration copy.

## 5. Integration with the "Indirect" Buffer

The Arena stores the *data*, but it doesn't know *how much* data is valid to draw.

- **The Connection:** The Arena contains a Counter slot (usually in the Scalar Zone or a special Atomic counter at the end of the buffer).

- **The Flow:**

  1.  Compute Shader increments the Counter in the Arena while generating geometry.

  2.  "Draw Prep" Shader reads that Counter from the Arena.

  3.  "Draw Prep" writes that value into the instanceCount field of the **Indirect Command Buffer**.

  4.  Renderer draws.

This completes the memory loop. The Arena is the heart; the Indirect Buffer is the hand that draws.
