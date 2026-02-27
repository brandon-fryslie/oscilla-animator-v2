import type { DrawPathInstancesOp, PathGeometry, RenderFrameIR } from '../types';
import { PathTessellator } from './PathTessellator';
import { exportTopologyBankU32, getTopologyRegistryRevision } from '../../shapes/registry';
import { InputService } from './InputService';
import {
  DRAW_PREP_COMPUTE_WGSL,
  PATH_RENDER_WGSL,
  SIMULATION_COMPUTE_WGSL,
  WEBGPU_RENDER_CONTRACT,
} from './shaders';

const GPU_BUFFER_USAGE = {
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
const SIMULATION_CAPACITY = WEBGPU_RENDER_CONTRACT.simulationCapacity;
const SIMULATION_WORKGROUP_SIZE = WEBGPU_RENDER_CONTRACT.computeWorkgroupSize;
const DRAW_PREP_WORKGROUP_SIZE = WEBGPU_RENDER_CONTRACT.drawPrepWorkgroupSize;
const SIMULATION_STATE_BYTES = 16;
const RENDER_MSAA_SAMPLE_COUNT = 4;

function alignTo4(value: number): number {
  const remainder = value % 4;
  return remainder === 0 ? value : value + (4 - remainder);
}

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
  readonly inputMouseX?: number;
  readonly inputMouseY?: number;
  readonly inputMouseButtons?: number;
  readonly inputAudioLow?: number;
  readonly inputAudioMid?: number;
  readonly inputAudioHigh?: number;
  readonly inputGaugeActive?: number;
  readonly drawPrepShaderWgsl?: string;
}

interface PreparedDrawPathOp {
  readonly op: DrawPathInstancesOp;
  readonly mesh: GPUMesh;
  readonly topologyBankRecordIndex: number;
  readonly indirectRecordIndex: number;
  readonly firstInstance: number;
  readonly instanceCount: number;
  readonly pass: 'fill' | 'stroke';
}

interface WebGPUStartupResources {
  readonly device: any;
  readonly context: any;
  readonly canvasFormat: string;
  readonly adapterFeatures: ReadonlySet<string>;
}

export function assertWebGPUStartupContract(canvas: HTMLCanvasElement): void {
  const gpu = (navigator as Navigator & { gpu?: any }).gpu;
  if (!gpu) {
    throw new Error('WebGPU is required but navigator.gpu is unavailable');
  }

  const context = canvas.getContext('webgpu') as any;
  if (!context) {
    // [LAW:no-silent-fallbacks] WebGPU-only runtime must fail fast when the
    // browser cannot create a WebGPU presentation context.
    throw new Error('WebGPU is required but canvas.getContext("webgpu") failed');
  }
}

