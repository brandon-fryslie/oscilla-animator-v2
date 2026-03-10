import type { DrawPathInstancesOp, PathGeometry, LegacyRenderFrame } from '../types';
import { PathTessellator } from './PathTessellator';
import { InputService } from './InputService';
import {
  DRAW_PREP_COMPUTE_WGSL,
  PATH_RENDER_WGSL,
  SIMULATION_COMPUTE_WGSL,
  SIMULATION_MIGRATION_COMPUTE_WGSL,
  WEBGPU_RENDER_CONTRACT,
} from './shaders';
import {
  WebGPUShapeBankManager,
  type RenderShapeBankSource,
} from './WebGPUShapeBankManager';
import {
  WebGPUIndirectArgsInspector,
  type IndirectArgsReadbackSnapshot,
} from './WebGPUIndirectArgsInspector';
import type {
  GpuBindGroup,
  GpuBuffer,
  GpuCanvasContext,
  GpuCommandEncoder,
  GpuComputePipeline,
  GpuDevice,
  GpuRenderPassEncoder,
  GpuRenderPipeline,
  GpuTexture,
  GpuTextureView,
} from './gpu-api';
import { getNavigatorGpu, toGpuCanvasContext } from './gpu-api';

const GPU_BUFFER_USAGE = {
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
} as const;

const GPU_TEXTURE_USAGE = {
  RENDER_ATTACHMENT: 0x0010,
} as const;

const INSTANCE_FLOATS = WEBGPU_RENDER_CONTRACT.instanceFloats;
const MIN_INSTANCE_CAPACITY = 1024;
const SIMULATION_WORKGROUP_SIZE = WEBGPU_RENDER_CONTRACT.computeWorkgroupSize;
const SIMULATION_MIGRATION_WORKGROUP_SIZE = WEBGPU_RENDER_CONTRACT.computeMigrationWorkgroupSize;
const DRAW_PREP_WORKGROUP_SIZE = WEBGPU_RENDER_CONTRACT.drawPrepWorkgroupSize;
const SIMULATION_STATE_BYTES = 16;

function alignTo4(value: number): number {
  const remainder = value % 4;
  return remainder === 0 ? value : value + (4 - remainder);
}

function computeDispatchWorkgroups(capacity: number, workgroupSize: number): number {
  // [LAW:single-enforcer] Dispatch geometry is computed once from canonical
  // capacity/workgroup constants, not ad-hoc at each callsite.
  return Math.max(1, Math.ceil(capacity / workgroupSize));
}

function growPowerOfTwoCapacity(current: number, required: number): number {
  let nextCapacity = current;
  while (nextCapacity < required) {
    nextCapacity *= 2;
  }
  return nextCapacity;
}

interface GPUMesh {
  readonly indexCount: number;
  readonly indexFormat: 'uint16' | 'uint32';
  readonly vertexBuffer: GpuBuffer;
  readonly indexBuffer: GpuBuffer;
}

interface RenderInput {
  readonly frame: LegacyRenderFrame;
  // [LAW:one-source-of-truth] WebGPU sink topology metadata enters via runtime
  // ShapeBank only; compile snapshots/aux payloads are forbidden here.
  readonly shapeBank: RenderShapeBankSource;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly timeMs: number;
  readonly inputMouseX: number;
  readonly inputMouseY: number;
  readonly inputMouseButtons: number;
  readonly inputAudioLow: number;
  readonly inputAudioMid: number;
  readonly inputAudioHigh: number;
  readonly inputGaugeActive: number;
}

interface PreparedDrawPathOp {
  readonly op: DrawPathInstancesOp;
  readonly mesh: GPUMesh;
  readonly shapeBankWordOffset: number;
  readonly sourceSinkIndex: number;
  readonly indirectRecordIndex: number;
  readonly firstInstance: number;
  readonly instanceCount: number;
  readonly pass: 'fill' | 'stroke';
}

interface DrawPrepStepInput {
  readonly indirectBuffer: GpuBuffer;
  readonly recordIndex: number;
  readonly maxRecords: number;
  readonly indexCount: number;
  readonly instanceCount: number;
  readonly firstInstance: number;
}

interface AppendDrawPassesInput {
  readonly prepared: PreparedDrawPathOp[];
  readonly op: DrawPathInstancesOp;
  readonly mesh: GPUMesh;
  readonly shapeBankWordOffset: number;
  readonly sourceSinkIndex: number;
  readonly nextFirstInstance: number;
}

interface InstancePackingPlan {
  readonly count: number;
  readonly position: Float32Array;
  readonly rotation: Float32Array;
  readonly scale2: Float32Array;
  readonly size: number | Float32Array;
  readonly activeColor: Uint8ClampedArray;
  readonly isUniformColor: boolean;
  readonly hasStroke: boolean;
  readonly strokeWidthSource: number | Float32Array | null;
  readonly renderPassKind: 'fill' | 'stroke';
  readonly shapeBankWordOffset: number;
}

interface PackedTransformFields {
  readonly posX: number;
  readonly posY: number;
  readonly sizeValue: number;
  readonly rotationValue: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly shapeBankWordOffset: number;
}

interface WebGPUStartupResources {
  readonly device: GpuDevice;
  readonly context: GpuCanvasContext;
  readonly canvasFormat: string;
  readonly adapterFeatures: ReadonlySet<string>;
}

export function assertWebGPUStartupContract(canvas: HTMLCanvasElement): void {
  const gpu = getNavigatorGpu();
  if (!gpu) {
    throw new Error('WebGPU is required but navigator.gpu is unavailable');
  }

  const context = toGpuCanvasContext(canvas.getContext('webgpu'));
  if (!context) {
    // [LAW:no-silent-fallbacks] WebGPU-only runtime must fail fast when the
    // browser cannot create a WebGPU presentation context.
    throw new Error('WebGPU is required but canvas.getContext("webgpu") failed');
  }
}

async function createStartupResources(canvas: HTMLCanvasElement): Promise<WebGPUStartupResources> {
  assertWebGPUStartupContract(canvas);
  const gpu = getNavigatorGpu();
  if (!gpu) {
    throw new Error('WebGPU is required but navigator.gpu is unavailable');
  }

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw new Error('WebGPU is required but no adapter was found');
  }

  // [LAW:dataflow-not-control-flow] Device allocation uses one request path
  // for all browsers; capability differences flow through adapter features.
  const device = await adapter.requestDevice();
  const context = toGpuCanvasContext(canvas.getContext('webgpu'));
  if (!context) {
    throw new Error('WebGPU is required but canvas.getContext("webgpu") failed');
  }
  const canvasFormat = gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: canvasFormat,
    alphaMode: 'premultiplied',
  });

  return {
    device,
    context,
    canvasFormat,
    adapterFeatures: new Set(Array.from(adapter.features.values())),
  };
}

