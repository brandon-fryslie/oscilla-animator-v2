import type { GpuBuffer, GpuCommandEncoder, GpuDevice } from './gpu-api';

// ── Constants ──────────────────────────────────────────────────────────

// WebGPU drawIndexedIndirect ABI: 5 u32 fields = 20 bytes
export const INDEXED_INDIRECT_STRIDE = 20;
export const INDEXED_INDIRECT_WORDS = 5;

// WebGPU drawIndirect ABI: 4 u32 fields = 16 bytes
export const NON_INDEXED_INDIRECT_STRIDE = 16;
export const NON_INDEXED_INDIRECT_WORDS = 4;

// ── Field offset enums ─────────────────────────────────────────────────

/** Indexed indirect command field offsets (u32 word index within one record) */
export const IndexedIndirectField = {
  IndexCount: 0,
  InstanceCount: 1,
  FirstIndex: 2,
  BaseVertex: 3, // i32
  FirstInstance: 4,
} as const;

/** Non-indexed indirect command field offsets */
export const NonIndexedIndirectField = {
  VertexCount: 0,
  InstanceCount: 1,
  FirstVertex: 2,
  FirstInstance: 3,
} as const;

// ── IndirectBufferConfig ───────────────────────────────────────────────

export interface IndirectBufferConfig {
  readonly maxIndexedRecords: number;
  readonly maxNonIndexedRecords: number;
}

export const DEFAULT_INDIRECT_BUFFER_CONFIG: IndirectBufferConfig = {
  maxIndexedRecords: 256,
  maxNonIndexedRecords: 256,
};

// ── IndirectBufferLayout ───────────────────────────────────────────────

export interface IndirectBufferLayout {
  readonly indexedRegionBaseBytes: number;
  readonly indexedRegionBytes: number;
  readonly nonIndexedRegionBaseBytes: number;
  readonly nonIndexedRegionBytes: number;
  readonly totalBytes: number;
}

export function computeIndirectBufferLayout(
  config: IndirectBufferConfig,
): IndirectBufferLayout {
  // [LAW:one-source-of-truth] Region offsets are computed from one canonical layout function.
  const indexedRegionBaseBytes = 0;
  const indexedRegionBytes =
    config.maxIndexedRecords * INDEXED_INDIRECT_STRIDE;
  const nonIndexedRegionBaseBytes = indexedRegionBytes;
  const nonIndexedRegionBytes =
    config.maxNonIndexedRecords * NON_INDEXED_INDIRECT_STRIDE;
  const totalBytes = indexedRegionBytes + nonIndexedRegionBytes;
  return {
    indexedRegionBaseBytes,
    indexedRegionBytes,
    nonIndexedRegionBaseBytes,
    nonIndexedRegionBytes,
    totalBytes,
  };
}

// ── IndirectBuffer ─────────────────────────────────────────────────────

export class IndirectBuffer {
  // [LAW:dataflow-not-control-flow] CPU never writes dynamic draw counts.
  // This buffer is populated by the Draw Prep compute shader on GPU.

  private readonly layout: IndirectBufferLayout;
  private gpuBuffer: GpuBuffer | null = null;

  constructor(
    private readonly config: IndirectBufferConfig = DEFAULT_INDIRECT_BUFFER_CONFIG,
  ) {
    this.layout = computeIndirectBufferLayout(config);
  }

  /** Get the computed layout (region offsets and sizes) */
  getLayout(): IndirectBufferLayout {
    return this.layout;
  }

  /** Get the GPU buffer. Throws if not yet created. */
  getGpuBuffer(): GpuBuffer {
    if (!this.gpuBuffer) {
      throw new Error(
        'IndirectBuffer: GPU buffer not created yet — call createGpuBuffer first',
      );
    }
    return this.gpuBuffer;
  }

  /**
   * Create the GPU buffer with STORAGE | INDIRECT | COPY_DST usage.
   * The buffer is written by Draw Prep compute shader (STORAGE) and
   * consumed by render pass indirect draw calls (INDIRECT).
   * COPY_DST enables clearBuffer for zeroing between frames.
   */
  createGpuBuffer(device: GpuDevice): GpuBuffer {
    if (this.gpuBuffer) {
      this.gpuBuffer.destroy();
    }
    // [LAW:one-source-of-truth] Buffer usage is STORAGE | INDIRECT | COPY_DST.
    // STORAGE: Draw Prep compute shader writes commands.
    // INDIRECT: Render pass consumes via drawIndexedIndirect/drawIndirect.
    // COPY_DST: Zero-fill between frames via encoder.clearBuffer.
    this.gpuBuffer = device.createBuffer({
      size: Math.max(4, this.layout.totalBytes), // WebGPU requires non-zero
      usage: 0x0080 | 0x0100 | 0x0008, // STORAGE | INDIRECT | COPY_DST
      mappedAtCreation: false,
    });
    return this.gpuBuffer;
  }

  /**
   * Compute the byte offset for an indexed indirect record.
   */
  indexedRecordOffset(recordIndex: number): number {
    if (recordIndex < 0 || recordIndex >= this.config.maxIndexedRecords) {
      throw new Error(
        `IndirectBuffer: indexed record index ${recordIndex} out of range (max=${this.config.maxIndexedRecords})`,
      );
    }
    return (
      this.layout.indexedRegionBaseBytes +
      recordIndex * INDEXED_INDIRECT_STRIDE
    );
  }

  /**
   * Compute the byte offset for a non-indexed indirect record.
   */
  nonIndexedRecordOffset(recordIndex: number): number {
    if (recordIndex < 0 || recordIndex >= this.config.maxNonIndexedRecords) {
      throw new Error(
        `IndirectBuffer: non-indexed record index ${recordIndex} out of range (max=${this.config.maxNonIndexedRecords})`,
      );
    }
    return (
      this.layout.nonIndexedRegionBaseBytes +
      recordIndex * NON_INDEXED_INDIRECT_STRIDE
    );
  }

  /**
   * Zero-fill the entire indirect buffer via command encoder.
   * Call this at the start of each frame before Draw Prep writes new commands.
   */
  clearAll(encoder: GpuCommandEncoder): void {
    const buffer = this.getGpuBuffer();
    // [LAW:dataflow-not-control-flow] Clear always executes — zero records
    // naturally produce zero draws via the indirect mechanism.
    encoder.clearBuffer(buffer, 0, this.layout.totalBytes);
  }

  /** Destroy the GPU buffer. */
  destroy(): void {
    this.gpuBuffer?.destroy();
    this.gpuBuffer = null;
  }
}

// ── Factory ────────────────────────────────────────────────────────────

export function createIndirectBuffer(
  config?: IndirectBufferConfig,
): IndirectBuffer {
  return new IndirectBuffer(config);
}