async function createStartupResources(canvas: HTMLCanvasElement): Promise<WebGPUStartupResources> {
  assertWebGPUStartupContract(canvas);
  const gpu = (navigator as Navigator & { gpu?: any }).gpu!;

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw new Error('WebGPU is required but no adapter was found');
  }

  // [LAW:dataflow-not-control-flow] Device allocation uses one request path
  // for all browsers; capability differences flow through adapter features.
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu') as any;
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
  private readonly pipeline: any;
  private readonly paramsBuffer: any;
  private readonly stateBuffers: readonly [any, any];
  private readonly bindGroups: readonly [any, any];
  private readonly paramsStaging = new Float32Array(WEBGPU_RENDER_CONTRACT.computeParamsFloats);

  private constructor(private readonly device: any, pipeline: any) {
    this.pipeline = pipeline;

    this.stateBuffers = [
      device.createBuffer({
        size: WEBGPU_RENDER_CONTRACT.inputHeaderBytes + SIMULATION_CAPACITY * SIMULATION_STATE_BYTES,
        usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
      }),
      device.createBuffer({
        size: WEBGPU_RENDER_CONTRACT.inputHeaderBytes + SIMULATION_CAPACITY * SIMULATION_STATE_BYTES,
        usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
      }),
    ] as const;

    this.paramsBuffer = device.createBuffer({
      size: WEBGPU_RENDER_CONTRACT.computeParamsFloats * Float32Array.BYTES_PER_ELEMENT,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });

    const bindLayout = this.pipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.computeBindGroup);
    this.bindGroups = [
      device.createBindGroup({
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
      device.createBindGroup({
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
    ] as const;

    // [LAW:single-enforcer] Compute runtime owns the src/dst safety contract.
    // src and dst buffers must never alias.
    if (this.stateBuffers[0] === this.stateBuffers[1]) {
      throw new Error('WebGPUComputeRuntime: src/dst state buffers must be distinct');
    }
  }

  // [LAW:single-enforcer] createComputePipelineAsync is the only permitted pipeline
  // creation path (P2-1: Async Compiler Service Architecture).
  static async create(device: any): Promise<WebGPUComputeRuntime> {
    const shaderModule = device.createShaderModule({ code: SIMULATION_COMPUTE_WGSL });
    const pipeline = await device.createComputePipelineAsync({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'cs_main',
      },
    });
    return new WebGPUComputeRuntime(device, pipeline);
  }

  step(
    commandEncoder: any,
    activeCount: number,
    dtSeconds: number,
    inputHeader: Uint8Array,
    frameIndex: number,
  ): void {
    const clampedCount = Math.max(0, Math.min(SIMULATION_CAPACITY, activeCount));
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
    this.paramsStaging[3] = 0;
    this.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsStaging);

    // [LAW:dataflow-not-control-flow] Compute pass always executes.
    // Variability is encoded in activeCount/dt values, not whether the pass runs.
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(WEBGPU_RENDER_CONTRACT.computeBindGroup, this.bindGroups[readStateIndex]);
    const workgroups = Math.max(1, Math.ceil(clampedCount / SIMULATION_WORKGROUP_SIZE));
    pass.dispatchWorkgroups(workgroups);
    pass.end();
  }

  dispose(): void {
    this.paramsBuffer.destroy();
    this.stateBuffers[0].destroy();
    this.stateBuffers[1].destroy();
  }
}

class WebGPUDrawPrepRuntime {
  private pipeline: any;
  private activeShaderCode: string;
  private readonly paramsBuffer: any;
  private readonly paramsStaging = new Uint32Array(WEBGPU_RENDER_CONTRACT.drawPrepParamsU32);
  private activeBindGroup: any | null = null;
  private activeIndirectBuffer: any | null = null;
  // [LAW:single-enforcer] Hot-swap pending pipeline follows P2-1 async protocol.
  private pendingPipeline: any | null = null;
  private shaderGeneration = 0;

  private constructor(private readonly device: any, initialPipeline: any, initialShaderCode: string) {
    this.pipeline = initialPipeline;
    this.activeShaderCode = initialShaderCode;
    this.paramsBuffer = device.createBuffer({
      size: WEBGPU_RENDER_CONTRACT.drawPrepParamsU32 * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });
  }

