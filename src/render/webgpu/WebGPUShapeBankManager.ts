import { WEBGPU_RENDER_CONTRACT } from './shaders';
import { iterateShapeBankRecords } from '../../runtime/RuntimeState';
import type { GpuBindGroup, GpuBuffer, GpuDevice, GpuRenderPipeline } from './gpu-api';
import { type GeometryRoute, classifyAllGeometryRoutes } from './ShapeBankGeometrySeam';

const GPU_BUFFER_USAGE = {
  COPY_DST: 0x0008,
  STORAGE: 0x0080,
} as const;

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
  private shapeBankBuffer: GpuBuffer;
  private shapeBankBindGroup: GpuBindGroup;
  private shapeBankCapacityWords = 1;
  private topologyWordOffsetById = new Map<number, number>();
  private geometryRoutes = new Map<number, GeometryRoute>();

  constructor(private readonly device: GpuDevice, private readonly pathPipeline: GpuRenderPipeline) {
    this.shapeBankBuffer = this.device.createBuffer({
      size: Uint32Array.BYTES_PER_ELEMENT,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
      mappedAtCreation: false,
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

  get bindGroup(): GpuBindGroup {
    return this.shapeBankBindGroup;
  }

  sync(source: RenderShapeBankSource): void {
    this.assertShapeBankSource(source);
    this.ensureShapeBankCapacity(Math.max(1, source.volatilePtr));
    this.uploadShapeBankData(source);
    this.topologyWordOffsetById = this.buildTopologyWordOffsetMap(source);
    // [LAW:one-source-of-truth] Geometry routes are derived from canonical
    // ShapeBank header data at sync time — same source as topology offsets.
    this.geometryRoutes = classifyAllGeometryRoutes(source);
  }

  resolveTopologyWordOffset(topologyId: number): number | undefined {
    return this.topologyWordOffsetById.get(topologyId);
  }

  /**
   * Resolve the geometry route for a shape at the given word offset.
   *
   * Returns the classified route (shapeBankDirect or legacy) or undefined
   * if no shape exists at that offset.
   */
  resolveGeometryRoute(shapeWordOffset: number): GeometryRoute | undefined {
    return this.geometryRoutes.get(shapeWordOffset);
  }

  /**
   * Get all classified geometry routes from the latest sync.
   */
  getGeometryRoutes(): ReadonlyMap<number, GeometryRoute> {
    return this.geometryRoutes;
  }

  dispose(): void {
    this.shapeBankBuffer.destroy();
  }

  private assertShapeBankSource(source: RenderShapeBankSource): void {
    this.assertShapeBankArrays(source);
    this.assertVolatilePtr(source.volatilePtr, source.data.length);
    this.assertTopologyCoverage(source.topologyIdByHandle.length, source.volatilePtr);
    this.assertStaticBoundary(source.staticBoundary, source.volatilePtr);
    for (const _record of iterateShapeBankRecords(source)) {
      // [LAW:single-enforcer] Shared ShapeBank record iteration is the one
      // validation boundary for variable-length record layout.
    }
  }

  private assertShapeBankArrays(source: RenderShapeBankSource): void {
    if (!(source.data instanceof Uint32Array)) {
      throw new Error('WebGPUShapeBankManager: shapeBank.data must be Uint32Array');
    }
    if (!(source.topologyIdByHandle instanceof Uint32Array)) {
      throw new Error('WebGPUShapeBankManager: shapeBank.topologyIdByHandle must be Uint32Array');
    }
  }

  private assertVolatilePtr(volatilePtr: number, capacity: number): void {
    const isValid = Number.isInteger(volatilePtr) && volatilePtr >= 0 && volatilePtr <= capacity;
    if (!isValid) {
      throw new Error(
        `WebGPUShapeBankManager: invalid volatilePtr ${volatilePtr} for capacity ${capacity}`,
      );
    }
  }

  private assertTopologyCoverage(topologyIdByHandleLength: number, volatilePtr: number): void {
    if (topologyIdByHandleLength < volatilePtr) {
      // [LAW:one-source-of-truth] ShapeBank sidecar/index stream must cover the
      // same handle address space as the canonical ShapeBank payload.
      throw new Error(
        `WebGPUShapeBankManager: topologyIdByHandle length ${topologyIdByHandleLength} is smaller than volatilePtr ${volatilePtr}`,
      );
    }
  }

  private assertStaticBoundary(staticBoundary: number, volatilePtr: number): void {
    const isValid = Number.isInteger(staticBoundary) && staticBoundary >= 0 && staticBoundary <= volatilePtr;
    if (!isValid) {
      throw new Error(
        `WebGPUShapeBankManager: invalid staticBoundary ${staticBoundary} for volatilePtr ${volatilePtr}`,
      );
    }
  }

  private ensureShapeBankCapacity(requiredWords: number): void {
    if (requiredWords > this.shapeBankCapacityWords) {
      let nextCapacity = this.shapeBankCapacityWords;
      while (nextCapacity < requiredWords) {
        nextCapacity *= 2;
      }
      const nextBuffer = this.device.createBuffer({
        size: nextCapacity * Uint32Array.BYTES_PER_ELEMENT,
        usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
        mappedAtCreation: false,
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
  }

  private uploadShapeBankData(source: RenderShapeBankSource): void {
    if (source.volatilePtr > 0) {
      const uploadSlice = source.data.subarray(0, source.volatilePtr);
      this.device.queue.writeBuffer(this.shapeBankBuffer, 0, uploadSlice, 0, uploadSlice.byteLength);
    }
  }

  private buildTopologyWordOffsetMap(source: RenderShapeBankSource): Map<number, number> {
    const byTopologyId = new Map<number, number>();
    for (const record of iterateShapeBankRecords(source)) {
      const topologyId = source.topologyIdByHandle[record.handle] >>> 0;
      if (!record.headerHasPayload && topologyId === 0) {
        continue;
      }
      if (!byTopologyId.has(topologyId)) {
        // [LAW:one-source-of-truth] Topology->GPU offset lookup is derived from
        // one canonical handle stream in RuntimeState.shapeBank.
        byTopologyId.set(topologyId, record.handle);
      }
    }
    return byTopologyId;
  }
}