class WebGPUComputeRuntime {
  private readonly pipeline: GpuComputePipeline;
  private readonly migrationPipeline: GpuComputePipeline;
  private readonly paramsBuffer: GpuBuffer;
  private readonly migrationParamsBuffer: GpuBuffer;
  private stateBuffers: [GpuBuffer, GpuBuffer];
  private bindGroups: [GpuBindGroup, GpuBindGroup];
  private stateCapacity: number;
  private readonly paramsStaging = new Float32Array(WEBGPU_RENDER_CONTRACT.computeParamsFloats);
  private readonly migrationParamsStaging = new Uint32Array(WEBGPU_RENDER_CONTRACT.computeMigrationParamsU32);
  private pendingRetiredStateBuffers: Array<[GpuBuffer, GpuBuffer]> = [];

  private constructor(private readonly device: GpuDevice, pipeline: GpuComputePipeline, migrationPipeline: GpuComputePipeline) {
    this.pipeline = pipeline;
    this.migrationPipeline = migrationPipeline;
    this.stateCapacity = WEBGPU_RENDER_CONTRACT.simulationCapacity;

    this.stateBuffers = [
      this.createStateBuffer(this.stateCapacity),
      this.createStateBuffer(this.stateCapacity),
    ];

    this.paramsBuffer = device.createBuffer({
      size: WEBGPU_RENDER_CONTRACT.computeParamsFloats * Float32Array.BYTES_PER_ELEMENT,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
      mappedAtCreation: false,
    });
    this.migrationParamsBuffer = device.createBuffer({
      size: WEBGPU_RENDER_CONTRACT.computeMigrationParamsU32 * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
      mappedAtCreation: false,
    });
    this.bindGroups = this.recreateBindGroups();

    // [LAW:single-enforcer] Compute runtime owns the src/dst safety contract.
    // src and dst buffers must never alias.
    if (this.stateBuffers[0] === this.stateBuffers[1]) {
      throw new Error('WebGPUComputeRuntime: src/dst state buffers must be distinct');
    }
  }

  // [LAW:single-enforcer] createComputePipelineAsync is the only permitted pipeline
  // creation path (P2-1: Async Compiler Service Architecture).
  static async create(device: GpuDevice): Promise<WebGPUComputeRuntime> {
    const [pipeline, migrationPipeline] = await Promise.all([
      device.createComputePipelineAsync({
        layout: 'auto',
        compute: {
          module: device.createShaderModule({ code: SIMULATION_COMPUTE_WGSL }),
          entryPoint: 'cs_main',
        },
      }),
      device.createComputePipelineAsync({
        layout: 'auto',
        compute: {
          module: device.createShaderModule({ code: SIMULATION_MIGRATION_COMPUTE_WGSL }),
          entryPoint: 'cs_main',
        },
      }),
    ]);
    return new WebGPUComputeRuntime(device, pipeline, migrationPipeline);
  }

  notifySubmittedWork(): void {
    if (this.pendingRetiredStateBuffers.length === 0) {
      return;
    }
    const retirements = this.pendingRetiredStateBuffers.splice(0);
    const destroyRetirements = (): void => {
      for (const [src, dst] of retirements) {
        src.destroy();
        dst.destroy();
      }
    };
    const queue = this.device.queue;
    void queue.onSubmittedWorkDone().then(destroyRetirements).catch(destroyRetirements);
  }

  step(
    commandEncoder: GpuCommandEncoder,
    activeCount: number,
    dtSeconds: number,
    inputHeader: Uint8Array,
    frameIndex: number,
  ): void {
    const requiredCount = Math.max(0, Math.ceil(activeCount));
    this.ensureStateCapacity(commandEncoder, requiredCount);
    const clampedCount = Math.min(requiredCount, this.stateCapacity);
    const clampedDt = Math.max(0, Math.min(0.1, dtSeconds));
    const readStateIndex = frameIndex & 1;

    this.device.queue.writeBuffer(
      this.stateBuffers[readStateIndex],
      0,
      inputHeader,
      0,
      WEBGPU_RENDER_CONTRACT.inputHeaderBytes,
    );

    this.paramsStaging[0] = clampedCount;
    this.paramsStaging[1] = clampedDt;
    this.paramsStaging[2] = 0.999; // Mild damping keeps default simulation stable.
    this.paramsStaging[3] = this.stateCapacity;
    this.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsStaging, 0, this.paramsStaging.byteLength);