  // [LAW:single-enforcer] createComputePipelineAsync is the only permitted pipeline
  // creation path (P2-1: Async Compiler Service Architecture).
  static async create(device: any, initialShaderCode: string = DRAW_PREP_COMPUTE_WGSL): Promise<WebGPUDrawPrepRuntime> {
    const shaderModule = device.createShaderModule({ code: initialShaderCode });
    const pipeline = await device.createComputePipelineAsync({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'cs_main',
      },
    });
    return new WebGPUDrawPrepRuntime(device, pipeline, initialShaderCode);
  }

  // Commit any async-ready pipeline swap at the start of a render frame.
  // Implements the hot-swap protocol from P2-1: Runtime Loop checks for a pending
  // pipeline before dispatch and swaps atomically at frame boundary.
  commitPendingPipeline(): void {
    if (this.pendingPipeline !== null) {
      // [LAW:one-source-of-truth] Draw-prep shader ownership is configured from
      // one active WGSL source at runtime (compiler-provided or canonical default).
      this.pipeline = this.pendingPipeline;
      this.pendingPipeline = null;
      // Invalidate cached bind group since pipeline layout may have changed.
      this.activeBindGroup = null;
      this.activeIndirectBuffer = null;
    }
  }

  useShader(shaderCode: string | undefined): void {
    const nextShaderCode =
      typeof shaderCode === 'string' && shaderCode.trim().length > 0
        ? shaderCode
        : DRAW_PREP_COMPUTE_WGSL;
    if (nextShaderCode === this.activeShaderCode) {
      return;
    }
    this.activeShaderCode = nextShaderCode;
    // Shader module is created synchronously; GPU pipeline link is async (hot-swap protocol).
    const generation = ++this.shaderGeneration;
    const shaderModule = this.device.createShaderModule({ code: nextShaderCode });
    void this.device.createComputePipelineAsync({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'cs_main',
      },
    }).then((pipeline: any) => {
      // Only commit if no newer shader update has superseded this one.
      if (generation === this.shaderGeneration) {
        this.pendingPipeline = pipeline;
      }
    }).catch((err: unknown) => {
      // [LAW:no-silent-fallbacks] Pipeline creation errors are surfaced explicitly.
      // The active pipeline remains in use; the next render will use the last valid pipeline.
      console.error('WebGPUDrawPrepRuntime: async pipeline creation failed:', err);
    });
  }

  private getOrCreateBindGroup(indirectBuffer: any): any {
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
    commandEncoder: any,
    indirectBuffer: any,
    recordIndex: number,
    maxRecords: number,
    indexCount: number,
    instanceCount: number,
    firstInstance: number,
  ): void {
    this.paramsStaging[0] = indexCount >>> 0;
    this.paramsStaging[1] = instanceCount >>> 0;
    this.paramsStaging[2] = 0; // firstIndex
    this.paramsStaging[3] = 0; // baseVertex
    this.paramsStaging[4] = firstInstance >>> 0;
    this.paramsStaging[5] = recordIndex >>> 0;
    this.paramsStaging[6] = maxRecords >>> 0;
    this.paramsStaging[7] = 0;
    this.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsStaging);

    const bindGroup = this.getOrCreateBindGroup(indirectBuffer);

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
 * WebGPU renderer that consumes RenderFrameIR directly.
 */
export class WebGPURenderer {
  private readonly tessellator = new PathTessellator();
  private readonly inputService = new InputService();
  private readonly meshCache = new Map<string, GPUMesh>();
  private readonly sceneUniforms = new Float32Array(WEBGPU_RENDER_CONTRACT.sceneUniformFloats);
  private readonly computeRuntime: WebGPUComputeRuntime;
  private readonly drawPrepRuntime: WebGPUDrawPrepRuntime;
  private readonly adapterFeatures: ReadonlySet<string>;

  private readonly pathPipeline: any;
  private readonly sceneUniformBuffer: any;
  private readonly sceneBindGroup: any;
  private topologyBankBindGroup: any;
  private indirectArgsBuffer: any;
  private indirectArgsCapacityRecords = 1;
  private topologyBankBuffer: any;
  private topologyBankCapacityWords = 1;
  private topologyBankRevision = -1;
  private topologyBankIndexById = new Map<number, number>();

  private instanceBuffer: any;
  private instanceBindGroup: any;
  private instanceCapacity = 0;
  private instanceStaging = new Float32Array(0);
  private msaaColorTexture: any | null = null;

