import type { DrawPathInstancesOp, PathGeometry, RenderFrameIR } from '../types';
import { PathTessellator } from './PathTessellator';
import { PATH_RENDER_WGSL, SIMULATION_COMPUTE_WGSL } from './shaders';

const GPU_BUFFER_USAGE = {
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
} as const;

const INSTANCE_FLOATS = 12;
const MIN_INSTANCE_CAPACITY = 1024;
const SIMULATION_CAPACITY = 65_536;
const SIMULATION_WORKGROUP_SIZE = 64;

interface GPUMesh {
  readonly indexCount: number;
  readonly indexFormat: 'uint16' | 'uint32';
  readonly vertexBuffer: any;
  readonly indexBuffer: any;
}

interface RenderInput {
  readonly frame: RenderFrameIR;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly timeMs: number;
}

class WebGPUComputeRuntime {
  private readonly pipeline: any;
  private readonly paramsBuffer: any;
  private readonly stateBuffers: readonly [any, any];
  private readonly bindGroups: readonly [any, any];
  private readonly paramsStaging = new Float32Array(4);
  private activeStateIndex = 0;

  constructor(private readonly device: any) {
    const shaderModule = device.createShaderModule({ code: SIMULATION_COMPUTE_WGSL });
    this.pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'cs_main',
      },
    });

    this.stateBuffers = [
      device.createBuffer({
        size: SIMULATION_CAPACITY * 16,
        usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
      }),
      device.createBuffer({
        size: SIMULATION_CAPACITY * 16,
        usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
      }),
    ] as const;

    this.paramsBuffer = device.createBuffer({
      size: 16,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });

    const bindLayout = this.pipeline.getBindGroupLayout(0);
    this.bindGroups = [
      device.createBindGroup({
        layout: bindLayout,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[0] } },
          { binding: 1, resource: { buffer: this.stateBuffers[1] } },
          { binding: 2, resource: { buffer: this.paramsBuffer } },
        ],
      }),
      device.createBindGroup({
        layout: bindLayout,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[1] } },
          { binding: 1, resource: { buffer: this.stateBuffers[0] } },
          { binding: 2, resource: { buffer: this.paramsBuffer } },
        ],
      }),
    ] as const;
  }

  step(commandEncoder: any, activeCount: number, dtSeconds: number): void {
    const clampedCount = Math.max(0, Math.min(SIMULATION_CAPACITY, activeCount));
    const clampedDt = Math.max(0, Math.min(0.1, dtSeconds));

    this.paramsStaging[0] = clampedCount;
    this.paramsStaging[1] = clampedDt;
    this.paramsStaging[2] = 0.999; // Mild damping keeps default simulation stable.
    this.paramsStaging[3] = 0;
    this.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsStaging);

    // [LAW:dataflow-not-control-flow] Compute pass always executes.
    // Variability is encoded in activeCount/dt values, not whether the pass runs.
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroups[this.activeStateIndex]);
    const workgroups = Math.max(1, Math.ceil(clampedCount / SIMULATION_WORKGROUP_SIZE));
    pass.dispatchWorkgroups(workgroups);
    pass.end();
    this.activeStateIndex = this.activeStateIndex === 0 ? 1 : 0;
  }

  dispose(): void {
    this.paramsBuffer.destroy();
    this.stateBuffers[0].destroy();
    this.stateBuffers[1].destroy();
  }
}

/**
 * WebGPU renderer that consumes RenderFrameIR directly.
 */
export class WebGPURenderer {
  private readonly tessellator = new PathTessellator();
  private readonly meshCache = new Map<string, GPUMesh>();
  private readonly sceneUniforms = new Float32Array(8);
  private readonly computeRuntime: WebGPUComputeRuntime;
  private readonly adapterFeatures: ReadonlySet<string>;

  private readonly pathPipeline: any;
  private readonly sceneUniformBuffer: any;
  private readonly sceneBindGroup: any;

