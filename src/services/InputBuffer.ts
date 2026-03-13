/**
 * CPU → GPU Input Marshalling
 *
 * Fixed-schema 256-byte staging buffer that serializes per-frame CPU state
 * (time, mouse, audio, gauges) for GPU consumption via `device.queue.writeBuffer()`.
 *
 * Spec: docs/WebGPU-Complete/P3-1_CPU_to_GPU_Input_Marshalling.md
 *
 * [LAW:one-source-of-truth] InputBufferOffset is the single authority for field layout.
 * [LAW:no-shared-mutable-globals] Each runtime instance creates its own InputBuffer.
 * [LAW:dataflow-not-control-flow] All fields written every frame in fixed order — no conditional writes.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Total size of the input header block in bytes. */
export const INPUT_BUFFER_SIZE = 256;

/**
 * Byte offsets for each field in the 256-byte input header.
 * Matches the canonical schema in P3-1 exactly.
 */
export const InputBufferOffset = {
  Time: 0x00,
  DeltaTime: 0x04,
  FrameCount: 0x08,
  ResolutionX: 0x0c,
  ResolutionY: 0x10,
  MouseX: 0x14,
  MouseY: 0x18,
  MouseButtons: 0x1c,
  AudioLow: 0x20,
  AudioMid: 0x24,
  AudioHigh: 0x28,
  GaugeActive: 0x2c,
} as const;

// ─── Snapshot Interface ──────────────────────────────────────────────────────

/**
 * Plain-value snapshot of the frame's input state.
 * Produced by the frame loop; consumed by `InputBuffer.serialize()`.
 */
export interface InputSnapshot {
  readonly time: number; // seconds
  readonly deltaTime: number; // seconds
  readonly frameCount: number; // integer
  readonly resolutionX: number; // physical pixels
  readonly resolutionY: number; // physical pixels
  readonly mouseX: number; // normalized [-1, 1]
  readonly mouseY: number; // normalized [-1, 1]
  readonly mouseButtons: number; // bitmask: Left(1) | Right(2) | Middle(4)
  readonly audioLow: number; // [0, 1]
  readonly audioMid: number; // [0, 1]
  readonly audioHigh: number; // [0, 1]
  readonly gaugeActive: number; // 0.0 or 1.0
}

// ─── InputBuffer ─────────────────────────────────────────────────────────────

/**
 * Runtime-scoped staging buffer for CPU → GPU input marshalling.
 *
 * Owns a single reusable 256-byte ArrayBuffer and serializes an InputSnapshot
 * into it every frame. The frame loop then uploads the raw buffer to the GPU
 * arena header via `device.queue.writeBuffer(gpuBuffer, 0, inputBuffer.data, 0, INPUT_BUFFER_SIZE)`.
 */
export class InputBuffer {
  private readonly buffer: ArrayBuffer;
  private readonly view: DataView;

  constructor() {
    this.buffer = new ArrayBuffer(INPUT_BUFFER_SIZE);
    this.view = new DataView(this.buffer);
  }

  /**
   * Serialize a snapshot into the staging buffer.
   *
   * [LAW:dataflow-not-control-flow] All fields written unconditionally in fixed order.
   * Little-endian byte order (WebGPU convention).
   */
  serialize(snapshot: InputSnapshot): void {
    const v = this.view;
    v.setFloat32(InputBufferOffset.Time, snapshot.time, true);
    v.setFloat32(InputBufferOffset.DeltaTime, snapshot.deltaTime, true);
    v.setFloat32(InputBufferOffset.FrameCount, snapshot.frameCount, true);
    v.setFloat32(InputBufferOffset.ResolutionX, snapshot.resolutionX, true);
    v.setFloat32(InputBufferOffset.ResolutionY, snapshot.resolutionY, true);
    v.setFloat32(InputBufferOffset.MouseX, snapshot.mouseX, true);
    v.setFloat32(InputBufferOffset.MouseY, snapshot.mouseY, true);
    v.setUint32(InputBufferOffset.MouseButtons, snapshot.mouseButtons, true);
    v.setFloat32(InputBufferOffset.AudioLow, snapshot.audioLow, true);
    v.setFloat32(InputBufferOffset.AudioMid, snapshot.audioMid, true);
    v.setFloat32(InputBufferOffset.AudioHigh, snapshot.audioHigh, true);
    v.setFloat32(InputBufferOffset.GaugeActive, snapshot.gaugeActive, true);
  }

  /** Raw ArrayBuffer for zero-copy upload via `device.queue.writeBuffer()`. */
  get data(): ArrayBuffer {
    return this.buffer;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a new runtime-scoped InputBuffer.
 *
 * [LAW:no-shared-mutable-globals] Each runtime instance must own its own buffer.
 */
export function createInputBuffer(): InputBuffer {
  return new InputBuffer();
}
