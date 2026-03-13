/**
 * Rigid Render Integration — End-to-End Indexed Indirect Render Pass
 *
 * Wires the rigid shape pipeline: NagaModule shaders → GPU pipeline →
 * bind groups → indirect draw execution. Consumes ShapeBank (topology),
 * Arena (per-instance data), and IndirectBuffer (GPU-authored draw commands).
 *
 * [LAW:one-source-of-truth] Pipeline configuration (MSAA, blend, depth) is
 * defined once here. All rigid shapes share this single pipeline.
 *
 * [LAW:dataflow-not-control-flow] Both indexed and non-indexed indirect
 * streams execute unconditionally; empty records naturally produce zero draws.
 *
 * Spec: docs/WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md §§3-5
 */

import type {
  GpuBindGroup,
  GpuBuffer,
  GpuDevice,
  GpuRenderPassEncoder,
  GpuRenderPipeline,
  GpuTexture,
  GpuTextureView,
} from './gpu-api';
import type { IndirectBufferLayout } from './IndirectBuffer';
import {
  INDEXED_INDIRECT_STRIDE,
  NON_INDEXED_INDIRECT_STRIDE,
} from './IndirectBuffer';

// ── Constants ──────────────────────────────────────────────────────────

/** MSAA sample count per P3-4 §6 */
export const MSAA_SAMPLE_COUNT = 4;

/** Canvas texture format (standard for WebGPU) */
export const CANVAS_FORMAT = 'bgra8unorm';

// ── GPU Buffer Usage Flags ─────────────────────────────────────────────

const GPU_USAGE = {
  COPY_DST: 0x0008,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  RENDER_ATTACHMENT: 0x0010,
} as const;

// ── Render Pass Descriptor ─────────────────────────────────────────────

/**
 * Build the render pass descriptor for the opaque pass.
 *
 * Per P3-4 §3.2: depth test/write ON for opaque pass.
 * Per P3-4 §5: premultiplied alpha blend state.
 */
export function buildRenderPassDescriptor(
  msaaView: GpuTextureView,
  resolveTarget: GpuTextureView,
  depthView: GpuTextureView,
): unknown {
  return {
    colorAttachments: [
      {
        view: msaaView,
        resolveTarget,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      },
    ],
    depthStencilAttachment: {
      view: depthView,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
      depthClearValue: 1.0,
    },
  };
}

// ── Pipeline Configuration ─────────────────────────────────────────────

/**
 * Premultiplied alpha blend state per P3-4 §5:
 *   color: src=one, dst=one-minus-src-alpha, op=add
 *   alpha: src=one, dst=one-minus-src-alpha, op=add
 */
const PREMULTIPLIED_ALPHA_BLEND = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
} as const;

/**
 * Build the render pipeline descriptor for rigid shapes.
 *
 * Uses storage-buffer vertex pulling (no vertex buffers in layout).
 * Fragment outputs premultiplied alpha.
 */
export function buildRigidPipelineDescriptor(
  vertexShaderModule: unknown,
  fragmentShaderModule: unknown,
): unknown {
  return {
    layout: 'auto',
    vertex: {
      module: vertexShaderModule,
      entryPoint: 'vertex_main',
      buffers: [], // No vertex buffers — vertex pulling from storage
    },
    fragment: {
      module: fragmentShaderModule,
      entryPoint: 'fragment_main',
      targets: [
        {
          format: CANVAS_FORMAT,
          blend: PREMULTIPLIED_ALPHA_BLEND,
        },
      ],
    },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
    multisample: {
      count: MSAA_SAMPLE_COUNT,
    },
    primitive: {
      topology: 'triangle-list',
    },
  };
}

// ── MSAA + Depth Resources ─────────────────────────────────────────────

/** Resources that must be recreated on canvas resize. */
export interface RenderTargetResources {
  readonly msaaTexture: GpuTexture;
  readonly msaaView: GpuTextureView;
  readonly depthTexture: GpuTexture;
  readonly depthView: GpuTextureView;
}

/**
 * Create MSAA and depth textures for a given canvas size.
 * Per P3-4 §6: MSAA render target, recreated on resize.
 */
export function createRenderTargetResources(
  device: GpuDevice,
  width: number,
  height: number,
): RenderTargetResources {
  const msaaTexture = device.createTexture({
    size: { width, height },
    sampleCount: MSAA_SAMPLE_COUNT,
    format: CANVAS_FORMAT,
    usage: GPU_USAGE.RENDER_ATTACHMENT,
  });
  const depthTexture = device.createTexture({
    size: { width, height },
    sampleCount: MSAA_SAMPLE_COUNT,
    format: 'depth24plus',
    usage: GPU_USAGE.RENDER_ATTACHMENT,
  });
  return {
    msaaTexture,
    msaaView: msaaTexture.createView(),
    depthTexture,
    depthView: depthTexture.createView(),
  };
}

