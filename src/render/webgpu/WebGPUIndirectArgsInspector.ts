import { WEBGPU_RENDER_CONTRACT } from './shaders';
import type { GpuBuffer, GpuDevice } from './gpu-api';

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
  private readbackBuffer: GpuBuffer | null = null;
  private readbackCapacityRecords = 0;

  constructor(private readonly device: GpuDevice) {}

  async readIndirectArgs(indirectArgsBuffer: GpuBuffer, recordCount: number): Promise<IndirectArgsReadbackSnapshot> {
    const safeRecordCount = Math.max(0, Math.floor(recordCount));
    const byteLength = safeRecordCount * WEBGPU_RENDER_CONTRACT.indirectArgsBytes;
    if (byteLength === 0) {
      return this.emptySnapshot();
    }

    const readbackBuffer = this.getOrCreateReadbackBuffer(safeRecordCount);
    const copiedBytes = await this.copyReadbackBytes(indirectArgsBuffer, readbackBuffer, byteLength);
    const records = this.decodeRecords(copiedBytes, safeRecordCount);

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

  private emptySnapshot(): IndirectArgsReadbackSnapshot {
    return {
      capturedAtMs: performance.now(),
      recordCount: 0,
      records: [],
    };
  }

  private getOrCreateReadbackBuffer(requiredRecords: number): GpuBuffer {
    this.ensureReadbackCapacity(requiredRecords);
    if (!this.readbackBuffer) {
      throw new Error('WebGPUIndirectArgsInspector: readback buffer is unavailable');
    }
    return this.readbackBuffer;
  }

  private async copyReadbackBytes(
    indirectArgsBuffer: GpuBuffer,
    readbackBuffer: GpuBuffer,
    byteLength: number,
  ): Promise<Uint8Array> {
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(indirectArgsBuffer, 0, readbackBuffer, 0, byteLength);
    this.device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPU_MAP_MODE.READ, 0, byteLength);
    const mappedRange = readbackBuffer.getMappedRange(0, byteLength);
    const copied = new Uint8Array(byteLength);
    copied.set(new Uint8Array(mappedRange));
    readbackBuffer.unmap();
    return copied;
  }

  private decodeRecords(bytes: Uint8Array, recordCount: number): IndirectArgsRecord[] {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);
    const records: IndirectArgsRecord[] = new Array(recordCount);
    for (let recordIndex = 0; recordIndex < recordCount; recordIndex++) {
      const base = recordIndex * WEBGPU_RENDER_CONTRACT.indirectArgsWords;
      records[recordIndex] = {
        indexCount: words[base + 0] >>> 0,
        instanceCount: words[base + 1] >>> 0,
        firstIndex: words[base + 2] >>> 0,
        baseVertex: words[base + 3] | 0,
        firstInstance: words[base + 4] >>> 0,
      };
    }
    return records;
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
      mappedAtCreation: false,
    });
    this.readbackBuffer?.destroy();
    this.readbackBuffer = nextBuffer;
    this.readbackCapacityRecords = nextCapacity;
  }
}