    // [LAW:dataflow-not-control-flow] Compute pass always executes.
    // Variability is encoded in activeCount/dt values, not whether the pass runs.
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(WEBGPU_RENDER_CONTRACT.computeBindGroup, this.bindGroups[readStateIndex]);
    const workgroups = computeDispatchWorkgroups(this.stateCapacity, SIMULATION_WORKGROUP_SIZE);
    pass.dispatchWorkgroups(workgroups);
    pass.end();
  }

  dispose(): void {
    this.paramsBuffer.destroy();
    this.migrationParamsBuffer.destroy();
    this.stateBuffers[0].destroy();
    this.stateBuffers[1].destroy();
    for (const [src, dst] of this.pendingRetiredStateBuffers) {
      src.destroy();
      dst.destroy();
    }
    this.pendingRetiredStateBuffers = [];
  }

  private createStateBuffer(capacity: number): GpuBuffer {
    return this.device.createBuffer({
      size: WEBGPU_RENDER_CONTRACT.inputHeaderBytes + capacity * SIMULATION_STATE_BYTES,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST | GPU_BUFFER_USAGE.COPY_SRC,
      mappedAtCreation: false,
    });
  }

  private recreateBindGroups(): [GpuBindGroup, GpuBindGroup] {
    const bindLayout = this.pipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.computeBindGroup);
    return [
      this.device.createBindGroup({
        layout: bindLayout,
        entries: [
          {
            binding: WEBGPU_RENDER_CONTRACT.computeSrcStateBinding,
            resource: { buffer: this.stateBuffers[0] },
          },
          {
            binding: WEBGPU_RENDER_CONTRACT.computeDstStateBinding,
            resource: { buffer: this.stateBuffers[1] },
          },
          {
            binding: WEBGPU_RENDER_CONTRACT.computeParamsBinding,
            resource: { buffer: this.paramsBuffer },
          },
        ],
      }),
      this.device.createBindGroup({
        layout: bindLayout,
        entries: [
          {
            binding: WEBGPU_RENDER_CONTRACT.computeSrcStateBinding,
            resource: { buffer: this.stateBuffers[1] },
          },
          {
            binding: WEBGPU_RENDER_CONTRACT.computeDstStateBinding,
            resource: { buffer: this.stateBuffers[0] },
          },
          {
            binding: WEBGPU_RENDER_CONTRACT.computeParamsBinding,
            resource: { buffer: this.paramsBuffer },
          },
        ],
      }),
    ];
  }

  private ensureStateCapacity(commandEncoder: GpuCommandEncoder, requiredCount: number): void {
    if (requiredCount <= this.stateCapacity) {
      return;
    }
    const nextCapacity = growPowerOfTwoCapacity(this.stateCapacity, requiredCount);
    const nextBuffers = this.allocateGrownStateBuffers(commandEncoder, nextCapacity);
    const oldWordCount = this.computeStateWordCount(this.stateCapacity);
    this.writeMigrationParams(oldWordCount);
    this.migrateStateBuffers(commandEncoder, nextBuffers, oldWordCount);
    this.swapStateBuffers(nextBuffers, nextCapacity);
  }

  private allocateGrownStateBuffers(
    commandEncoder: GpuCommandEncoder,
    nextCapacity: number,
  ): [GpuBuffer, GpuBuffer] {
    const nextBuffers: [GpuBuffer, GpuBuffer] = [
      this.createStateBuffer(nextCapacity),
      this.createStateBuffer(nextCapacity),
    ];
    this.initializeGrownStateBuffers(commandEncoder, nextBuffers, nextCapacity);
    return nextBuffers;
  }

  private computeStateWordCount(capacity: number): number {
    return (
      (WEBGPU_RENDER_CONTRACT.inputHeaderBytes + capacity * SIMULATION_STATE_BYTES) /
      Uint32Array.BYTES_PER_ELEMENT
    );
  }

  private writeMigrationParams(oldWordCount: number): void {
    this.migrationParamsStaging[0] = oldWordCount >>> 0;
    this.migrationParamsStaging[1] = 0;
    this.migrationParamsStaging[2] = 0;
    this.migrationParamsStaging[3] = 0;
    this.device.queue.writeBuffer(
      this.migrationParamsBuffer,
      0,
      this.migrationParamsStaging,
      0,
      this.migrationParamsStaging.byteLength,
    );
  }

  private migrateStateBuffers(
    commandEncoder: GpuCommandEncoder,
    nextBuffers: readonly [GpuBuffer, GpuBuffer],
    oldWordCount: number,
  ): void {
    const migrationBindLayout = this.migrationPipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.computeMigrationBindGroup);
    const migrationPass = commandEncoder.beginComputePass();
    migrationPass.setPipeline(this.migrationPipeline);
    for (let i = 0; i < 2; i++) {
      const migrationBindGroup = this.createMigrationBindGroup(migrationBindLayout, this.stateBuffers[i], nextBuffers[i]);
      migrationPass.setBindGroup(WEBGPU_RENDER_CONTRACT.computeMigrationBindGroup, migrationBindGroup);
      migrationPass.dispatchWorkgroups(computeDispatchWorkgroups(oldWordCount, SIMULATION_MIGRATION_WORKGROUP_SIZE));
    }
    migrationPass.end();
  }

  private createMigrationBindGroup(layout: ReturnType<GpuComputePipeline['getBindGroupLayout']>, src: GpuBuffer, dst: GpuBuffer): GpuBindGroup {
    return this.device.createBindGroup({
      layout,
      entries: [
        {
          binding: WEBGPU_RENDER_CONTRACT.computeMigrationSrcBinding,
          resource: { buffer: src },
        },
        {
          binding: WEBGPU_RENDER_CONTRACT.computeMigrationDstBinding,
          resource: { buffer: dst },
        },
        {
          binding: WEBGPU_RENDER_CONTRACT.computeMigrationParamsBinding,
          resource: { buffer: this.migrationParamsBuffer },
        },
      ],
    });
  }

  private swapStateBuffers(nextBuffers: [GpuBuffer, GpuBuffer], nextCapacity: number): void {
    const retired = this.stateBuffers;
    this.stateBuffers = nextBuffers;
    this.stateCapacity = nextCapacity;
    this.bindGroups = this.recreateBindGroups();
    // [LAW:dataflow-not-control-flow] Growth migration always follows one fixed
    // sequence: allocate -> migrate -> swap -> retire.
    this.pendingRetiredStateBuffers.push(retired);
  }

  private initializeGrownStateBuffers(
    commandEncoder: GpuCommandEncoder,
    buffers: readonly [GpuBuffer, GpuBuffer],
    capacity: number,
  ): void {
    const totalBytes = WEBGPU_RENDER_CONTRACT.inputHeaderBytes + capacity * SIMULATION_STATE_BYTES;
    for (const buffer of buffers) {
      // [LAW:dataflow-not-control-flow] Newly allocated lanes are always
      // initialized via one fixed operation sequence before migration reads.
      commandEncoder.clearBuffer(buffer, 0, totalBytes);
    }
  }
}

class WebGPUDrawPrepRuntime {
  private pipeline: GpuComputePipeline;
  private readonly paramsBuffer: GpuBuffer;
  private readonly paramsStaging = new Uint32Array(WEBGPU_RENDER_CONTRACT.drawPrepParamsU32);
  private activeBindGroup: GpuBindGroup | null = null;
  private activeIndirectBuffer: GpuBuffer | null = null;

  private constructor(private readonly device: GpuDevice, initialPipeline: GpuComputePipeline) {
    this.pipeline = initialPipeline;
    this.paramsBuffer = device.createBuffer({
      size: WEBGPU_RENDER_CONTRACT.drawPrepParamsU32 * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
      mappedAtCreation: false,
    });
  }

  // [LAW:single-enforcer] createComputePipelineAsync is the only permitted pipeline
  // creation path (P2-1: Async Compiler Service Architecture).
  static async create(device: GpuDevice): Promise<WebGPUDrawPrepRuntime> {
    const shaderModule = device.createShaderModule({ code: DRAW_PREP_COMPUTE_WGSL });
    const pipeline = await device.createComputePipelineAsync({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'cs_main',
      },
    });
    return new WebGPUDrawPrepRuntime(device, pipeline);
  }

  private getOrCreateBindGroup(indirectBuffer: GpuBuffer): GpuBindGroup {
    if (this.activeBindGroup && this.activeIndirectBuffer === indirectBuffer) {
      return this.activeBindGroup;
    }

    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.drawPrepBindGroup),
      entries: [
        {
          binding: WEBGPU_RENDER_CONTRACT.drawPrepIndirectBinding,
          resource: { buffer: indirectBuffer },
        },
        {
          binding: WEBGPU_RENDER_CONTRACT.drawPrepParamsBinding,
          resource: { buffer: this.paramsBuffer },
        },
      ],
    });
    this.activeBindGroup = bindGroup;
    this.activeIndirectBuffer = indirectBuffer;
    return bindGroup;
  }

  step(
    commandEncoder: GpuCommandEncoder,
    input: DrawPrepStepInput,
  ): void {
    this.paramsStaging[0] = input.indexCount >>> 0;
    this.paramsStaging[1] = input.instanceCount >>> 0;
    this.paramsStaging[2] = 0; // firstIndex
    this.paramsStaging[3] = 0; // baseVertex
    this.paramsStaging[4] = input.firstInstance >>> 0;
    this.paramsStaging[5] = input.recordIndex >>> 0;
    this.paramsStaging[6] = input.maxRecords >>> 0;
    this.paramsStaging[7] = 0;
    this.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsStaging, 0, this.paramsStaging.byteLength);

    const bindGroup = this.getOrCreateBindGroup(input.indirectBuffer);

    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(WEBGPU_RENDER_CONTRACT.drawPrepBindGroup, bindGroup);
    pass.dispatchWorkgroups(DRAW_PREP_WORKGROUP_SIZE);
    pass.end();
  }

  dispose(): void {
    this.paramsBuffer.destroy();
  }
}