// ── Bind Group Construction ────────────────────────────────────────────

/**
 * Resources needed for the rigid render pass bind group.
 *
 * Binding layout (matches RigidVertexShader.ts):
 *   @group(0) @binding(0): arena (f32 storage, read-only)
 *   @group(0) @binding(1): shape_bank (u32 storage, read-only)
 */
export interface RigidBindGroupResources {
  readonly arenaBuffer: GpuBuffer;
  readonly shapeBankBuffer: GpuBuffer;
}

/**
 * Create the frame bind group for the rigid render pipeline.
 */
export function createRigidBindGroup(
  device: GpuDevice,
  pipeline: GpuRenderPipeline,
  resources: RigidBindGroupResources,
): GpuBindGroup {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: resources.arenaBuffer } },
      { binding: 1, resource: { buffer: resources.shapeBankBuffer } },
    ],
  });
}

// ── Indirect Draw Execution ────────────────────────────────────────────

/**
 * Draw stream counts for indirect execution.
 * These track how many records the draw prep kernel wrote.
 */
export interface IndirectDrawStreams {
  /** Number of valid indexed indirect records */
  readonly indexedRecordCount: number;
  /** Number of valid non-indexed indirect records */
  readonly nonIndexedRecordCount: number;
}

/**
 * Execute indirect draw commands on a render pass.
 *
 * [LAW:dataflow-not-control-flow] Both indexed and non-indexed streams
 * execute unconditionally. Zero-count records produce zero draws.
 *
 * Per P3-4 §4.2: Two ABI-distinct streams, never mixed by stride.
 *   - Indexed: 5 words (20 bytes) per record
 *   - Non-indexed: 4 words (16 bytes) per record
 */
export function executeIndirectDraws(
  pass: GpuRenderPassEncoder,
  indirectBuffer: GpuBuffer,
  layout: IndirectBufferLayout,
  streams: IndirectDrawStreams,
): void {
  // Indexed stream: DrawIndexedIndirectArgs (20-byte stride)
  for (let i = 0; i < streams.indexedRecordCount; i++) {
    pass.drawIndexedIndirect(
      indirectBuffer,
      layout.indexedRegionBaseBytes + i * INDEXED_INDIRECT_STRIDE,
    );
  }

  // Non-indexed stream: DrawIndirectArgs (16-byte stride)
  for (let i = 0; i < streams.nonIndexedRecordCount; i++) {
    pass.drawIndirect(
      indirectBuffer,
      layout.nonIndexedRegionBaseBytes + i * NON_INDEXED_INDIRECT_STRIDE,
    );
  }
}

// ── Integration Facade ─────────────────────────────────────────────────

/**
 * Complete rigid render integration state.
 *
 * Owns the render pipeline, bind group, and MSAA/depth resources.
 * Provides a single `render()` method for frame loop integration.
 */
export interface RigidRenderState {
  readonly pipeline: GpuRenderPipeline;
  readonly bindGroup: GpuBindGroup;
  readonly targets: RenderTargetResources;
}

/**
 * Create the complete rigid render pipeline.
 *
 * @param device - GPU device
 * @param vertexWgsl - WGSL source from Naga shim (vertex shader)
 * @param fragmentWgsl - WGSL source from Naga shim (fragment shader)
 * @param resources - Arena + ShapeBank GPU buffers
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @returns Promise resolving to complete render state
 */
export async function createRigidRenderState(
  device: GpuDevice,
  vertexWgsl: string,
  fragmentWgsl: string,
  resources: RigidBindGroupResources,
  canvasWidth: number,
  canvasHeight: number,
): Promise<RigidRenderState> {
  const vertexModule = device.createShaderModule({ code: vertexWgsl });
  const fragmentModule = device.createShaderModule({ code: fragmentWgsl });

  const pipelineDescriptor = buildRigidPipelineDescriptor(vertexModule, fragmentModule);
  const pipeline = await device.createRenderPipelineAsync(pipelineDescriptor);

  const bindGroup = createRigidBindGroup(device, pipeline, resources);
  const targets = createRenderTargetResources(device, canvasWidth, canvasHeight);

  return { pipeline, bindGroup, targets };
}
