> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/current/webgpu-specs/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Runtime Loop: Input Marshalling (CPU \$\to\$ GPU)**.

This document defines the high-frequency data transfer protocol that occurs at the start of every frame. It details how the CPU captures user intent (Mouse, MIDI, Time) and serializes it into the GPU memory space with minimal latency and zero garbage collection overhead.

# The Runtime Loop: Input Marshalling

## Related Contracts

- `docs/current/webgpu-specs/IMPLEMENTATION-INDEX.md`
- `docs/current/webgpu-specs/P1-1__Unified_GPU_Buffer_Strategy_Explained.md`
- `docs/current/webgpu-specs/P3-2_GPU_Compute_Dispatch_Explained.md`
- `docs/current/webgpu-specs/P3-5__Runtime_Loop__The_Swap_Explained.md`

**Objective:** Synchronize the CPU's "User State" with the GPU's "Simulation State."

**Invariant:** Input data for Frame \$N\$ must be visible to the Compute Shader before dispatch.

**Mechanism:** A strictly typed `ArrayBuffer` payload serialized on CPU and uploaded via `device.queue.writeBuffer(...)` to the arena header before compute dispatch.

## 1. The Data Schema (The "Uniform Block")

While we call them "Uniforms," in WebGPU v3.0, these values live in the **Header Zone** of the Storage Buffer (Arena). This allows the compute shader to read them as part of the arena_in array or via a struct view.

The schema is a fixed-size **256-byte** block. It is defined in TypeScript as a DataView over a pre-allocated ArrayBuffer.

| **Offset** | **Type** | **Name** | **Description** |
|----|----|----|----|
| **0x00** | f32 | Time | Global time (Seconds). Used for legacy blocks. |
| **0x04** | f32 | DeltaTime | **Critical.** The physics step size (\$dt\$). |
| **0x08** | f32 | FrameCount | Integer frame index (casted to float). |
| **0x0C** | f32 | Resolution.X | Canvas width (Physical pixels). |
| **0x10** | f32 | Resolution.Y | Canvas height (Physical pixels). |
| **0x14** | f32 | Mouse.X | Normalized Mouse X \$\[-1, 1\]\$. |
| **0x18** | f32 | Mouse.Y | Normalized Mouse Y \$\[-1, 1\]\$. |
| **0x1C** | u32 | Mouse.Buttons | Bitmask: Left(1), Right(2), Middle(4). |
| **0x20** | f32 | Audio.Low | FFT Energy: Bass (0-200Hz). |
| **0x24** | f32 | Audio.Mid | FFT Energy: Mids (200-2000Hz). |
| **0x28** | f32 | Audio.High | FFT Energy: Treble (2000Hz+). |
| **0x2C** | f32 | Gauge.Active | Bool (1.0/0.0) indicating hot-swap continuity mode. |
| **0x30...** | ... | Reserved | Padding for MIDI / Future inputs. |

## 2. The Marshalling Infrastructure (Runtime-Scoped Input Context)

Input ownership is runtime-scoped, not process-global.

// [LAW:no-shared-mutable-globals] Input state must be owned by the active runtime instance to support multi-runtime and deterministic tests.

A runtime instance owns:

- one input snapshot object
- one reusable 256-byte staging `ArrayBuffer`
- one serializer that writes canonical header fields in fixed order

### 2.1 The Staging Buffer

We do not create a new buffer every frame.

- **CPU Side:** `stagingView = new DataView(new ArrayBuffer(256))`.
- **GPU Side:** no persistent mapped staging buffer required for this payload size.
- **Upload Path:** `device.queue.writeBuffer(...)` (preferred for small writes).

### 2.2 The Serialization Loop

At the start of requestAnimationFrame:

TypeScript

