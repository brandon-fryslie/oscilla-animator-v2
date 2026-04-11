# WASM Boundary: Phase 2 Streaming Contract

**Status:** Draft (from Gemini design session)
**Prerequisite:** `WASM-Boundary-Spec.md` (Phase 1 manifest & roster)

Zero JSON serialization, zero object allocation, zero graph traversal during this phase. The boundary is a pure hardware bus.

External inputs (MIDI, OSC, audio, video, UI controls) have vastly different bandwidth requirements, so the Phase 2 update splits into **three high-speed avenues**.

---

## Type Aliases

```typescript
type StreamId = string;  // e.g., "audio:fft_01", "kinect:point_cloud"
```

---

# Avenue 1: The Float Bus (Low Bandwidth, High Frequency)

**Payload:** `Float32Array` written directly to shared WASM linear memory.
**Use Cases:** System time, mouse/pointer, MIDI CC knobs, OSC floats, UI sliders, CPU-evaluated LFOs.

Simple scalars or small vectors that change every frame. Declared in `MemoryManifest.globals` during Phase 1. JS writes to the exact offsets specified by `InstallReceipt.globalOffsetMap`.

```typescript
const frameData = new Float32Array(receipt.framePayloadLength);

function onFrame(time: number, dt: number) {
    // System
    frameData[receipt.globalOffsetMap["sys:time"]] = time;
    frameData[receipt.globalOffsetMap["sys:dt"]] = dt;
    frameData[receipt.globalOffsetMap["sys:pointer_x"]] = mouse.x;
    frameData[receipt.globalOffsetMap["sys:pointer_y"]] = mouse.y;

    // Hardware inputs (JS handles WebMIDI API / WebSockets, Rust just sees floats)
    frameData[receipt.globalOffsetMap["midi:cc_74"]] = midi.getFilterCutoff();
    frameData[receipt.globalOffsetMap["osc:track_vol"]] = osc.lastMessage.vol;

    // Camera matrices (JS calculates via gl-matrix, writes 16 floats)
    viewProjMatrix.copyTo(frameData, receipt.globalOffsetMap["sys:main_cam_vp"]);

    // Zero-allocation pointer pass
    wasm.Module.update_globals(frameData.buffer);
}
```

**Rust:** Takes the WASM memory pointer, executes `queue.write_buffer(uniform_buffer, 0, frameData)`. Microseconds.

---

# Avenue 2: The Data Stream (Medium Bandwidth, Array Data)

**Payload:** TypedArrays written to specific WASM memory pointers.
**Use Cases:** Audio FFT frequency bins, time-domain waveforms, Kinect point clouds, sensor arrays.

Array data cannot go through the Globals Uniform Buffer — it exceeds WebGPU uniform size limits and breaks alignment. Audio/sensor data streams into **Storage Buffers**.

## Manifest Extension

```typescript
interface MemoryManifest {
    // ... globals, arenaScalars, domains, textures, shapeBank, samplers ...

    // Data streams that JS pushes every frame into dedicated Storage Buffers
    dataStreams: Record<StreamId, DataStreamSpec>;
}

interface DataStreamSpec {
    type: 'f32' | 'u32';
    length: number;  // e.g., 1024 for FFT bins
}
```

## Install Receipt Extension

```typescript
interface InstallReceipt {
    // ... existing fields ...

    // Rust tells JS: "Write your 1024-float FFT array starting at this WASM memory offset"
    dataStreamOffsets: Record<StreamId, number>;
}
```

## JS Usage

```typescript
const fftArray = new Float32Array(1024);

function onAudioFrame() {
    audioContext.analyser.getFloatFrequencyData(fftArray);
    wasm.Module.update_data_stream("audio:fft_01", fftArray.buffer);
}
```

**Rust:** Maps `"audio:fft_01"` to a pre-allocated `wgpu::Buffer` (Usage: `STORAGE | COPY_DST`), queues a buffer write. In the Math IR, the compute shader reads this via `LoadField` using `global_invocation_id.x` to map particle index to frequency bin.

---

# Avenue 3: The Pixel Stream (High Bandwidth)

**Payload:** Opaque WebIDL references (`HTMLVideoElement`, `ImageBitmap`, `HTMLCanvasElement`).
**Use Cases:** Webcams, MP4 playback, Spout/Syphon (via external canvas injection).

DOM video elements cannot pass through WASM linear memory — they are complex browser objects. Reading video pixels into JS arrays and passing to Rust is catastrophically slow. Instead, we pass the JS object reference via `wasm-bindgen`, letting Rust's WebGPU backend talk directly to the browser's hardware-accelerated video decoder.

## Manifest Extension

```typescript
interface TextureSpec {
    // ... existing fields (dimension, width, height, format, usage) ...

    // If present, this texture is driven by an external DOM source.
    // Rust does NOT allocate it normally — it expects JS to push frames via
    // update_external_texture(). Rust uses queue.copyExternalImageToTexture().
    externalSource?: 'video' | 'canvas' | 'image_bitmap';
}
```

## JS Usage

```typescript
function onFrame() {
    if (videoElement.readyState >= 2) {
        // Pass the actual DOM element reference to WASM
        wasm.Module.update_external_texture("tex_webcam", videoElement);
    }
}
```

**Rust:** The `wasm-bindgen` export accepts a `web_sys::HtmlVideoElement`. Rust uses `queue.copyExternalImageToTexture()` to blast the video frame directly from the browser's GPU compositor into engine VRAM. Zero CPU pixel-copying.

---

# WASM Export Surface

The Rust WASM module exposes exactly three hot-path entry points. No other JS→WASM calls happen during Phase 2.

```rust
// Avenue 1: Scalar globals (uniform buffer)
#[wasm_bindgen]
pub fn update_globals(data: &[u8]);

// Avenue 2: Array data streams (storage buffers)
#[wasm_bindgen]
pub fn update_data_stream(stream_id: &str, data: &[u8]);

// Avenue 3: External video/canvas textures
#[wasm_bindgen]
pub fn update_external_texture(texture_id: &str, source: &web_sys::HtmlVideoElement);
```

After all updates are written, JS calls the render trigger:

```rust
// Executes the full roster: compute passes → system passes → render passes → submit
#[wasm_bindgen]
pub fn render_frame();
```

---

# How Avenue 2 Connects to the Math IR

Data streams are Storage Buffers, so compute shaders access them the same way they access domain fields. JS declares the stream in the manifest, then the AST references it:

```typescript
// In a ComputePassSpec's ast:
// Read frequency bin at this particle's index
{
    type: 'LoadField',
    symbolId: 'audio:fft_01',
    index: { type: 'Intrinsic', name: 'global_invocation_id.x' }
}
```

The JS compiler maps audio bins to particle lanes however it wants — 1:1, modulo-wrapped, interpolated. Rust doesn't know or care that it's audio data.