/**
 * WebGPU renderer that consumes LegacyRenderFrame directly.
 */
export class WebGPURenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly device: GpuDevice;
  private readonly context: GpuCanvasContext;
  private readonly canvasFormat: string;
  private readonly tessellator = new PathTessellator();
  private readonly inputService = new InputService();
  private readonly meshCache = new Map<string, GPUMesh>();
  private readonly sceneUniforms = new Float32Array(WEBGPU_RENDER_CONTRACT.sceneUniformFloats);
  private readonly computeRuntime: WebGPUComputeRuntime;
  private readonly drawPrepRuntime: WebGPUDrawPrepRuntime;
  private readonly adapterFeatures: ReadonlySet<string>;

  private readonly pathPipeline: GpuRenderPipeline;
  private readonly sceneUniformBuffer: GpuBuffer;
  private readonly sceneBindGroup: GpuBindGroup;
  private readonly shapeBankManager: WebGPUShapeBankManager;
  private readonly indirectArgsInspector: WebGPUIndirectArgsInspector;
  private indirectArgsBuffer: GpuBuffer;
  private indirectArgsCapacityRecords = 1;

  private instanceBuffer: GpuBuffer;
  private instanceBindGroup: GpuBindGroup;
  private instanceCapacity = 0;
  private instanceStaging = new Float32Array(0);

  private lastFrameTimeMs: number | null = null;
  // [LAW:one-source-of-truth] Renderer-owned frameIndex is the canonical swap
  // parity source for compute read/write role selection.
  private frameIndex = 0;
  private fatalError: Error | null = null;
  private lastConfiguredSize = { width: -1, height: -1 };
  private msaaColorTexture: GpuTexture | null = null;
  private msaaColorView: GpuTextureView | null = null;

  private constructor(args: {
    readonly canvas: HTMLCanvasElement;
    readonly device: GpuDevice;
    readonly context: GpuCanvasContext;
    readonly canvasFormat: string;
    readonly adapterFeatures: ReadonlySet<string>;
    readonly computeRuntime: WebGPUComputeRuntime;
    readonly drawPrepRuntime: WebGPUDrawPrepRuntime;
    readonly pathPipeline: GpuRenderPipeline;
  }) {
    this.canvas = args.canvas;
    this.device = args.device;
    this.context = args.context;
    this.canvasFormat = args.canvasFormat;
    const { adapterFeatures, computeRuntime, drawPrepRuntime, pathPipeline } = args;
    this.adapterFeatures = adapterFeatures;
    this.computeRuntime = computeRuntime;
    this.drawPrepRuntime = drawPrepRuntime;
    this.pathPipeline = pathPipeline;

    this.sceneUniformBuffer = this.device.createBuffer({
      size: WEBGPU_RENDER_CONTRACT.sceneUniformBytes,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
      mappedAtCreation: false,
    });

    this.sceneBindGroup = this.device.createBindGroup({
      layout: this.pathPipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.sceneBindGroup),
      entries: [
        {
          binding: WEBGPU_RENDER_CONTRACT.sceneBinding,
          resource: { buffer: this.sceneUniformBuffer },
        },
      ],
    });
    this.indirectArgsBuffer = this.device.createBuffer({
      size: WEBGPU_RENDER_CONTRACT.indirectArgsBytes,
      usage:
        GPU_BUFFER_USAGE.STORAGE |
        GPU_BUFFER_USAGE.INDIRECT |
        GPU_BUFFER_USAGE.COPY_DST |
        GPU_BUFFER_USAGE.COPY_SRC,
      mappedAtCreation: false,
    });
    this.shapeBankManager = new WebGPUShapeBankManager(this.device, this.pathPipeline);
    this.indirectArgsInspector = new WebGPUIndirectArgsInspector(this.device);

    this.instanceBuffer = this.device.createBuffer({
      size: MIN_INSTANCE_CAPACITY * INSTANCE_FLOATS * 4,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
      mappedAtCreation: false,
    });
    this.instanceCapacity = MIN_INSTANCE_CAPACITY;
    this.instanceStaging = new Float32Array(this.instanceCapacity * INSTANCE_FLOATS);
    this.instanceBindGroup = this.device.createBindGroup({
      layout: this.pathPipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.instanceBindGroup),
      entries: [
        {
          binding: WEBGPU_RENDER_CONTRACT.instanceBinding,
          resource: { buffer: this.instanceBuffer },
        },
      ],
    });

    void this.device.lost.then((lostInfo: { reason: string; message: string }) => {
      this.fatalError = new Error(
        `WebGPU device lost (${lostInfo.reason}): ${lostInfo.message}`
      );
    });

    // [LAW:single-enforcer] Renderer is the single boundary that captures GPU validation
    // failures and turns them into runtime-fatal errors.
    this.device.addEventListener('uncapturederror', (event: { error: { message: string } }) => {
      const message = event.error.message || 'Unknown WebGPU validation error';
      this.fatalError = new Error(`WebGPU uncaptured error: ${message}`);
    });
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
    const startup = await createStartupResources(canvas);
    const { device, context, canvasFormat, adapterFeatures } = startup;
    // [LAW:single-enforcer] All pipeline creation uses the async path (P2-1).
    const [computeRuntime, drawPrepRuntime, pathPipeline] = await Promise.all([
      WebGPUComputeRuntime.create(device),
      WebGPUDrawPrepRuntime.create(device),
      WebGPURenderer.createPathPipelineAsync(device, canvasFormat),
    ]);
    return new WebGPURenderer({
      canvas,
      device,
      context,
      canvasFormat,
      adapterFeatures,
      computeRuntime,
      drawPrepRuntime,
      pathPipeline,
    });
  }

  render(input: RenderInput): void {
    if (this.fatalError) {
      throw this.fatalError;
    }

    this.assertRenderInputContract(input);
    this.ensureCanvasConfiguration(input.width, input.height);
    this.shapeBankManager.sync(input.shapeBank);
    this.writeSceneUniforms(input);
    const drawPlan = this.buildDrawPlan(input.frame);

    const dtSeconds =
      this.lastFrameTimeMs === null
        ? 0
        : Math.max(0, Math.min(0.1, (input.timeMs - this.lastFrameTimeMs) / 1000));
    this.lastFrameTimeMs = input.timeMs;

    const commandEncoder = this.device.createCommandEncoder();
    const frameIndex = this.frameIndex;
    const simulationInstanceCount = this.countSimulationInstances(drawPlan);
    const frameInputHeader = this.buildFrameInputHeader(input, dtSeconds, frameIndex);
    this.computeRuntime.step(commandEncoder, simulationInstanceCount, dtSeconds, frameInputHeader, frameIndex);
    // [LAW:single-enforcer] createInstancePackingPlan validates per-op instance
    // transform arrays before any capacity growth is allowed.
    const packedInstances = this.packDrawPlanInstances(drawPlan);
    this.uploadPackedInstances(packedInstances);
    this.ensureIndirectArgsCapacity(drawPlan.length);
    this.runDrawPrepPasses(commandEncoder, drawPlan);

    const currentTextureView = this.context.getCurrentTexture().createView();
    const colorAttachmentView = this.msaaColorView ?? currentTextureView;
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: colorAttachmentView,
          resolveTarget: this.msaaColorView ? currentTextureView : undefined,
          loadOp: 'clear',
          storeOp: this.msaaColorView ? 'discard' : 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });

    pass.setPipeline(this.pathPipeline);
    pass.setBindGroup(WEBGPU_RENDER_CONTRACT.sceneBindGroup, this.sceneBindGroup);
    pass.setBindGroup(WEBGPU_RENDER_CONTRACT.topologyBankBindGroup, this.shapeBankManager.bindGroup);
    // [LAW:single-enforcer] Instance storage binding is stable for the entire
    // render pass, so the pass setup is the single bind authority.
    pass.setBindGroup(WEBGPU_RENDER_CONTRACT.instanceBindGroup, this.instanceBindGroup);

    for (const prepared of drawPlan) {
      this.drawPreparedPathOp(pass, prepared);
    }

    pass.end();
    this.device.queue.submit([commandEncoder.finish()]);
    this.computeRuntime.notifySubmittedWork();
    this.frameIndex += 1;
  }

  private buildFrameInputHeader(input: RenderInput, dtSeconds: number, frameIndex: number): Uint8Array {
    return this.inputService.marshal({
      timeSeconds: input.timeMs / 1000,
      deltaTimeSeconds: dtSeconds,
      frameCount: frameIndex,
      width: input.width,
      height: input.height,
      mouseX: input.inputMouseX,
      mouseY: input.inputMouseY,
      mouseButtons: input.inputMouseButtons,
      audioLow: input.inputAudioLow,
      audioMid: input.inputAudioMid,
      audioHigh: input.inputAudioHigh,
      gaugeActive: input.inputGaugeActive,
    });
  }

  private uploadPackedInstances(packedInstances: number): void {
    if (packedInstances <= 0) {
      return;
    }
    this.device.queue.writeBuffer(
      this.instanceBuffer,
      0,
      this.instanceStaging.buffer,
      0,
      packedInstances * WEBGPU_RENDER_CONTRACT.instanceBytes
    );
  }

  private runDrawPrepPasses(
    commandEncoder: GpuCommandEncoder,
    drawPlan: readonly PreparedDrawPathOp[],
  ): void {
    for (const prepared of drawPlan) {
      this.drawPrepRuntime.step(commandEncoder, {
        indirectBuffer: this.indirectArgsBuffer,
        recordIndex: prepared.indirectRecordIndex,
        maxRecords: this.indirectArgsCapacityRecords,
        indexCount: prepared.mesh.indexCount,
        instanceCount: prepared.instanceCount,
        firstInstance: prepared.firstInstance,
      });
    }
  }

  async readIndirectArgsDebugView(maxRecords: number = this.indirectArgsCapacityRecords): Promise<IndirectArgsReadbackSnapshot> {
    const safeRecords = Math.max(0, Math.min(this.indirectArgsCapacityRecords, Math.floor(maxRecords)));
    return this.indirectArgsInspector.readIndirectArgs(this.indirectArgsBuffer, safeRecords);
  }

  dispose(): void {
    this.computeRuntime.dispose();
    this.drawPrepRuntime.dispose();
    this.destroyMsaaColorTarget();
    this.sceneUniformBuffer.destroy();
    this.indirectArgsBuffer.destroy();
    this.shapeBankManager.dispose();
    this.indirectArgsInspector.dispose();
    this.instanceBuffer.destroy();
    for (const mesh of this.meshCache.values()) {
      mesh.vertexBuffer.destroy();
      mesh.indexBuffer.destroy();
    }
    this.meshCache.clear();
    this.tessellator.clear();
  }

  private assertRenderInputContract(input: RenderInput): void {
    const { frame, shapeBank, width, height, zoom, panX, panY, timeMs } = input;
    // [LAW:no-string-math] Lowering-authored WGSL source injection is forbidden.
    // Renderer contract rejects legacy draw-prep WGSL payloads at the sink boundary.
    if (Object.prototype.hasOwnProperty.call(input, 'drawPrepShaderWgsl')) {
      throw new Error('WebGPURenderer: drawPrepShaderWgsl override is forbidden in P0');
    }
    if (Object.prototype.hasOwnProperty.call(input, 'topologyRegistrySnapshot')) {
      throw new Error('WebGPURenderer: topology registry snapshot payloads are forbidden in P0');
    }
    if (frame.version !== 2) {
      throw new Error(`WebGPURenderer: unsupported frame version ${frame.version}`);
    }
    this.assertShapeBankContract(shapeBank);
    this.assertViewportContract(input);
    this.assertSignalInputContract(input);
  }

  private assertShapeBankContract(shapeBank: RenderShapeBankSource): void {
    if (!shapeBank) {
      throw new Error('WebGPURenderer: render input must provide shapeBank');
    }
    if (!(shapeBank.data instanceof Uint32Array)) {
      throw new Error('WebGPURenderer: shapeBank.data must be Uint32Array');
    }
    if (!(shapeBank.topologyIdByHandle instanceof Uint32Array)) {
      throw new Error('WebGPURenderer: shapeBank.topologyIdByHandle must be Uint32Array');
    }
    if (!Number.isInteger(shapeBank.volatilePtr) || shapeBank.volatilePtr < 0) {
      throw new Error(`WebGPURenderer: shapeBank.volatilePtr must be a non-negative integer, got ${shapeBank.volatilePtr}`);
    }
    if (!Number.isInteger(shapeBank.staticBoundary) || shapeBank.staticBoundary < 0) {
      throw new Error(
        `WebGPURenderer: shapeBank.staticBoundary must be a non-negative integer, got ${shapeBank.staticBoundary}`,
      );
    }
  }

  private assertViewportContract(input: RenderInput): void {
    const { width, height, zoom, panX, panY, timeMs } = input;
    if (!Number.isFinite(width) || width < 0) {
      throw new Error(`WebGPURenderer: width must be a finite non-negative number, got ${width}`);
    }
    if (!Number.isFinite(height) || height < 0) {
      throw new Error(`WebGPURenderer: height must be a finite non-negative number, got ${height}`);
    }
    if (!Number.isFinite(zoom) || zoom <= 0) {
      throw new Error(`WebGPURenderer: zoom must be a finite positive number, got ${zoom}`);
    }
    if (!Number.isFinite(panX) || !Number.isFinite(panY)) {
      throw new Error(`WebGPURenderer: pan must be finite numbers, got (${panX}, ${panY})`);
    }
    if (!Number.isFinite(timeMs)) {
      throw new Error(`WebGPURenderer: timeMs must be finite, got ${timeMs}`);
    }
  }

  private assertSignalInputContract(input: RenderInput): void {
    const requiredInputFields = [
      ['inputMouseX', input.inputMouseX],
      ['inputMouseY', input.inputMouseY],
      ['inputMouseButtons', input.inputMouseButtons],
      ['inputAudioLow', input.inputAudioLow],
      ['inputAudioMid', input.inputAudioMid],
      ['inputAudioHigh', input.inputAudioHigh],
      ['inputGaugeActive', input.inputGaugeActive],
    ] as const;
    for (const [name, value] of requiredInputFields) {
      if (!Number.isFinite(value)) {
        throw new Error(`WebGPURenderer: ${name} must be finite, got ${value}`);
      }
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
    this.recreateMsaaColorTarget(width, height);
    this.lastConfiguredSize.width = width;
    this.lastConfiguredSize.height = height;
  }

  private recreateMsaaColorTarget(width: number, height: number): void {
    this.destroyMsaaColorTarget();
    this.msaaColorTexture = this.device.createTexture({
      size: {
        width: Math.max(1, Math.floor(width)),
        height: Math.max(1, Math.floor(height)),
      },
      sampleCount: WEBGPU_RENDER_CONTRACT.renderMsaaSampleCount,
      format: this.canvasFormat,
      usage: GPU_TEXTURE_USAGE.RENDER_ATTACHMENT,
    });
    this.msaaColorView = this.msaaColorTexture.createView();
  }

  private destroyMsaaColorTarget(): void {
    this.msaaColorTexture?.destroy();
    this.msaaColorTexture = null;
    this.msaaColorView = null;
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
    this.device.queue.writeBuffer(this.sceneUniformBuffer, 0, this.sceneUniforms, 0, this.sceneUniforms.byteLength);
  }

  private buildDrawPlan(frame: LegacyRenderFrame): PreparedDrawPathOp[] {
    const prepared: PreparedDrawPathOp[] = [];
    let nextFirstInstance = 0;
    let nextSourceSinkIndex = 0;
    for (const op of frame.ops) {
      if (op.kind !== 'drawPathInstances') {
        throw new Error(`WebGPURenderer: unsupported draw op kind "${(op as { kind: string }).kind}"`);
      }
      // [LAW:one-source-of-truth] sinkIndex is defined by compiler render-step
      // order, so runtime mapping advances once per source op even when no
      // draw record is emitted (zero instances/empty mesh).
      const sourceSinkIndex = nextSourceSinkIndex++;
      const mesh = this.getOrCreateMesh(op.geometry);
      if (mesh.indexCount === 0 || op.instances.count <= 0) {
        continue;
      }
      const shapeBankWordOffset = this.shapeBankManager.resolveTopologyWordOffset(op.geometry.topologyId);
      // [LAW:one-source-of-truth] Render topology lookup is resolved from the
      // canonical runtime shape-bank upload, not registry-side exports.
      if (shapeBankWordOffset === undefined) {
        throw new Error(`WebGPURenderer: topology ${op.geometry.topologyId} missing from shape bank`);
      }
      nextFirstInstance = this.appendDrawPassesForOp({
        prepared,
        op,
        mesh,
        shapeBankWordOffset,
        sourceSinkIndex,
        nextFirstInstance,
      });
    }
    return prepared;
  }

  private appendDrawPassesForOp(input: AppendDrawPassesInput): number {
    const { prepared, op, mesh, shapeBankWordOffset, sourceSinkIndex } = input;
    let nextFirstInstance = input.nextFirstInstance;
    const passes = this.resolveRenderPasses(op.style);
    // [LAW:dataflow-not-control-flow] Draw planning uses one canonical pass
    // order; fill/stroke variability is encoded in pass data, not alternate pipelines.
    for (const pass of passes) {
      prepared.push({
        op,
        mesh,
        shapeBankWordOffset,
        sourceSinkIndex,
        indirectRecordIndex: prepared.length,
        firstInstance: nextFirstInstance,
        instanceCount: op.instances.count,
        pass,
      });
      nextFirstInstance += op.instances.count;
    }
    return nextFirstInstance;
  }

  private resolveRenderPasses(style: DrawPathInstancesOp['style']): readonly ('fill' | 'stroke')[] {
    const hasFill = Boolean(style.fillColor && style.fillColor.length > 0);
    const hasStroke = Boolean(style.strokeColor && style.strokeColor.length > 0);
    if (!hasFill && !hasStroke) {
      throw new Error('WebGPURenderer: drawPathInstances op must provide fillColor and/or strokeColor');
    }
    if (hasFill && hasStroke) {
      return ['fill', 'stroke'];
    }
    return hasFill ? ['fill'] : ['stroke'];
  }

  private drawPreparedPathOp(pass: GpuRenderPassEncoder, prepared: PreparedDrawPathOp): void {
    pass.setVertexBuffer(0, prepared.mesh.vertexBuffer);
    pass.setIndexBuffer(prepared.mesh.indexBuffer, prepared.mesh.indexFormat);
    pass.drawIndexedIndirect(
      this.indirectArgsBuffer,
      prepared.indirectRecordIndex * WEBGPU_RENDER_CONTRACT.indirectArgsBytes,
    );
  }

  private countSimulationInstances(drawPlan: readonly PreparedDrawPathOp[]): number {
    let total = 0;
    const seenOps = new Set<DrawPathInstancesOp>();
    // [LAW:one-source-of-truth] Simulation cardinality is derived from unique
    // draw ops, so fill/stroke pass expansion does not double-count instances.
    for (const prepared of drawPlan) {
      if (seenOps.has(prepared.op)) {
        continue;
      }
      seenOps.add(prepared.op);
      total += prepared.instanceCount;
    }
    return total;
  }

  private packDrawPlanInstances(drawPlan: readonly PreparedDrawPathOp[]): number {
    let packedInstances = 0;
    // [LAW:dataflow-not-control-flow] Every prepared draw pass runs through one
    // deterministic packing stage; pass variance is represented as input data.
    for (const prepared of drawPlan) {
      const written = this.packInstances(
        prepared.op,
        prepared.shapeBankWordOffset,
        prepared.pass,
        prepared.firstInstance
      );
      if (written !== prepared.instanceCount) {
        throw new Error(
          `WebGPURenderer: packed ${written} instances but plan expected ${prepared.instanceCount}`
        );
      }
      packedInstances = Math.max(packedInstances, prepared.firstInstance + written);
    }
    return packedInstances;
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
  ): GpuBuffer {
    // [LAW:no-silent-fallbacks] mappedAtCreation buffers must be 4-byte aligned;
    // enforce the WebGPU contract deterministically at allocation time.
    const safeSize = Math.max(4, alignTo4(data.byteLength));
    const buffer = this.device.createBuffer({
      size: safeSize,
      usage: usage | GPU_BUFFER_USAGE.COPY_DST,
      mappedAtCreation: data.byteLength > 0,
    });
    if (data.byteLength > 0) {
      const dst = new Uint8Array(buffer.getMappedRange(0, safeSize));
      const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      dst.set(src);
      buffer.unmap();
    }
    return buffer;
  }

  private packInstances(
    op: DrawPathInstancesOp,
    shapeBankWordOffset: number,
    renderPassKind: 'fill' | 'stroke',
    firstInstance: number,
  ): number {
    if (op.instances.count <= 0) {
      return 0;
    }
    const plan = this.createInstancePackingPlan(op, shapeBankWordOffset, renderPassKind);
    this.ensureInstanceCapacity(firstInstance + plan.count);
    for (let i = 0; i < plan.count; i++) {
      this.writePackedInstance(plan, firstInstance, i);
    }
    return plan.count;
  }

  private createInstancePackingPlan(
    op: DrawPathInstancesOp,
    shapeBankWordOffset: number,
    renderPassKind: 'fill' | 'stroke',
  ): InstancePackingPlan {
    const count = op.instances.count;
    const { position, rotation, scale2 } = this.assertInstanceTransformArrays(op.instances, count);
    const { activeColor, isUniformColor, hasStroke } = this.resolvePassColor(op.style, renderPassKind, count);
    this.assertFillRuleSupport(op.style.fillColor, op.style.fillRule);
    const size = this.resolveInstanceSizeSource(op.instances.size, count);
    const strokeWidthSource = this.resolveStrokeWidthSource(op.style.strokeWidth, hasStroke, count);

    return {
      count,
      position,
      rotation,
      scale2,
      size,
      activeColor,
      isUniformColor,
      hasStroke,
      strokeWidthSource,
      renderPassKind,
      shapeBankWordOffset,
    };
  }

  private assertInstanceTransformArrays(
    instances: DrawPathInstancesOp['instances'],
    count: number,
  ): Pick<InstancePackingPlan, 'position' | 'rotation' | 'scale2'> {
    const { position, rotation, scale2 } = instances;
    if (!(position instanceof Float32Array) || position.length !== count * 2) {
      throw new Error(`WebGPURenderer: position must be Float32Array(count*2), got ${position.length}`);
    }
    if (!(rotation instanceof Float32Array) || rotation.length !== count) {
      throw new Error(`WebGPURenderer: rotation must be Float32Array(count), got ${rotation.length}`);
    }
    if (!(scale2 instanceof Float32Array) || scale2.length !== count * 2) {
      throw new Error(`WebGPURenderer: scale2 must be Float32Array(count*2), got ${scale2.length}`);
    }
    return { position, rotation, scale2 };
  }

  private resolvePassColor(
    style: DrawPathInstancesOp['style'],
    renderPassKind: 'fill' | 'stroke',
    count: number,
  ): Pick<InstancePackingPlan, 'activeColor' | 'isUniformColor' | 'hasStroke'> {
    const hasStroke = Boolean(style.strokeColor && style.strokeColor.length > 0);
    const activeColor = renderPassKind === 'stroke' ? style.strokeColor : style.fillColor;
    if (!activeColor || !(activeColor instanceof Uint8ClampedArray) || activeColor.length === 0) {
      throw new Error(`WebGPURenderer: ${renderPassKind}Color must be provided as Uint8ClampedArray`);
    }
    const isUniformColor = activeColor.length === 4;
    if (!isUniformColor && activeColor.length !== count * 4) {
      throw new Error(`WebGPURenderer: ${renderPassKind}Color must be length 4 or count*4`);
    }
    return { activeColor, isUniformColor, hasStroke };
  }

  private assertFillRuleSupport(
    fillColor: DrawPathInstancesOp['style']['fillColor'],
    fillRule: DrawPathInstancesOp['style']['fillRule'],
  ): void {
    const hasFill = Boolean(fillColor && fillColor.length > 0);
    const resolvedFillRule = fillRule ?? 'nonzero';
    if (hasFill && resolvedFillRule !== 'nonzero') {
      throw new Error(`WebGPURenderer: fillRule "${resolvedFillRule}" is not supported`);
    }
  }

  private resolveInstanceSizeSource(size: DrawPathInstancesOp['instances']['size'], count: number): number | Float32Array {
    if (typeof size === 'number') {
      if (!Number.isFinite(size)) {
        throw new Error('WebGPURenderer: size must be finite when provided as a number');
      }
      return size;
    }
    if (!(size instanceof Float32Array) || size.length !== count) {
      throw new Error('WebGPURenderer: size must be number or Float32Array(count)');
    }
    return size;
  }

  private resolveStrokeWidthSource(
    strokeWidth: DrawPathInstancesOp['style']['strokeWidth'],
    hasStroke: boolean,
    count: number,
  ): number | Float32Array | null {
    if (!hasStroke) {
      return null;
    }
    const source = strokeWidth ?? 0.01;
    if (typeof source === 'number') {
      if (!Number.isFinite(source)) {
        throw new Error('WebGPURenderer: strokeWidth must be finite when provided as a number');
      }
      return source;
    }
    if (!(source instanceof Float32Array) || source.length !== count) {
      throw new Error('WebGPURenderer: strokeWidth must be number or Float32Array(count)');
    }
    return source;
  }

  private writePackedInstance(plan: InstancePackingPlan, firstInstance: number, index: number): void {
    const instanceId = firstInstance + index;
    const base = (firstInstance + index) * INSTANCE_FLOATS;
    const posX = plan.position[index * 2];
    const posY = plan.position[index * 2 + 1];
    const rotationValue = plan.rotation[index];
    const scaleX = plan.scale2[index * 2];
    const scaleY = plan.scale2[index * 2 + 1];
    this.assertFiniteInstanceValue(instanceId, 'positionX', posX);
    this.assertFiniteInstanceValue(instanceId, 'positionY', posY);
    this.assertFiniteInstanceValue(instanceId, 'rotation', rotationValue);
    this.assertFiniteInstanceValue(instanceId, 'scaleX', scaleX);
    this.assertFiniteInstanceValue(instanceId, 'scaleY', scaleY);

    const sizeBase = typeof plan.size === 'number' ? plan.size : plan.size[index];
    this.assertFiniteInstanceValue(instanceId, 'size', sizeBase);
    const strokeWidth = this.resolveStrokeWidth(plan.strokeWidthSource, index);
    this.assertFiniteInstanceValue(instanceId, 'strokeWidth', strokeWidth);
    const sizeValue = this.resolvePackedSize(plan.renderPassKind, plan.hasStroke, sizeBase, strokeWidth);
    this.assertFiniteInstanceValue(instanceId, 'resolvedSize', sizeValue);

    this.writePackedTransformFields(base, {
      posX,
      posY,
      sizeValue,
      rotationValue,
      scaleX,
      scaleY,
      shapeBankWordOffset: plan.shapeBankWordOffset,
    });
    this.writePackedColorFields(base, plan.activeColor, plan.isUniformColor, index);
  }

  private assertFiniteInstanceValue(instanceId: number, fieldName: string, value: number): void {
    // [LAW:single-enforcer] Per-instance numeric validity is enforced once at
    // GPU payload packing so downstream shader stages never receive NaN/Inf.
    if (!Number.isFinite(value)) {
      throw new Error(`WebGPURenderer: instance ${instanceId} ${fieldName} must be finite`);
    }
  }

  private writePackedTransformFields(base: number, fields: PackedTransformFields): void {
    this.instanceStaging[base] = fields.posX;
    this.instanceStaging[base + 1] = fields.posY;
    this.instanceStaging[base + 2] = fields.sizeValue;
    this.instanceStaging[base + 3] = fields.rotationValue;
    this.instanceStaging[base + 4] = fields.scaleX;
    this.instanceStaging[base + 5] = fields.scaleY;
    this.instanceStaging[base + 6] = fields.shapeBankWordOffset;
    this.instanceStaging[base + 7] = 0;
  }

  private writePackedColorFields(
    base: number,
    activeColor: Uint8ClampedArray,
    isUniformColor: boolean,
    index: number,
  ): void {
    const colorOffset = isUniformColor ? 0 : index * 4;
    this.instanceStaging[base + 8] = activeColor[colorOffset] / 255;
    this.instanceStaging[base + 9] = activeColor[colorOffset + 1] / 255;
    this.instanceStaging[base + 10] = activeColor[colorOffset + 2] / 255;
    this.instanceStaging[base + 11] = activeColor[colorOffset + 3] / 255;
  }

  private resolveStrokeWidth(strokeWidthSource: number | Float32Array | null, index: number): number {
    if (strokeWidthSource === null) {
      return 0;
    }
    if (typeof strokeWidthSource === 'number') {
      return strokeWidthSource;
    }
    return strokeWidthSource[index];
  }

  private resolvePackedSize(
    renderPassKind: 'fill' | 'stroke',
    hasStroke: boolean,
    sizeBase: number,
    strokeWidth: number,
  ): number {
    const strokeHalf = Math.max(0, strokeWidth) * 0.5;
    if (renderPassKind === 'stroke') {
      return sizeBase + strokeHalf;
    }
    if (hasStroke) {
      return Math.max(0, sizeBase - strokeHalf);
    }
    return sizeBase;
  }

  private ensureInstanceCapacity(requiredCount: number): void {
    if (requiredCount <= this.instanceCapacity) {
      return;
    }

    const nextCapacity = growPowerOfTwoCapacity(this.instanceCapacity, requiredCount);

    const nextBuffer = this.device.createBuffer({
      size: nextCapacity * INSTANCE_FLOATS * 4,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
      mappedAtCreation: false,
    });

    this.instanceBuffer.destroy();
    this.instanceBuffer = nextBuffer;
    this.instanceCapacity = nextCapacity;
    this.instanceStaging = new Float32Array(this.instanceCapacity * INSTANCE_FLOATS);
    this.instanceBindGroup = this.device.createBindGroup({
      layout: this.pathPipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.instanceBindGroup),
      entries: [
        {
          binding: WEBGPU_RENDER_CONTRACT.instanceBinding,
          resource: { buffer: this.instanceBuffer },
        },
      ],
    });
  }

  private ensureIndirectArgsCapacity(requiredRecords: number): void {
    if (requiredRecords <= this.indirectArgsCapacityRecords) {
      return;
    }

    const nextCapacity = growPowerOfTwoCapacity(this.indirectArgsCapacityRecords, requiredRecords);

    const nextBuffer = this.device.createBuffer({
      size: nextCapacity * WEBGPU_RENDER_CONTRACT.indirectArgsBytes,
      usage:
        GPU_BUFFER_USAGE.STORAGE |
        GPU_BUFFER_USAGE.INDIRECT |
        GPU_BUFFER_USAGE.COPY_DST |
        GPU_BUFFER_USAGE.COPY_SRC,
      mappedAtCreation: false,
    });
    this.indirectArgsBuffer.destroy();
    this.indirectArgsBuffer = nextBuffer;
    this.indirectArgsCapacityRecords = nextCapacity;
  }

  // [LAW:single-enforcer] createRenderPipelineAsync is the only permitted render pipeline
  // creation path (P2-1: Async Compiler Service Architecture).
  private static async createPathPipelineAsync(device: GpuDevice, canvasFormat: string): Promise<GpuRenderPipeline> {
    const shaderModule = device.createShaderModule({ code: PATH_RENDER_WGSL });
    return device.createRenderPipelineAsync({
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
            format: canvasFormat,
            blend: {
              color: {
                srcFactor: 'one',
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
        count: WEBGPU_RENDER_CONTRACT.renderMsaaSampleCount,
      },
    });
  }
}

export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  // [LAW:single-enforcer] Runtime rendering capability is enforced once at
  // WebGPU renderer creation. No backup renderer exists by design.
  return WebGPURenderer.create(canvas);
}