update(dt: number) {\
const view = this.stagingView;\
\
// 1. Time\
view.setFloat32(0x00, performance.now() / 1000, true); // Little Endian\
view.setFloat32(0x04, dt / 1000, true);\
\
// 2. Mouse (Normalized to Aspect Ratio)\
// Converting screen pixels to World Space \[-1, 1\]\
const aspect = width / height;\
const ndcX = (mouseX / width) \* 2 - 1;\
const ndcY = (1 - (mouseY / height)) \* 2 - 1; // Flip Y\
view.setFloat32(0x14, ndcX \* aspect, true);\
view.setFloat32(0x18, ndcY, true);\
\
// 3. Audio (FFT)\
// Copy latest analysis data from AudioContext\
view.setFloat32(0x20, audioAnalyzer.getBass(), true);\
// ...\
}

## 3. The Transfer Mechanism (Upload)

This is the bridge between the JS heap and VRAM.

### 3.1 The writeBuffer Command

The runtime issues the upload command before any compute dispatch.

TypeScript

// RuntimeExecutor.ts\
\
// 1. Serialize Inputs\
inputService.update(dt);\
\
// 2. Upload to GPU\
// Target: The 'Header' zone of the CURRENT read buffer (Arena A or B)\
const targetBuffer = (frameIndex % 2 === 0) ? arenaA : arenaB;\
\
device.queue.writeBuffer(\
targetBuffer, // Dest\
0, // Dest Offset (Header starts at 0)\
inputService.data, // Source (ArrayBuffer)\
0, // Source Offset\
256 // Size (Bytes)\
);

### 3.2 Synchronization (Why this is safe)

queue.writeBuffer is conceptually asynchronous but **ordered** with respect to the command queue.

1.  CPU: writeBuffer(Inputs)

2.  CPU: computePass.dispatch()

3.  GPU Driver guarantees that **Operation 1** completes (or is visible to) **Operation 2**.

- *Note:* You do not need barriers for queue operations interacting with subsequent render/compute passes.

## 4. The MIDI Special Case (The Ring Buffer)

MIDI events are sparse but bursty. A single frame might have 0 events or 10 events (a chord). The fixed layout above works for "Continuous Control" (Knobs mapped to Audio.Low), but not for "Note On/Off."

### 4.1 The Event Queue

In addition to the fixed header, we reserve a u32 ring buffer in the Arena (e.g., offset 256 to 512) for MIDI events.

- **Protocol:**

  - CPU writes: \[EventCount, Note, Velocity, Note, Velocity...\]

  - Compute Shader iterates EventCount times.

  - *Application:* A "Voice Allocator" compute block reads these events and assigns them to available "Polyphony Lanes" in the Field.

### 4.2 Handling Overflows

If more events arrive than fit in the buffer (rare for 60fps), the CPU drops the oldest events (or newest, depending on policy).

- *Policy:* Drop oldest. Real-time responsiveness prefers the latest note.

## 5. Verification & Latency

### 5.1 The "Click-to-Photon" Test

How do we ensure the input isn't lagging by a frame?

1.  **Test:** Build an integration fixture where `Mouse.X` drives a thresholded full-screen color output.
2.  **Inject:** Programmatically update input snapshot at frame boundary `N` with timestamped marker.
3.  **Assert:** Frame `N` compute/render output reflects the new marker; failure at `N+1` indicates a one-frame input upload lag.
4.  **Diagnosis:** A one-frame lag usually indicates upload to `Arena_Write` instead of `Arena_Read` for the active frame.

**Critical Correction:**

- The Compute Shader reads from Arena_Read.

- Therefore, **Inputs must be uploaded to Arena_Read**.

- *Wait...* The Compute Shader treats Arena_Read as read_only. Can we update it?

- **Yes.** queue.writeBuffer works on buffers usage COPY_DST regardless of how they are bound in the current pass, as long as the write happens *before* the pass encoding.

## 6. Summary of Implementation

1.  **Runtime Input Context:**

    - Owns `ArrayBuffer(256)` + `DataView` serializer.

    - Receives device/user event snapshots from app boundary.

2.  **Update RuntimeContext:**

    - Add runtime-scoped input snapshot/payload to the frame executor context.

3.  **Update Arena:**

    - Ensure the first 256 bytes are strictly reserved for this header.

    - Ensure GPUBuffer usage includes COPY_DST.

4.  **Update writeBuffer Call:**

    - Inject the upload call at the very top of executeFrame.

This system ensures that when the user touches the screen, the physics engine feels it in the same millisecond.
