This is the comprehensive technical specification for **The Runtime Loop: Input Marshalling (CPU \$\to\$ GPU)**.

This document defines the high-frequency data transfer protocol that occurs at the start of every frame. It details how the CPU captures user intent (Mouse, MIDI, Time) and serializes it into the GPU memory space with minimal latency and zero garbage collection overhead.

# The Runtime Loop: Input Marshalling

**Objective:** Synchronize the CPU's "User State" with the GPU's "Simulation State."

**Invariant:** Input data for Frame \$N\$ must be visible to the Compute Shader before dispatch.

**Mechanism:** A strictly typed ArrayBuffer write to a Staging Buffer, followed by a copyBufferToBuffer command to the Arena Header.

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

## 2. The Marshalling Infrastructure (InputService)

The InputService is a singleton that listens to DOM events and MIDI messages. It maintains the "Authoritative Input State."

### 2.1 The Staging Buffer

We do not create a new buffer every frame.

- **CPU Side:** private stagingView: DataView = new DataView(new ArrayBuffer(256));

- **GPU Side:** We allocate a dedicated staging_buffer (GPUBuffer, usage: COPY_SRC \| MAP_WRITE).

  - *Optimization:* Actually, using device.queue.writeBuffer is preferred for small updates (\< 1KB) over mapping/unmapping, as the driver handles the staging internally. We will use writeBuffer.

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

1.  **Test:** Create a patch where Mouse.X controls the color of the screen (Left=Black, Right=White).

2.  **Capture:** Use a high-speed camera (iPhone 240fps) to film the mouse click vs. the screen flash.

3.  **Expectation:** The change should be visible on the *very next* monitor refresh.

4.  **Failure:** If there is a 2-frame delay, it means we are writing to Arena_B (Write Buffer) instead of Arena_A (Read Buffer), causing the input to sit dormant until the *next* frame reads it.

**Critical Correction:**

- The Compute Shader reads from Arena_Read.

- Therefore, **Inputs must be uploaded to Arena_Read**.

- *Wait...* The Compute Shader treats Arena_Read as read_only. Can we update it?

- **Yes.** queue.writeBuffer works on buffers usage COPY_DST regardless of how they are bound in the current pass, as long as the write happens *before* the pass encoding.

## 6. Summary of Implementation

1.  **Class InputService:**

    - Maintains the ArrayBuffer(256).

    - Subscribes to mousemove, mousedown, keydown, WebMidi.

2.  **Update RuntimeContext:**

    - Add inputBuffer: ArrayBuffer to the context passed to the executor.

3.  **Update Arena:**

    - Ensure the first 256 bytes are strictly reserved for this header.

    - Ensure GPUBuffer usage includes COPY_DST.

4.  **Update writeBuffer Call:**

    - Inject the upload call at the very top of executeFrame.

This system ensures that when the user touches the screen, the physics engine feels it in the same millisecond.
