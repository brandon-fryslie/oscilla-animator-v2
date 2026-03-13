/**
 * Parametric Render Integration — End-to-End Non-Indexed Indirect Render Pass
 *
 * Wires the parametric curve pipeline: NagaModule shaders → GPU pipeline →
 * bind groups → indirect draw execution. Consumes ShapeBank (t-value templates),
 * Arena (per-instance control points + color), and IndirectBuffer (GPU-authored
 * draw commands).
 *
 * [LAW:one-source-of-truth] Pipeline configuration (MSAA, blend, depth, topology)
 * is defined once here. All parametric shapes share this single pipeline.
 *
 * [LAW:dataflow-not-control-flow] Both indexed and non-indexed indirect
 * streams execute unconditionally; empty records naturally produce zero draws.
 *
 * Spec: docs/WebGPU-Complete/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md
 * Spec: docs/WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md §§3-5
 */

import type {
  GpuBindGroup,
  GpuBuffer,
  GpuDevice,
  GpuRenderPassEncoder,
  GpuRenderPipeline,
} from './gpu-api';
import type { IndirectBufferLayout } from './IndirectBuffer';
import {
  NON_INDEXED_INDIRECT_STRIDE,
} from './IndirectBuffer';
import {
  MSAA_SAMPLE_COUNT,
  CANVAS_FORMAT,
  type RenderTargetResources,
  createRenderTargetResources,
  buildRenderPassDescriptor,
} from './RigidRenderIntegration';

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
 * Build the render pipeline descriptor for parametric shapes.
 *
 * Uses storage-buffer vertex pulling (no vertex buffers in layout).
 * Topology is line-strip — parametric curves render as connected line segments.
 * Fragment outputs premultiplied alpha.
 */
export function buildParametricPipelineDescriptor(
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
      topology: 'line-strip',
    },
  };
}

// ── Bind Group Construction ────────────────────────────────────────────

/**
 * Resources needed for the parametric render pass bind group.
 *
 * Binding layout (matches ParametricVertexShader.ts):
 *   @group(0) @binding(0): arena (f32 storage, read-only)
 *   @group(0) @binding(1): shape_bank (u32 storage, read-only)
 */
export interface ParametricBindGroupResources {
  readonly arenaBuffer: GpuBuffer;
  readonly shapeBankBuffer: GpuBuffer;
}

/**
 * Create the frame bind group for the parametric render pipeline.
 */
export function createParametricBindGroup(
  device: GpuDevice,
  pipeline: GpuRenderPipeline,
  resources: ParametricBindGroupResources,
): GpuBindGroup {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: resources.arenaBuffer } },
      { binding: 1, resource: { buffer: resources.shapeBankBuffer } },
    ],
  });
}

// ── Non-Indexed Indirect Draw Execution ────────────────────────────────

/**
 * Draw stream counts for parametric indirect execution.
 * Parametric curves use non-indexed indirect draws (line-strip topology).
 */
export interface ParametricDrawStreams {
  /** Number of valid non-indexed indirect records */
  readonly nonIndexedRecordCount: number;
}

/**
 * Execute non-indexed indirect draw commands for parametric shapes.
 *
 * [LAW:dataflow-not-control-flow] The draw loop executes unconditionally.
 * Zero-count records produce zero draws.
 *
 * Per P3-4 §4.2: Non-indexed stream uses 4-word (16-byte) stride.
 */
export function executeParametricIndirectDraws(
  pass: GpuRenderPassEncoder,
  indirectBuffer: GpuBuffer,
  layout: IndirectBufferLayout,
  streams: ParametricDrawStreams,
): void {
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
 * Complete parametric render integration state.
 *
 * Owns the render pipeline and bind group.
 * MSAA/depth resources are shared with the rigid render pass
 * (created once per canvas size via createRenderTargetResources).
 */
export interface ParametricRenderState {
  readonly pipeline: GpuRenderPipeline;
  readonly bindGroup: GpuBindGroup;
}

/**
 * Create the complete parametric render pipeline.
 *
 * @param device - GPU device
 * @param vertexWgsl - WGSL source from Naga shim (parametric vertex shader)
 * @param fragmentWgsl - WGSL source from Naga shim (parametric fragment shader)
 * @param resources - Arena + ShapeBank GPU buffers
 * @returns Promise resolving to complete parametric render state
 */
export async function createParametricRenderState(
  device: GpuDevice,
  vertexWgsl: string,
  fragmentWgsl: string,
  resources: ParametricBindGroupResources,
): Promise<ParametricRenderState> {
  const vertexModule = device.createShaderModule({ code: vertexWgsl });
  const fragmentModule = device.createShaderModule({ code: fragmentWgsl });

  const pipelineDescriptor = buildParametricPipelineDescriptor(vertexModule, fragmentModule);
  const pipeline = await device.createRenderPipelineAsync(pipelineDescriptor);

  const bindGroup = createParametricBindGroup(device, pipeline, resources);

  return { pipeline, bindGroup };
}

// Re-export shared render target utilities for convenience
export { createRenderTargetResources, buildRenderPassDescriptor };
export type { RenderTargetResources };
