import type { GpuBuffer, GpuDevice } from './gpu-api';

// ── Constants ──────────────────────────────────────────────────────────

export const SHAPE_HEADER_STRIDE = 16; // 16 u32 words = 64 bytes per shape
export const SHAPE_HEADER_BYTES = SHAPE_HEADER_STRIDE * 4; // 64 bytes

// ── ShapeHeaderField enum (u32 offset within a header) ─────────────────

export const ShapeHeaderField = {
  Kind: 0,
  TopologyMode: 1,
  Flags: 2,
  MaterialClass: 3,
  IndexCount: 4,
  FirstIndex: 5,
  BaseVertex: 6,
  VertexCount: 7,
  FirstVertex: 8,
  ParamBlockOffset: 9,
  ParamBlockWords: 10,
  Reserved0: 11,
  BoundsMinPacked: 12,
  BoundsMaxPacked: 13,
  Reserved1: 14,
  Reserved2: 15,
} as const;

// ── ShapeKind enum (header.kind discriminator) ──────────────────────────

export const ShapeKind = {
  Null: 0,
  RigidStamp: 1,
  ParametricCurve: 2,
  ContinuousRibbon: 3,
  ProceduralVolume: 4,
  TextGlyph: 5,
} as const;

// ── TopologyMode enum ──────────────────────────────────────────────────

export const TopologyMode = {
  Indexed: 0,
  NonIndexed: 1,
  Virtual: 2,
} as const;

// ── ShapeHeaderV1 ──────────────────────────────────────────────────────

export interface ShapeHeaderV1 {
  readonly kind: number;
  readonly topologyMode: number;
  readonly flags: number;
  readonly materialClass: number;
  readonly indexCount: number;
  readonly firstIndex: number;
  readonly baseVertex: number; // NOTE: this is i32 in WGSL but stored as u32 bit pattern
  readonly vertexCount: number;
  readonly firstVertex: number;
  readonly paramBlockOffset: number;
  readonly paramBlockWords: number;
  readonly boundsMinPacked: number;
  readonly boundsMaxPacked: number;
}

// ── ShapeBankConfig ────────────────────────────────────────────────────

export interface ShapeBankConfig {
  readonly maxShapes: number; // header capacity (e.g. 4096)
  readonly payloadWords: number; // payload heap capacity in u32 words
}

export const DEFAULT_SHAPE_BANK_CONFIG: ShapeBankConfig = {
  maxShapes: 4096,
  payloadWords: 65536,
};

// ── ShapeBank ──────────────────────────────────────────────────────────

export class ShapeBank {
  // [LAW:one-source-of-truth] ShapeBank is the ONE shape data authority.

  private readonly words: Uint32Array; // CPU-side staging
  private readonly config: ShapeBankConfig;
  private headerCount: number = 0; // next free header slot
  private payloadPtr: number; // next free word in payload heap

  constructor(config: ShapeBankConfig = DEFAULT_SHAPE_BANK_CONFIG) {
    this.config = config;
    const totalWords = config.maxShapes * SHAPE_HEADER_STRIDE + config.payloadWords;
    this.words = new Uint32Array(totalWords);
    this.payloadPtr = config.maxShapes * SHAPE_HEADER_STRIDE; // payload starts after headers
  }

  /** Total word count (headers + payload used so far) */
  get wordCount(): number {
    return this.payloadPtr;
  }

  /** Number of shapes allocated */
  get shapeCount(): number {
    return this.headerCount;
  }

  /** Read-only access to backing data for GPU upload */
  get data(): Uint32Array {
    return this.words;
  }

  /** Payload heap base offset (word index where payload starts) */
  get payloadBase(): number {
    return this.config.maxShapes * SHAPE_HEADER_STRIDE;
  }

  /**
   * Allocate a shape header. Returns the shape ID (header index).
   * Stack-based allocation — append only, no deallocation.
   */
  allocateShape(header: ShapeHeaderV1): number {
    if (this.headerCount >= this.config.maxShapes) {
      throw new Error(
        `ShapeBank: header capacity exceeded (max=${this.config.maxShapes})`,
      );
    }
    const shapeId = this.headerCount;
    const base = shapeId * SHAPE_HEADER_STRIDE;

    // [LAW:dataflow-not-control-flow] All 16 words written unconditionally
    this.words[base + ShapeHeaderField.Kind] = header.kind;
    this.words[base + ShapeHeaderField.TopologyMode] = header.topologyMode;
    this.words[base + ShapeHeaderField.Flags] = header.flags;
    this.words[base + ShapeHeaderField.MaterialClass] = header.materialClass;
    this.words[base + ShapeHeaderField.IndexCount] = header.indexCount;
    this.words[base + ShapeHeaderField.FirstIndex] = header.firstIndex;
    this.words[base + ShapeHeaderField.BaseVertex] = header.baseVertex >>> 0; // i32 → u32 bits
    this.words[base + ShapeHeaderField.VertexCount] = header.vertexCount;
    this.words[base + ShapeHeaderField.FirstVertex] = header.firstVertex;
    this.words[base + ShapeHeaderField.ParamBlockOffset] = header.paramBlockOffset;
    this.words[base + ShapeHeaderField.ParamBlockWords] = header.paramBlockWords;
    this.words[base + ShapeHeaderField.Reserved0] = 0;
    this.words[base + ShapeHeaderField.BoundsMinPacked] = header.boundsMinPacked;
    this.words[base + ShapeHeaderField.BoundsMaxPacked] = header.boundsMaxPacked;
    this.words[base + ShapeHeaderField.Reserved1] = 0;
    this.words[base + ShapeHeaderField.Reserved2] = 0;

    this.headerCount++;
    return shapeId;
  }