  private instanceBuffer: any;
  private instanceBindGroup: any;
  private instanceCapacity = 0;
  private instanceStaging = new Float32Array(0);

  private lastFrameTimeMs: number | null = null;
  private fatalError: Error | null = null;
  private lastConfiguredSize = { width: -1, height: -1 };

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: any,
    private readonly context: any,
    private readonly canvasFormat: string,
    adapterFeatures: ReadonlySet<string>
  ) {
    this.adapterFeatures = adapterFeatures;
    this.pathPipeline = this.createPathPipeline();

    this.sceneUniformBuffer = device.createBuffer({
      size: 32,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });

    this.sceneBindGroup = device.createBindGroup({
      layout: this.pathPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.sceneUniformBuffer } }],
    });

    this.instanceBuffer = device.createBuffer({
      size: MIN_INSTANCE_CAPACITY * INSTANCE_FLOATS * 4,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });
    this.instanceCapacity = MIN_INSTANCE_CAPACITY;
    this.instanceStaging = new Float32Array(this.instanceCapacity * INSTANCE_FLOATS);
    this.instanceBindGroup = device.createBindGroup({
      layout: this.pathPipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: this.instanceBuffer } }],
    });

    this.computeRuntime = new WebGPUComputeRuntime(this.device);

    void this.device.lost.then((lostInfo: { reason: string; message: string }) => {
      this.fatalError = new Error(
        `WebGPU device lost (${lostInfo.reason}): ${lostInfo.message}`
      );
    });

    // [LAW:single-enforcer] Renderer is the single boundary that captures GPU validation
    // failures and turns them into runtime-fatal errors.
    this.device.addEventListener?.('uncapturederror', (event: { error?: { message?: string } }) => {
      const message = event?.error?.message ?? 'Unknown WebGPU validation error';
      this.fatalError = new Error(`WebGPU uncaptured error: ${message}`);
    });
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
    const gpu = (navigator as Navigator & { gpu?: any }).gpu;
    if (!gpu) {
      throw new Error('WebGPU is required but navigator.gpu is unavailable');
    }

    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      throw new Error('WebGPU is required but no adapter was found');
    }

    // [LAW:dataflow-not-control-flow] Runtime uses one device request path across browsers.
    // Optional capabilities are detected from adapterFeatures and consumed as data flags.
    const device = await adapter.requestDevice();

    const context = canvas.getContext('webgpu') as any;
    if (!context) {
      throw new Error('WebGPU is required but canvas.getContext("webgpu") failed');
    }

    const format = gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: 'premultiplied',
    });

    return new WebGPURenderer(canvas, device, context, format, new Set(Array.from(adapter.features.values())));
  }

  render(input: RenderInput): void {
    if (this.fatalError) {
      throw this.fatalError;
    }

    this.assertFrameShape(input.frame);
    this.ensureCanvasConfiguration(input.width, input.height);
    this.writeSceneUniforms(input);

    const dtSeconds =
      this.lastFrameTimeMs === null
        ? 0
        : Math.max(0, Math.min(0.1, (input.timeMs - this.lastFrameTimeMs) / 1000));
    this.lastFrameTimeMs = input.timeMs;

    const commandEncoder = this.device.createCommandEncoder();
    this.computeRuntime.step(commandEncoder, 0, dtSeconds);

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    pass.setPipeline(this.pathPipeline);
    pass.setBindGroup(0, this.sceneBindGroup);

    for (const op of input.frame.ops) {
      if (op.kind !== 'drawPathInstances') {
        throw new Error(`WebGPURenderer: unsupported draw op kind "${(op as { kind: string }).kind}"`);
      }
      this.drawPathOp(pass, op);
    }

    pass.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  dispose(): void {
    this.computeRuntime.dispose();
    this.sceneUniformBuffer.destroy();
    this.instanceBuffer.destroy();
    for (const mesh of this.meshCache.values()) {
      mesh.vertexBuffer.destroy();
      mesh.indexBuffer.destroy();
    }
    this.meshCache.clear();
    this.tessellator.clear();
  }

  private assertFrameShape(frame: RenderFrameIR): void {
    if (frame.version !== 2) {
      throw new Error(`WebGPURenderer: unsupported frame version ${frame.version}`);
    }
  }

  private ensureCanvasConfiguration(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    // Keep the backing store in sync with layout dimensions.
    if (this.canvas.width !== width) {
      this.canvas.width = width;
    }
    if (this.canvas.height !== height) {
      this.canvas.height = height;
    }

    const resizeChanged =
      this.lastConfiguredSize.width !== width ||
      this.lastConfiguredSize.height !== height;
    if (!resizeChanged) {
      return;
    }

    this.context.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: 'premultiplied',
    });
    this.lastConfiguredSize.width = width;
    this.lastConfiguredSize.height = height;
  }

  private writeSceneUniforms(input: RenderInput): void {
    this.sceneUniforms[0] = input.width;
    this.sceneUniforms[1] = input.height;
    this.sceneUniforms[2] = input.panX;
    this.sceneUniforms[3] = input.panY;
    this.sceneUniforms[4] = input.zoom;
    this.sceneUniforms[5] = Math.min(input.width, input.height);
    this.sceneUniforms[6] = 0;
    this.sceneUniforms[7] = 0;
    this.device.queue.writeBuffer(this.sceneUniformBuffer, 0, this.sceneUniforms);
  }

  private drawPathOp(pass: any, op: DrawPathInstancesOp): void {
    const mesh = this.getOrCreateMesh(op.geometry);
    if (mesh.indexCount === 0) {
      return;
    }

    const instanceCount = this.packInstances(op);
    if (instanceCount === 0) {
      return;
    }

    const writeBytes = instanceCount * INSTANCE_FLOATS * 4;
    this.device.queue.writeBuffer(this.instanceBuffer, 0, this.instanceStaging.buffer, 0, writeBytes);

    pass.setBindGroup(1, this.instanceBindGroup);
    pass.setVertexBuffer(0, mesh.vertexBuffer);
    pass.setIndexBuffer(mesh.indexBuffer, mesh.indexFormat);
    pass.drawIndexed(mesh.indexCount, instanceCount, 0, 0, 0);
  }

  private getOrCreateMesh(geometry: PathGeometry): GPUMesh {
    const mesh = this.tessellator.getOrCreateMesh(geometry);
    const cached = this.meshCache.get(mesh.cacheKey);
    if (cached) {
      return cached;
    }

    const vertexBuffer = this.createUploadBuffer(mesh.vertexData, GPU_BUFFER_USAGE.VERTEX);
    const indexBuffer = this.createUploadBuffer(mesh.indexData, GPU_BUFFER_USAGE.INDEX);

    const gpuMesh: GPUMesh = {
      indexCount: mesh.indexData.length,
      indexFormat: mesh.indexFormat,
      vertexBuffer,
      indexBuffer,
    };
    this.meshCache.set(mesh.cacheKey, gpuMesh);
    return gpuMesh;
  }

  private createUploadBuffer(
    data: Float32Array | Uint16Array | Uint32Array,
    usage: number
  ): any {
    const safeSize = Math.max(4, data.byteLength);
    const buffer = this.device.createBuffer({
      size: safeSize,
      usage: usage | GPU_BUFFER_USAGE.COPY_DST,
      mappedAtCreation: data.byteLength > 0,
    });
    if (data.byteLength > 0) {
      const dst = new Uint8Array(buffer.getMappedRange());
      const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      dst.set(src);
      buffer.unmap();
    }
    return buffer;
  }

  private packInstances(op: DrawPathInstancesOp): number {
    const count = op.instances.count;
    if (count <= 0) {
      return 0;
    }

    const { position, size, rotation, scale2 } = op.instances;
    const { style } = op;
    const fill = style.fillColor;

    if (!(position instanceof Float32Array) || position.length !== count * 2) {
      throw new Error(`WebGPURenderer: position must be Float32Array(count*2), got ${position.length}`);
    }

    if (!(rotation instanceof Float32Array) || rotation.length !== count) {
      throw new Error(`WebGPURenderer: rotation must be Float32Array(count), got ${rotation.length}`);
    }

    if (!(scale2 instanceof Float32Array) || scale2.length !== count * 2) {
      throw new Error(`WebGPURenderer: scale2 must be Float32Array(count*2), got ${scale2.length}`);
    }

    if (style.strokeColor && style.strokeColor.length > 0) {
      throw new Error('WebGPURenderer: stroke rendering is not implemented yet');
    }

    if (!fill || !(fill instanceof Uint8ClampedArray) || fill.length === 0) {
      throw new Error('WebGPURenderer: fillColor must be provided as Uint8ClampedArray');
    }

    const fillRule = style.fillRule ?? 'nonzero';
    if (fillRule !== 'nonzero') {
      throw new Error(`WebGPURenderer: fillRule "${fillRule}" is not supported`);
    }

    const isUniformSize = typeof size === 'number';
    if (!isUniformSize && (!(size instanceof Float32Array) || size.length !== count)) {
      throw new Error('WebGPURenderer: size must be number or Float32Array(count)');
    }

    const isUniformColor = fill.length === 4;
    if (!isUniformColor && fill.length !== count * 4) {
      throw new Error('WebGPURenderer: fillColor must be length 4 or count*4');
    }

    this.ensureInstanceCapacity(count);

    for (let i = 0; i < count; i++) {
      const base = i * INSTANCE_FLOATS;
      this.instanceStaging[base] = position[i * 2];
      this.instanceStaging[base + 1] = position[i * 2 + 1];
      this.instanceStaging[base + 2] = isUniformSize ? (size as number) : (size as Float32Array)[i];
      this.instanceStaging[base + 3] = rotation[i];
      this.instanceStaging[base + 4] = scale2[i * 2];
      this.instanceStaging[base + 5] = scale2[i * 2 + 1];

      const colorOffset = isUniformColor ? 0 : i * 4;
      this.instanceStaging[base + 8] = fill[colorOffset] / 255;
      this.instanceStaging[base + 9] = fill[colorOffset + 1] / 255;
      this.instanceStaging[base + 10] = fill[colorOffset + 2] / 255;
      this.instanceStaging[base + 11] = fill[colorOffset + 3] / 255;
    }

    return count;
  }

  private ensureInstanceCapacity(requiredCount: number): void {
    if (requiredCount <= this.instanceCapacity) {
      return;
    }

    let nextCapacity = this.instanceCapacity;
    while (nextCapacity < requiredCount) {
      nextCapacity *= 2;
    }

    const nextBuffer = this.device.createBuffer({
      size: nextCapacity * INSTANCE_FLOATS * 4,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });

    this.instanceBuffer.destroy();
    this.instanceBuffer = nextBuffer;
    this.instanceCapacity = nextCapacity;
    this.instanceStaging = new Float32Array(this.instanceCapacity * INSTANCE_FLOATS);
    this.instanceBindGroup = this.device.createBindGroup({
      layout: this.pathPipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: this.instanceBuffer } }],
    });
  }

  private createPathPipeline(): any {
    const shaderModule = this.device.createShaderModule({ code: PATH_RENDER_WGSL });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 8,
            stepMode: 'vertex',
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.canvasFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
            writeMask: 0xf,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
      },
      multisample: {
        count: 1,
      },
    });
  }
}

export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  // [LAW:single-enforcer] Runtime rendering capability is enforced once at
  // WebGPU renderer creation. No backup renderer exists by design.
  return WebGPURenderer.create(canvas);
}
