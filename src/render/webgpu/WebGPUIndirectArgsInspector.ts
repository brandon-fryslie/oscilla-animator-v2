import { WEBGPU_RENDER_CONTRACT } from './shaders';

const GPU_BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_DST: 0x0008,
} as const;

const GPU_MAP_MODE = {
  READ: 0x0001,
} as const;

export interface IndirectArgsRecord {
  readonly indexCount: number;
  readonly instanceCount: number;
  readonly firstIndex: number;
  readonly baseVertex: number;
  readonly firstInstance: number;
}

export interface IndirectArgsReadbackSnapshot {
  readonly capturedAtMs: number;
  readonly recordCount: number;
  readonly records: readonly IndirectArgsRecord[];
}

/**
 * Debug-only async inspector for indirect draw arguments.
 *
 * [LAW:single-enforcer] Indirect readback ownership is centralized here so all
 * debug consumers observe one canonical parse/serialization contract.
 */
export class WebGPUIndirectArgsInspector {
  private readbackBuffer: any | null = null;
  private readbackCapacityRecords = 0;

  constructor(private readonly device: any) {}

  async readIndirectArgs(indirectArgsBuffer: any, recordCount: number): Promise<IndirectArgsReadbackSnapshot> {
    const safeRecordCount = Math.max(0, Math.floor(recordCount));
    const byteLength = safeRecordCount * WEBGPU_RENDER_CONTRACT.indirectArgsBytes;
    if (byteLength === 0) {
      return {
        capturedAtMs: performance.now(),
        recordCount: 0,
        records: [],
      };
    }

    this.ensureReadbackCapacity(safeRecordCount);
    if (!this.readbackBuffer) {
      throw new Error('WebGPUIndirectArgsInspector: readback buffer is unavailable');
    }

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(indirectArgsBuffer, 0, this.readbackBuffer, 0, byteLength);
    this.device.queue.submit([encoder.finish()]);

    if (typeof this.readbackBuffer.mapAsync !== 'function') {
      throw new Error('WebGPUIndirectArgsInspector: readback buffer does not support mapAsync');
    }
    await this.readbackBuffer.mapAsync(GPU_MAP_MODE.READ, 0, byteLength);
    const mappedRange = this.readbackBuffer.getMappedRange(0, byteLength) as ArrayBuffer;
    const bytes = new Uint8Array(mappedRange);
    const copied = new Uint8Array(byteLength);
    copied.set(bytes);
    this.readbackBuffer.unmap();

    const words = new Uint32Array(copied.buffer, copied.byteOffset, copied.byteLength / Uint32Array.BYTES_PER_ELEMENT);
    const records: IndirectArgsRecord[] = new Array(safeRecordCount);
    for (let recordIndex = 0; recordIndex < safeRecordCount; recordIndex++) {
      const base = recordIndex * WEBGPU_RENDER_CONTRACT.indirectArgsWords;
      records[recordIndex] = {
        indexCount: words[base + 0] >>> 0,
        instanceCount: words[base + 1] >>> 0,
        firstIndex: words[base + 2] >>> 0,
        baseVertex: words[base + 3] | 0,
        firstInstance: words[base + 4] >>> 0,
      };
    }

    return {
      capturedAtMs: performance.now(),
      recordCount: safeRecordCount,
      records,
    };
  }

  dispose(): void {
    this.readbackBuffer?.destroy();
    this.readbackBuffer = null;
    this.readbackCapacityRecords = 0;
  }

  private ensureReadbackCapacity(requiredRecords: number): void {
    if (requiredRecords <= this.readbackCapacityRecords) {
      return;
    }
    let nextCapacity = Math.max(1, this.readbackCapacityRecords);
    while (nextCapacity < requiredRecords) {
      nextCapacity *= 2;
    }
    const nextBuffer = this.device.createBuffer({
      size: nextCapacity * WEBGPU_RENDER_CONTRACT.indirectArgsBytes,
      usage: GPU_BUFFER_USAGE.COPY_DST | GPU_BUFFER_USAGE.MAP_READ,
    });
    this.readbackBuffer?.destroy();
    this.readbackBuffer = nextBuffer;
    this.readbackCapacityRecords = nextCapacity;
  }
}
