/**
 * Canonical render pass configuration per spec P3-4.
 *
 * [LAW:single-enforcer] This module is the single boundary where MSAA,
 * depth, blend, and indirect-draw policy are defined for the render pass.
 * No other module may redefine these constants or create parallel config.
 *
 * [LAW:one-source-of-truth] Every render-pass parameter (sample count,
 * depth format, blend state, indirect arg sizes) has exactly one
 * authoritative definition here.
 */

import type {
  GpuBuffer,
  GpuDevice,
  GpuRenderPassEncoder,
  GpuRenderPipeline,
  GpuTexture,
  GpuTextureView,
} from '@/render/webgpu/gpu-api';
import {
  INDEXED_INDIRECT_STRIDE,
  NON_INDEXED_INDIRECT_STRIDE,
} from '@/render/webgpu/IndirectBuffer';
import { getNavigatorGpu } from '@/render/webgpu/gpu-api';

// ---------------------------------------------------------------------------
// Local type aliases for WebGPU concepts not covered by gpu-api.ts
// ---------------------------------------------------------------------------

/**
 * WebGPU texture format string literal.
 * gpu-api.ts uses `string` for format in GpuCanvasContext; we narrow here.
 */
type GpuTextureFormat = string;

/** WebGPU blend component descriptor. */
interface GpuBlendComponent {
  readonly srcFactor: 'zero' | 'one' | 'src-alpha' | 'one-minus-src-alpha';
  readonly dstFactor: 'zero' | 'one' | 'src-alpha' | 'one-minus-src-alpha';
  readonly operation: 'add' | 'subtract' | 'reverse-subtract' | 'min' | 'max';
}

