type GpuBufferSource = ArrayBuffer | SharedArrayBuffer | ArrayBufferView<ArrayBufferLike>;

export interface GpuBuffer {
  destroy(): void;
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
}

export interface GpuBindGroup {}

export interface GpuComputePipeline {
  getBindGroupLayout(index: number): unknown;
}

export interface GpuRenderPipeline {
  getBindGroupLayout(index: number): unknown;
}

export interface GpuTextureView {}

export interface GpuTexture {
  createView(): GpuTextureView;
  destroy(): void;
}

export interface GpuComputePassEncoder {
  setPipeline(pipeline: GpuComputePipeline): void;
  setBindGroup(index: number, bindGroup: GpuBindGroup): void;
  dispatchWorkgroups(x: number): void;
  end(): void;
}

export interface GpuRenderPassEncoder {
  setPipeline(pipeline: GpuRenderPipeline): void;
  setBindGroup(index: number, bindGroup: GpuBindGroup): void;
  setVertexBuffer(slot: number, buffer: GpuBuffer): void;
  setIndexBuffer(buffer: GpuBuffer, indexFormat: 'uint16' | 'uint32'): void;
  drawIndexedIndirect(indirectBuffer: GpuBuffer, indirectOffset: number): void;
  end(): void;
}

export interface GpuCommandEncoder {
  beginComputePass(): GpuComputePassEncoder;
  beginRenderPass(descriptor: unknown): GpuRenderPassEncoder;
  clearBuffer?(buffer: GpuBuffer, offset?: number, size?: number): void;
  copyBufferToBuffer(
    source: GpuBuffer,
    sourceOffset: number,
    destination: GpuBuffer,
    destinationOffset: number,
    size: number,
  ): void;
  finish(): unknown;
}

export interface GpuQueue {
  writeBuffer(
    buffer: GpuBuffer,
    bufferOffset: number,
    data: GpuBufferSource,
    dataOffset?: number,
    size?: number,
  ): void;
  submit(commandBuffers: readonly unknown[]): void;
  onSubmittedWorkDone?(): Promise<void>;
}

export interface GpuDevice {
  readonly queue: GpuQueue;
  readonly lost: Promise<{ reason: string; message: string }>;
  createBuffer(descriptor: {
    size: number;
    usage: number;
    mappedAtCreation?: boolean;
  }): GpuBuffer;
  createBindGroup(descriptor: {
    layout: unknown;
    entries: Array<{
      binding: number;
      resource: { buffer: GpuBuffer };
    }>;
  }): GpuBindGroup;
  createShaderModule(descriptor: { code: string }): unknown;
  createComputePipelineAsync(descriptor: unknown): Promise<GpuComputePipeline>;
  createRenderPipelineAsync(descriptor: unknown): Promise<GpuRenderPipeline>;
  createTexture(descriptor: unknown): GpuTexture;
  createCommandEncoder(): GpuCommandEncoder;
  addEventListener?(
    type: 'uncapturederror',
    listener: (event: { error?: { message?: string } }) => void,
  ): void;
}

export interface GpuCanvasContext {
  configure(descriptor: {
    device: GpuDevice;
    format: string;
    alphaMode: 'premultiplied';
  }): void;
  getCurrentTexture(): GpuTexture;
}

export interface GpuAdapter {
  readonly features: {
    values(): IterableIterator<string>;
  };
  requestDevice(): Promise<GpuDevice>;
}

export interface NavigatorWithGpu extends Navigator {
  readonly gpu?: GpuApi;
}

export interface GpuApi {
  requestAdapter(): Promise<GpuAdapter | null>;
  getPreferredCanvasFormat(): string;
}

export function getNavigatorGpu(): GpuApi | null {
  const gpu = (navigator as NavigatorWithGpu).gpu;
  return gpu ?? null;
}

export function toGpuCanvasContext(value: RenderingContext | null): GpuCanvasContext | null {
  if (!value) {
    return null;
  }
  const context = value as Partial<GpuCanvasContext>;
  if (typeof context.configure !== 'function' || typeof context.getCurrentTexture !== 'function') {
    return null;
  }
  return context as GpuCanvasContext;
}