  /**
   * Read a shape header by ID.
   */
  readHeader(shapeId: number): ShapeHeaderV1 {
    if (shapeId < 0 || shapeId >= this.headerCount) {
      throw new Error(
        `ShapeBank: invalid shape ID ${shapeId} (allocated=${this.headerCount})`,
      );
    }
    const base = shapeId * SHAPE_HEADER_STRIDE;
    return {
      kind: this.words[base + ShapeHeaderField.Kind]!,
      topologyMode: this.words[base + ShapeHeaderField.TopologyMode]!,
      flags: this.words[base + ShapeHeaderField.Flags]!,
      materialClass: this.words[base + ShapeHeaderField.MaterialClass]!,
      indexCount: this.words[base + ShapeHeaderField.IndexCount]!,
      firstIndex: this.words[base + ShapeHeaderField.FirstIndex]!,
      baseVertex: this.words[base + ShapeHeaderField.BaseVertex]! | 0, // u32 → i32 reinterpret
      vertexCount: this.words[base + ShapeHeaderField.VertexCount]!,
      firstVertex: this.words[base + ShapeHeaderField.FirstVertex]!,
      paramBlockOffset: this.words[base + ShapeHeaderField.ParamBlockOffset]!,
      paramBlockWords: this.words[base + ShapeHeaderField.ParamBlockWords]!,
      boundsMinPacked: this.words[base + ShapeHeaderField.BoundsMinPacked]!,
      boundsMaxPacked: this.words[base + ShapeHeaderField.BoundsMaxPacked]!,
    };
  }

  /**
   * Allocate words in the payload heap. Returns the word offset.
   */
  allocatePayload(wordCount: number): number {
    const totalCapacity =
      this.config.maxShapes * SHAPE_HEADER_STRIDE + this.config.payloadWords;
    if (this.payloadPtr + wordCount > totalCapacity) {
      throw new Error(
        `ShapeBank: payload heap overflow (need=${wordCount}, remaining=${totalCapacity - this.payloadPtr})`,
      );
    }
    const offset = this.payloadPtr;
    this.payloadPtr += wordCount;
    return offset;
  }

  /**
   * Write payload data at a given word offset.
   */
  writePayload(offset: number, data: Uint32Array): void {
    if (offset + data.length > this.words.length) {
      throw new Error(`ShapeBank: payload write out of bounds`);
    }
    this.words.set(data, offset);
  }

  /**
   * Upload to GPU. Creates or resizes the GPU buffer as needed.
   */
  uploadToGpu(device: GpuDevice): GpuBuffer {
    const byteSize = this.payloadPtr * Uint32Array.BYTES_PER_ELEMENT;
    // [LAW:one-source-of-truth] Shape bank GPU buffer is STORAGE | COPY_DST.
    // It is read-only during render pass (immutable topology contract).
    const buffer = device.createBuffer({
      size: Math.max(4, byteSize), // WebGPU requires non-zero size
      usage: 0x0080 | 0x0008, // STORAGE | COPY_DST
      mappedAtCreation: false,
    });
    if (this.payloadPtr > 0) {
      const uploadSlice = this.words.subarray(0, this.payloadPtr);
      device.queue.writeBuffer(buffer, 0, uploadSlice, 0, uploadSlice.byteLength);
    }
    return buffer;
  }
}

// ── Bit-cast helpers ───────────────────────────────────────────────────

const f32Scratch = new Float32Array(1);
const u32Scratch = new Uint32Array(f32Scratch.buffer);

/** Bit-cast f32 to u32 (for storing float values in u32 shape bank) */
export function floatBitsToUint(value: number): number {
  f32Scratch[0] = value;
  return u32Scratch[0]!;
}

/** Bit-cast u32 to f32 (for reading float values from u32 shape bank) */
export function uintBitsToFloat(value: number): number {
  u32Scratch[0] = value;
  return f32Scratch[0]!;
}

// ── Factory ────────────────────────────────────────────────────────────

export function createShapeBank(config?: ShapeBankConfig): ShapeBank {
  return new ShapeBank(config);
}
