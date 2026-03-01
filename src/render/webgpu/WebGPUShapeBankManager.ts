import { WEBGPU_RENDER_CONTRACT } from './shaders';

const GPU_BUFFER_USAGE = {
  COPY_DST: 0x0008,
  STORAGE: 0x0080,
} as const;

const SHAPE_BANK_HEADER_WORDS = 4;

export interface RenderShapeBankSource {
  readonly data: Uint32Array;
  readonly volatilePtr: number;
  readonly staticBoundary: number;
  readonly topologyIdByHandle: Uint32Array;
}

/**
 * Single owner for GPU-visible shape-bank state.
 *
 * [LAW:one-source-of-truth] Renderer shape metadata is sourced from runtime
 * ShapeBank only; no secondary topology registry export is used.
 */
export class WebGPUShapeBankManager {
  private shapeBankBuffer: any;
  private shapeBankBindGroup: any;
  private shapeBankCapacityWords = 1;
  private topologyWordOffsetById = new Map<number, number>();

  constructor(private readonly device: any, private readonly pathPipeline: any) {
    this.shapeBankBuffer = this.device.createBuffer({
      size: Uint32Array.BYTES_PER_ELEMENT,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });
    this.shapeBankBindGroup = this.device.createBindGroup({
      layout: this.pathPipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.topologyBankBindGroup),
      entries: [
        {
          binding: WEBGPU_RENDER_CONTRACT.topologyBankBinding,
          resource: { buffer: this.shapeBankBuffer },
        },
      ],
    });
  }

  get bindGroup(): any {
    return this.shapeBankBindGroup;
  }

  sync(source: RenderShapeBankSource): void {
    if (!(source.data instanceof Uint32Array)) {
      throw new Error('WebGPUShapeBankManager: shapeBank.data must be Uint32Array');
    }
    if (!(source.topologyIdByHandle instanceof Uint32Array)) {
      throw new Error('WebGPUShapeBankManager: shapeBank.topologyIdByHandle must be Uint32Array');
    }
    if (!Number.isInteger(source.volatilePtr) || source.volatilePtr < 0 || source.volatilePtr > source.data.length) {
      throw new Error(
        `WebGPUShapeBankManager: invalid volatilePtr ${source.volatilePtr} for capacity ${source.data.length}`,
      );
    }
    if (!Number.isInteger(source.staticBoundary) || source.staticBoundary < 0 || source.staticBoundary > source.volatilePtr) {
      throw new Error(
        `WebGPUShapeBankManager: invalid staticBoundary ${source.staticBoundary} for volatilePtr ${source.volatilePtr}`,
      );
    }
    if ((source.volatilePtr % SHAPE_BANK_HEADER_WORDS) !== 0) {
      throw new Error(
        `WebGPUShapeBankManager: shapeBank volatilePtr ${source.volatilePtr} is not aligned to ${SHAPE_BANK_HEADER_WORDS} words`,
      );
    }

    const requiredWords = Math.max(1, source.volatilePtr);
    if (requiredWords > this.shapeBankCapacityWords) {
      let nextCapacity = this.shapeBankCapacityWords;
      while (nextCapacity < requiredWords) {
        nextCapacity *= 2;
      }
      const nextBuffer = this.device.createBuffer({
        size: nextCapacity * Uint32Array.BYTES_PER_ELEMENT,
        usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
      });
      this.shapeBankBuffer.destroy();
      this.shapeBankBuffer = nextBuffer;
      this.shapeBankBindGroup = this.device.createBindGroup({
        layout: this.pathPipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.topologyBankBindGroup),
        entries: [
          {
            binding: WEBGPU_RENDER_CONTRACT.topologyBankBinding,
            resource: { buffer: this.shapeBankBuffer },
          },
        ],
      });
      this.shapeBankCapacityWords = nextCapacity;
    }

    if (source.volatilePtr > 0) {
      this.device.queue.writeBuffer(this.shapeBankBuffer, 0, source.data.subarray(0, source.volatilePtr));
    }
    this.topologyWordOffsetById = this.buildTopologyWordOffsetMap(source);
  }

  resolveTopologyWordOffset(topologyId: number): number | undefined {
    return this.topologyWordOffsetById.get(topologyId);
  }

  dispose(): void {
    this.shapeBankBuffer.destroy();
  }

  private buildTopologyWordOffsetMap(source: RenderShapeBankSource): Map<number, number> {
    const byTopologyId = new Map<number, number>();
    for (let handle = 0; handle + SHAPE_BANK_HEADER_WORDS <= source.volatilePtr; handle += SHAPE_BANK_HEADER_WORDS) {
      const topologyId = source.topologyIdByHandle[handle] >>> 0;
      const hasHeaderPayload =
        source.data[handle + 0] !== 0 ||
        source.data[handle + 1] !== 0 ||
        source.data[handle + 2] !== 0 ||
        source.data[handle + 3] !== 0;
      if (!hasHeaderPayload && topologyId === 0) {
        continue;
      }
      if (!byTopologyId.has(topologyId)) {
        // [LAW:one-source-of-truth] Topology->GPU offset lookup is derived from
        // one canonical handle stream in RuntimeState.shapeBank.
        byTopologyId.set(topologyId, handle);
      }
    }
    return byTopologyId;
  }
}