  private lastFrameTimeMs: number | null = null;
  // [LAW:one-source-of-truth] Renderer-owned frameIndex is the canonical swap
  // parity source for compute read/write role selection.
  private frameIndex = 0;
  private fatalError: Error | null = null;
  private lastConfiguredSize = { width: -1, height: -1 };

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: any,
    private readonly context: any,
    private readonly canvasFormat: string,
    adapterFeatures: ReadonlySet<string>,
    computeRuntime: WebGPUComputeRuntime,
    drawPrepRuntime: WebGPUDrawPrepRuntime,
    pathPipeline: any,
  ) {
    this.adapterFeatures = adapterFeatures;
    this.computeRuntime = computeRuntime;
    this.drawPrepRuntime = drawPrepRuntime;
    this.pathPipeline = pathPipeline;

    this.sceneUniformBuffer = device.createBuffer({
      size: WEBGPU_RENDER_CONTRACT.sceneUniformBytes,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });

    this.sceneBindGroup = device.createBindGroup({
      layout: this.pathPipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.sceneBindGroup),
      entries: [
        {
          binding: WEBGPU_RENDER_CONTRACT.sceneBinding,
          resource: { buffer: this.sceneUniformBuffer },
        },
      ],
    });
    this.indirectArgsBuffer = device.createBuffer({
      size: WEBGPU_RENDER_CONTRACT.indirectArgsBytes,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.INDIRECT | GPU_BUFFER_USAGE.COPY_DST,
    });
    this.topologyBankBuffer = device.createBuffer({
      size: Uint32Array.BYTES_PER_ELEMENT,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });
    this.topologyBankBindGroup = device.createBindGroup({
      layout: this.pathPipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.topologyBankBindGroup),
      entries: [
        {
          binding: WEBGPU_RENDER_CONTRACT.topologyBankBinding,
          resource: { buffer: this.topologyBankBuffer },
        },
      ],
    });
    this.syncTopologyBank();

    this.instanceBuffer = device.createBuffer({
      size: MIN_INSTANCE_CAPACITY * INSTANCE_FLOATS * 4,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });
    this.instanceCapacity = MIN_INSTANCE_CAPACITY;
    this.instanceStaging = new Float32Array(this.instanceCapacity * INSTANCE_FLOATS);
    this.instanceBindGroup = device.createBindGroup({
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
    this.device.addEventListener?.('uncapturederror', (event: { error?: { message?: string } }) => {
      const message = event?.error?.message ?? 'Unknown WebGPU validation error';
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
    return new WebGPURenderer(
      canvas,
      device,
      context,
      canvasFormat,
      adapterFeatures,
      computeRuntime,
      drawPrepRuntime,
      pathPipeline,
    );
  }

  render(input: RenderInput): void {
    if (this.fatalError) {
      throw this.fatalError;
    }

    this.assertRenderInputContract(input);
    this.ensureCanvasConfiguration(input.width, input.height);
    this.syncTopologyBank();
    this.writeSceneUniforms(input);
    // [LAW:single-enforcer] Hot-swap protocol: commit any ready async pipeline at
    // frame boundary before use (P2-1: Async Compiler Service Architecture).
    this.drawPrepRuntime.commitPendingPipeline();
    this.drawPrepRuntime.useShader(input.drawPrepShaderWgsl);
    const drawPlan = this.buildDrawPlan(input.frame);

    const dtSeconds =
      this.lastFrameTimeMs === null
        ? 0
        : Math.max(0, Math.min(0.1, (input.timeMs - this.lastFrameTimeMs) / 1000));
    this.lastFrameTimeMs = input.timeMs;

    const commandEncoder = this.device.createCommandEncoder();
    const frameIndex = this.frameIndex;
    const simulationInstanceCount = this.countSimulationInstances(drawPlan);
    this.assertSimulationCapacity(simulationInstanceCount);
    const frameInputHeader = this.inputService.marshal({
      timeSeconds: input.timeMs / 1000,
      deltaTimeSeconds: dtSeconds,
      frameCount: frameIndex,
      width: input.width,
      height: input.height,
      mouseX: input.inputMouseX ?? 0,
      mouseY: input.inputMouseY ?? 0,
      mouseButtons: input.inputMouseButtons ?? 0,
      audioLow: input.inputAudioLow ?? 0,
      audioMid: input.inputAudioMid ?? 0,
      audioHigh: input.inputAudioHigh ?? 0,
      gaugeActive: input.inputGaugeActive ?? 0,
    });
    this.computeRuntime.step(commandEncoder, simulationInstanceCount, dtSeconds, frameInputHeader, frameIndex);
    const totalInstances = this.countPlannedInstances(drawPlan);
    this.ensureInstanceCapacity(totalInstances);
    const packedInstances = this.packDrawPlanInstances(drawPlan);
    if (packedInstances > 0) {
      this.device.queue.writeBuffer(
        this.instanceBuffer,
        0,
        this.instanceStaging.buffer,
        0,
        packedInstances * WEBGPU_RENDER_CONTRACT.instanceBytes
      );
    }
    this.ensureIndirectArgsCapacity(drawPlan.length);
    for (const prepared of drawPlan) {
      this.drawPrepRuntime.step(
        commandEncoder,
        this.indirectArgsBuffer,
        prepared.indirectRecordIndex,
        this.indirectArgsCapacityRecords,
        prepared.mesh.indexCount,
        prepared.instanceCount,
        prepared.firstInstance,
      );
    }

    const currentTexture = this.context.getCurrentTexture();
    const currentTextureView = currentTexture.createView();
    const msaaView = this.msaaColorTexture?.createView();
    const colorView = msaaView ?? currentTextureView;

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: colorView,
          loadOp: 'clear',
          storeOp: msaaView ? 'discard' : 'store',
          resolveTarget: msaaView ? currentTextureView : undefined,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    pass.setPipeline(this.pathPipeline);
    pass.setBindGroup(WEBGPU_RENDER_CONTRACT.sceneBindGroup, this.sceneBindGroup);
    pass.setBindGroup(WEBGPU_RENDER_CONTRACT.topologyBankBindGroup, this.topologyBankBindGroup);
    // [LAW:single-enforcer] Instance storage binding is stable for the entire
    // render pass, so the pass setup is the single bind authority.
    pass.setBindGroup(WEBGPU_RENDER_CONTRACT.instanceBindGroup, this.instanceBindGroup);

    for (const prepared of drawPlan) {
      this.drawPreparedPathOp(pass, prepared);
    }

    pass.end();
    this.device.queue.submit([commandEncoder.finish()]);
    this.frameIndex += 1;
  }

  dispose(): void {
    this.computeRuntime.dispose();
    this.drawPrepRuntime.dispose();
    this.sceneUniformBuffer.destroy();
    this.indirectArgsBuffer.destroy();
    this.topologyBankBuffer.destroy();
    this.instanceBuffer.destroy();
    this.msaaColorTexture?.destroy();
    this.msaaColorTexture = null;
    for (const mesh of this.meshCache.values()) {
      mesh.vertexBuffer.destroy();
      mesh.indexBuffer.destroy();
    }
    this.meshCache.clear();
    this.tessellator.clear();
  }

  private assertRenderInputContract(input: RenderInput): void {
    const { frame, width, height, zoom, panX, panY, timeMs } = input;
    if (frame.version !== 2) {
      throw new Error(`WebGPURenderer: unsupported frame version ${frame.version}`);
    }
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

    const optionalFields = [
      ['inputMouseX', input.inputMouseX],
      ['inputMouseY', input.inputMouseY],
      ['inputMouseButtons', input.inputMouseButtons],
      ['inputAudioLow', input.inputAudioLow],
      ['inputAudioMid', input.inputAudioMid],
      ['inputAudioHigh', input.inputAudioHigh],
      ['inputGaugeActive', input.inputGaugeActive],
    ] as const;
    for (const [name, value] of optionalFields) {
      if (value !== undefined && !Number.isFinite(value)) {
        throw new Error(`WebGPURenderer: ${name} must be finite when provided, got ${value}`);
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
    this.refreshMsaaColorTarget(width, height);
    this.lastConfiguredSize.width = width;
    this.lastConfiguredSize.height = height;
  }

  private refreshMsaaColorTarget(width: number, height: number): void {
    // [LAW:single-enforcer] MSAA color-target lifecycle is owned by one resize
    // boundary so sample-count resources stay in lockstep with canvas size.
    this.msaaColorTexture?.destroy();
    this.msaaColorTexture = this.device.createTexture({
      size: {
        width,
        height,
        depthOrArrayLayers: 1,
      },
      sampleCount: RENDER_MSAA_SAMPLE_COUNT,
      format: this.canvasFormat,
      usage: GPU_TEXTURE_USAGE.RENDER_ATTACHMENT,
    });
  }

  private syncTopologyBank(): void {
    const revision = getTopologyRegistryRevision();
    if (revision === this.topologyBankRevision) {
      return;
    }

    const exported = exportTopologyBankU32();
    this.topologyBankIndexById = new Map(exported.indexById);
    const requiredWords = Math.max(1, exported.data.length);
    if (requiredWords > this.topologyBankCapacityWords) {
      const nextBuffer = this.device.createBuffer({
        size: requiredWords * Uint32Array.BYTES_PER_ELEMENT,
        usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
      });
      this.topologyBankBuffer.destroy();
      this.topologyBankBuffer = nextBuffer;
      this.topologyBankBindGroup = this.device.createBindGroup({
        layout: this.pathPipeline.getBindGroupLayout(WEBGPU_RENDER_CONTRACT.topologyBankBindGroup),
        entries: [
          {
            binding: WEBGPU_RENDER_CONTRACT.topologyBankBinding,
            resource: { buffer: this.topologyBankBuffer },
          },
        ],
      });
      this.topologyBankCapacityWords = requiredWords;
    }
    if (exported.data.length > 0) {
      this.device.queue.writeBuffer(this.topologyBankBuffer, 0, exported.data);
    }
    this.topologyBankRevision = revision;
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

  private buildDrawPlan(frame: RenderFrameIR): PreparedDrawPathOp[] {
    const prepared: PreparedDrawPathOp[] = [];
    let nextFirstInstance = 0;
    for (const op of frame.ops) {
      if (op.kind !== 'drawPathInstances') {
        throw new Error(`WebGPURenderer: unsupported draw op kind "${(op as { kind: string }).kind}"`);
      }
      const mesh = this.getOrCreateMesh(op.geometry);
      if (mesh.indexCount === 0 || op.instances.count <= 0) {
        continue;
      }
      const topologyBankRecordIndex = this.topologyBankIndexById.get(op.geometry.topologyId);
      // [LAW:one-source-of-truth] Topology metadata is read from the canonical
      // GPU topology bank index; render ops must resolve through that mapping.
      if (topologyBankRecordIndex === undefined) {
        throw new Error(`WebGPURenderer: topology ${op.geometry.topologyId} missing from topology bank`);
      }
      const hasFill = Boolean(op.style.fillColor && op.style.fillColor.length > 0);
      const hasStroke = Boolean(op.style.strokeColor && op.style.strokeColor.length > 0);
      if (!hasFill && !hasStroke) {
        throw new Error('WebGPURenderer: drawPathInstances op must provide fillColor and/or strokeColor');
      }
      // [LAW:dataflow-not-control-flow] Draw planning uses one canonical pass
      // order; fill/stroke variability is encoded in pass data, not alternate pipelines.
      if (hasFill) {
        prepared.push({
          op,
          mesh,
          topologyBankRecordIndex,
          indirectRecordIndex: prepared.length,
          firstInstance: nextFirstInstance,
          instanceCount: op.instances.count,
          pass: 'fill',
        });
        nextFirstInstance += op.instances.count;
      }
      if (hasStroke) {
        prepared.push({
          op,
          mesh,
          topologyBankRecordIndex,
          indirectRecordIndex: prepared.length,
          firstInstance: nextFirstInstance,
          instanceCount: op.instances.count,
          pass: 'stroke',
        });
        nextFirstInstance += op.instances.count;
      }
    }
    return prepared;
  }

  private drawPreparedPathOp(pass: any, prepared: PreparedDrawPathOp): void {
    pass.setVertexBuffer(0, prepared.mesh.vertexBuffer);
    pass.setIndexBuffer(prepared.mesh.indexBuffer, prepared.mesh.indexFormat);
    pass.drawIndexedIndirect(
      this.indirectArgsBuffer,
      prepared.indirectRecordIndex * WEBGPU_RENDER_CONTRACT.indirectArgsBytes,
    );
  }

  private countPlannedInstances(drawPlan: readonly PreparedDrawPathOp[]): number {
    let total = 0;
    for (const prepared of drawPlan) {
      total += prepared.instanceCount;
    }
    return total;
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

  private assertSimulationCapacity(activeCount: number): void {
    // [LAW:no-silent-fallbacks] Simulation capacity overruns are explicit
    // contract violations; fail fast instead of silently clipping active lanes.
    if (activeCount > SIMULATION_CAPACITY) {
      throw new Error(
        `WebGPURenderer: simulation instance count ${activeCount} exceeds capacity ${SIMULATION_CAPACITY}`
      );
    }
  }

  private packDrawPlanInstances(drawPlan: readonly PreparedDrawPathOp[]): number {
    let packedInstances = 0;
    // [LAW:dataflow-not-control-flow] Every prepared draw pass runs through one
    // deterministic packing stage; pass variance is represented as input data.
    for (const prepared of drawPlan) {
      const written = this.packInstances(
        prepared.op,
        prepared.topologyBankRecordIndex,
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
  ): any {
    // [LAW:no-silent-fallbacks] mappedAtCreation buffers must be 4-byte aligned;
    // enforce the WebGPU contract deterministically at allocation time.
    const safeSize = Math.max(4, alignTo4(data.byteLength));
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

  private packInstances(
    op: DrawPathInstancesOp,
    topologyBankRecordIndex: number,
    renderPassKind: 'fill' | 'stroke',
    firstInstance: number,
  ): number {
    const count = op.instances.count;
    if (count <= 0) {
      return 0;
    }

    const { position, size, rotation, scale2 } = op.instances;
    const { style } = op;
    const hasFill = Boolean(style.fillColor && style.fillColor.length > 0);
    const hasStroke = Boolean(style.strokeColor && style.strokeColor.length > 0);
    const activeColor = renderPassKind === 'stroke' ? style.strokeColor : style.fillColor;

    if (!(position instanceof Float32Array) || position.length !== count * 2) {
      throw new Error(`WebGPURenderer: position must be Float32Array(count*2), got ${position.length}`);
    }

    if (!(rotation instanceof Float32Array) || rotation.length !== count) {
      throw new Error(`WebGPURenderer: rotation must be Float32Array(count), got ${rotation.length}`);
    }

    if (!(scale2 instanceof Float32Array) || scale2.length !== count * 2) {
      throw new Error(`WebGPURenderer: scale2 must be Float32Array(count*2), got ${scale2.length}`);
    }

    if (!activeColor || !(activeColor instanceof Uint8ClampedArray) || activeColor.length === 0) {
      throw new Error(`WebGPURenderer: ${renderPassKind}Color must be provided as Uint8ClampedArray`);
    }

    const fillRule = style.fillRule ?? 'nonzero';
    if (hasFill && fillRule !== 'nonzero') {
      throw new Error(`WebGPURenderer: fillRule "${fillRule}" is not supported`);
    }

    const isUniformSize = typeof size === 'number';
    if (!isUniformSize && (!(size instanceof Float32Array) || size.length !== count)) {
      throw new Error('WebGPURenderer: size must be number or Float32Array(count)');
    }
    if (isUniformSize && !Number.isFinite(size as number)) {
      throw new Error('WebGPURenderer: size must be finite when provided as a number');
    }

    const isUniformColor = activeColor.length === 4;
    if (!isUniformColor && activeColor.length !== count * 4) {
      throw new Error(`WebGPURenderer: ${renderPassKind}Color must be length 4 or count*4`);
    }

    let strokeWidthSource: number | Float32Array | null = null;
    if (hasStroke) {
      strokeWidthSource = style.strokeWidth ?? 0.01;
      if (typeof strokeWidthSource !== 'number' &&
          (!(strokeWidthSource instanceof Float32Array) || strokeWidthSource.length !== count)) {
        throw new Error('WebGPURenderer: strokeWidth must be number or Float32Array(count)');
      }
      if (typeof strokeWidthSource === 'number' && !Number.isFinite(strokeWidthSource)) {
        throw new Error('WebGPURenderer: strokeWidth must be finite when provided as a number');
      }
    }

    this.ensureInstanceCapacity(firstInstance + count);

    for (let i = 0; i < count; i++) {
      const base = (firstInstance + i) * INSTANCE_FLOATS;
      const posX = position[i * 2];
      const posY = position[i * 2 + 1];
      const rotationValue = rotation[i];
      const scaleX = scale2[i * 2];
      const scaleY = scale2[i * 2 + 1];
      // [LAW:single-enforcer] Per-instance numeric validity is enforced once at
      // GPU payload packing so downstream shader stages never receive NaN/Inf.
      if (!Number.isFinite(posX) || !Number.isFinite(posY) ||
          !Number.isFinite(rotationValue) || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
        throw new Error(`WebGPURenderer: instance ${firstInstance + i} contains non-finite transform values`);
      }

      const sizeBase = isUniformSize ? (size as number) : (size as Float32Array)[i];
      if (!Number.isFinite(sizeBase)) {
        throw new Error(`WebGPURenderer: instance ${firstInstance + i} size must be finite`);
      }
      const strokeWidth = hasStroke
        ? (typeof strokeWidthSource === 'number'
          ? strokeWidthSource
          : (strokeWidthSource as Float32Array)[i] ?? 0)
        : 0;
      if (!Number.isFinite(strokeWidth)) {
        throw new Error(`WebGPURenderer: instance ${firstInstance + i} strokeWidth must be finite`);
      }
      const strokeHalf = Math.max(0, strokeWidth) * 0.5;
      const sizeValue = renderPassKind === 'stroke'
        ? sizeBase + strokeHalf
        : hasStroke
          ? Math.max(0, sizeBase - strokeHalf)
          : sizeBase;
      if (!Number.isFinite(sizeValue)) {
        throw new Error(`WebGPURenderer: instance ${firstInstance + i} resolved size must be finite`);
      }

      this.instanceStaging[base] = posX;
      this.instanceStaging[base + 1] = posY;
      this.instanceStaging[base + 2] = sizeValue;
      this.instanceStaging[base + 3] = rotationValue;
      this.instanceStaging[base + 4] = scaleX;
      this.instanceStaging[base + 5] = scaleY;
      this.instanceStaging[base + 6] = topologyBankRecordIndex;
      this.instanceStaging[base + 7] = 0;

      const colorOffset = isUniformColor ? 0 : i * 4;
      this.instanceStaging[base + 8] = activeColor[colorOffset] / 255;
      this.instanceStaging[base + 9] = activeColor[colorOffset + 1] / 255;
      this.instanceStaging[base + 10] = activeColor[colorOffset + 2] / 255;
      this.instanceStaging[base + 11] = activeColor[colorOffset + 3] / 255;
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

    let nextCapacity = this.indirectArgsCapacityRecords;
    while (nextCapacity < requiredRecords) {
      nextCapacity *= 2;
    }

    const nextBuffer = this.device.createBuffer({
      size: nextCapacity * WEBGPU_RENDER_CONTRACT.indirectArgsBytes,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.INDIRECT | GPU_BUFFER_USAGE.COPY_DST,
    });
    this.indirectArgsBuffer.destroy();
    this.indirectArgsBuffer = nextBuffer;
    this.indirectArgsCapacityRecords = nextCapacity;
  }

  // [LAW:single-enforcer] createRenderPipelineAsync is the only permitted render pipeline
  // creation path (P2-1: Async Compiler Service Architecture).
  private static async createPathPipelineAsync(device: any, canvasFormat: string): Promise<any> {
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
        count: RENDER_MSAA_SAMPLE_COUNT,
      },
    });
  }
}

export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  // [LAW:single-enforcer] Runtime rendering capability is enforced once at
  // WebGPU renderer creation. No backup renderer exists by design.
  return WebGPURenderer.create(canvas);
}