/** WebGPU blend state descriptor. */
interface GpuBlendState {
  readonly color: GpuBlendComponent;
  readonly alpha: GpuBlendComponent;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** MSAA sample count — spec P3-4 mandates 4x. */
export const MSAA_SAMPLE_COUNT = 4;

/** Standard WebGPU depth format for the depth/stencil attachment. */
export const DEPTH_FORMAT: GpuTextureFormat = 'depth24plus';

/**
 * Preferred canvas texture format. Falls back to `'bgra8unorm'` when
 * `navigator.gpu` is unavailable (e.g., test environments).
 *
 * [LAW:one-source-of-truth] Canvas format is resolved once here; all
 * pipeline creation and render-target allocation must read this value.
 */
export const CANVAS_FORMAT: GpuTextureFormat = (() => {
  const gpu = getNavigatorGpu();
  // [LAW:dataflow-not-control-flow] Format resolution always produces a
  // value; the fallback is encoded in the data path, not a conditional skip.
  return gpu?.getPreferredCanvasFormat() ?? 'bgra8unorm';
})();

/**
 * Premultiplied alpha blend state — spec P3-4 section 5.
 *
 * Fragment output must be premultiplied: `vec4(rgb * a, a)`.
 * Both color and alpha channels use identical `one / one-minus-src-alpha / add`.
 */
export const PREMULTIPLIED_ALPHA_BLEND: GpuBlendState = {
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
};

/** Indirect draw arg size for indexed draws: 5 x u32 = 20 bytes. */
export const INDEXED_INDIRECT_BYTES = INDEXED_INDIRECT_STRIDE;

/** Indirect draw arg size for non-indexed draws: 4 x u32 = 16 bytes. */
export const NON_INDEXED_INDIRECT_BYTES = NON_INDEXED_INDIRECT_STRIDE;

// ---------------------------------------------------------------------------
// Texture factory functions
// ---------------------------------------------------------------------------

/**
 * Create the MSAA color render target texture.
 *
 * Must be recreated on canvas resize (spec P3-4 section 6).
 */
export function createMsaaTexture(
  device: GpuDevice,
  width: number,
  height: number,
  format: GpuTextureFormat,
): GpuTexture {
  // [LAW:dataflow-not-control-flow] Texture creation is a pure data
  // transform from dimensions + format to GPU resource.
  return device.createTexture({
    size: { width, height },
    sampleCount: MSAA_SAMPLE_COUNT,
    format,
    usage: 0x10, // GPUTextureUsage.RENDER_ATTACHMENT
  });
}

/**
 * Create the depth texture for the render pass.
 *
 * Uses MSAA sample count so depth resolves align with color resolves.
 * Must be recreated on canvas resize alongside the MSAA texture.
 */
export function createDepthTexture(
  device: GpuDevice,
  width: number,
  height: number,
): GpuTexture {
  // [LAW:dataflow-not-control-flow] Depth texture allocation is a pure
  // data transform; MSAA sample count and format are constant inputs.
  return device.createTexture({
    size: { width, height },
    sampleCount: MSAA_SAMPLE_COUNT,
    format: DEPTH_FORMAT,
    usage: 0x10, // GPUTextureUsage.RENDER_ATTACHMENT
  });
}

// ---------------------------------------------------------------------------
// Render pass descriptor
// ---------------------------------------------------------------------------

/** Input contract for building a render pass descriptor. */
export interface RenderPassConfig {
  readonly msaaView: GpuTextureView;
  readonly resolveTarget: GpuTextureView;
  readonly depthView: GpuTextureView;
  readonly clearColor: { r: number; g: number; b: number; a: number };
}

/** Render pass descriptor shape matching WebGPU `GPURenderPassDescriptor`. */
export interface RenderPassDescriptor {
  readonly colorAttachments: readonly [{
    readonly view: GpuTextureView;
    readonly resolveTarget: GpuTextureView;
    readonly loadOp: 'clear' | 'load';
    readonly storeOp: 'store' | 'discard';
    readonly clearValue: { r: number; g: number; b: number; a: number };
  }];
  readonly depthStencilAttachment: {
    readonly view: GpuTextureView;
    readonly depthLoadOp: 'clear' | 'load';
    readonly depthStoreOp: 'store' | 'discard';
    readonly depthClearValue: number;
  };
}

/**
 * Build a `GPURenderPassDescriptor` for the canonical MSAA + depth pass.
 *
 * [LAW:dataflow-not-control-flow] Descriptor construction is a pure data
 * transform — every field is always populated, no conditional branches.
 */
export function buildRenderPassDescriptor(config: RenderPassConfig): RenderPassDescriptor {
  return {
    colorAttachments: [{
      view: config.msaaView,
      resolveTarget: config.resolveTarget,
      loadOp: 'clear',
      storeOp: 'store',
      clearValue: config.clearColor,
    }],
    depthStencilAttachment: {
      view: config.depthView,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
      depthClearValue: 1.0,
    },
  };
}

// ---------------------------------------------------------------------------
// Render pipeline (opaque pass)
// ---------------------------------------------------------------------------

/** Input contract for creating an opaque render pipeline. */
export interface RenderPipelineConfig {
  readonly device: GpuDevice;
  readonly shaderModule: unknown; // GpuDevice.createShaderModule returns unknown
  readonly vertexEntryPoint: string;
  readonly fragmentEntryPoint: string;
  readonly canvasFormat: GpuTextureFormat;
  readonly bindGroupLayouts: readonly unknown[]; // GpuDevice.createPipelineLayout layouts
}

/**
 * Create the opaque-pass render pipeline.
 *
 * [LAW:single-enforcer] Pipeline creation is the single boundary where
 * MSAA, depth, blend, and vertex-pulling policy are applied to render
 * pipeline state. Opaque pass: depth test ON, depth write ON.
 *
 * Vertex buffers are intentionally empty — vertex pulling from storage
 * buffers is the canonical data path (spec P3-4 section 1).
 */
export async function createOpaqueRenderPipeline(
  config: RenderPipelineConfig,
): Promise<GpuRenderPipeline> {
  return config.device.createRenderPipelineAsync({
    layout: config.device.createPipelineLayout({
      bindGroupLayouts: [...config.bindGroupLayouts],
    }),
    vertex: {
      module: config.shaderModule,
      entryPoint: config.vertexEntryPoint,
      // No vertex buffers — vertex pulling from storage buffers
    },
    fragment: {
      module: config.shaderModule,
      entryPoint: config.fragmentEntryPoint,
      targets: [{
        format: config.canvasFormat,
        blend: PREMULTIPLIED_ALPHA_BLEND,
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
    depthStencil: {
      format: DEPTH_FORMAT,
      depthWriteEnabled: true,  // Opaque: depth write ON
      depthCompare: 'less',
    },
    multisample: {
      count: MSAA_SAMPLE_COUNT,
    },
  });
}

// ---------------------------------------------------------------------------
// Indirect draw execution
// ---------------------------------------------------------------------------

/**
 * Two-stream indirect draw descriptor.
 *
 * The indirect buffer contains two ABI-distinct regions: indexed draws
 * (5 x u32 = 20 bytes per record) and non-indexed draws (4 x u32 = 16
 * bytes per record). The two regions must never be mixed by stride.
 */
export interface IndirectDrawStreams {
  readonly indirectBuffer: GpuBuffer;
  readonly indexBuffer: GpuBuffer;
  readonly indexedRecordCount: number;
  readonly indexedRegionBaseBytes: number;
  readonly nonIndexedRecordCount: number;
  readonly nonIndexedRegionBaseBytes: number;
}

/**
 * Execute the two indirect draw streams (indexed + non-indexed).
 *
 * [LAW:dataflow-not-control-flow] Both indexed and non-indexed loops
 * always execute. Zero-count streams produce zero draw calls naturally —
 * variability lives in the counts, not in whether the loops run.
 *
 * CPU does NOT write dynamic draw counts. EVER. (spec P3-4)
 */
export function executeIndirectDraws(
  pass: GpuRenderPassEncoder,
  streams: IndirectDrawStreams,
): void {
  // Indexed region — bind index buffer, then issue indexed indirect draws.
  pass.setIndexBuffer(streams.indexBuffer, 'uint32');
  for (let i = 0; i < streams.indexedRecordCount; i++) {
    pass.drawIndexedIndirect(
      streams.indirectBuffer,
      streams.indexedRegionBaseBytes + i * INDEXED_INDIRECT_BYTES,
    );
  }

  // Non-indexed region — issue non-indexed indirect draws.
  for (let j = 0; j < streams.nonIndexedRecordCount; j++) {
    pass.drawIndirect(
      streams.indirectBuffer,
      streams.nonIndexedRegionBaseBytes + j * NON_INDEXED_INDIRECT_BYTES,
    );
  }
}
