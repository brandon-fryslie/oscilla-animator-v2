/**
 * Canonical Frame Loop (spec P3-5)
 *
 * Fixed 5-stage execution order. ALL stages execute EVERY frame.
 * Variability lives in data values (empty dispatches, zero-instance draws),
 * not in whether stages execute.
 *
 * Spec: docs/WebGPU-Complete/P3-5__Runtime_Loop__The_Swap_Explained.md
 *
 * [LAW:dataflow-not-control-flow] The same 5 stages execute in the same order
 * every invocation. Variability is in data (parity, workgroup counts, draw args),
 * never in whether stages execute.
 * [LAW:one-source-of-truth] frameIndex is the single temporal authority;
 * buffer roles derive from it via resolveFrameParity.
 */

import type {
  GpuBuffer,
  GpuBindGroup,
  GpuComputePipeline,
  GpuRenderPipeline,
  GpuDevice,
  GpuCanvasContext,
  GpuTexture,
} from '@/render/webgpu/gpu-api';
import { INPUT_BUFFER_SIZE } from './InputBuffer';
import { executeIndirectDraws } from './RenderPassConfig';

export const COMPUTE_WORKGROUP_SIZE = 64;

export function deriveWorkgroupCount(maxActiveLanes: number): number {
  const laneCount = Number.isFinite(maxActiveLanes) ? Math.max(0, Math.floor(maxActiveLanes)) : 0;
  return Math.max(1, Math.ceil(laneCount / COMPUTE_WORKGROUP_SIZE));
}

// ---- Stage Definition -------------------------------------------------------

export type FrameStage =
  | 'inputMarshal'
  | 'computeDispatch'
  | 'drawPrep'
  | 'renderPass'
  | 'present';

/**
 * Canonical ordered array of all frame stages.
 * [LAW:one-source-of-truth] This is the single authority for stage order.
 */
export const FRAME_STAGES: readonly FrameStage[] = [
  'inputMarshal',
  'computeDispatch',
  'drawPrep',
  'renderPass',
  'present',
] as const;

// ---- GPU Resources ----------------------------------------------------------

/**
 * Pre-allocated GPU resources needed by the frame loop.
 * Created once at init, reused every frame. No per-frame allocation.
 *
 * [LAW:no-shared-mutable-globals] Owned by the runtime instance that
 * creates them; passed explicitly to executeFrame.
 */
export interface FrameLoopResources {
  readonly device: GpuDevice;
  readonly arenaA: GpuBuffer;
  readonly arenaB: GpuBuffer;
  readonly physicsGroupA: GpuBindGroup;
  readonly physicsGroupB: GpuBindGroup;
  readonly readOnlyGroupA: GpuBindGroup;
  readonly readOnlyGroupB: GpuBindGroup;
  readonly renderPipeline: GpuRenderPipeline;
  readonly computePipelines: readonly GpuComputePipeline[];
  readonly workgroupCount: number;
  readonly drawPrepPipeline: GpuComputePipeline;
  readonly indirectBuffer: GpuBuffer;
  readonly indexBuffer: GpuBuffer;
  readonly indexedRecordCount: number;
  readonly indexedRegionBaseBytes: number;
  readonly nonIndexedRecordCount: number;
  readonly nonIndexedRegionBaseBytes: number;
  readonly canvasContext: GpuCanvasContext;
  readonly depthTexture: GpuTexture;
  readonly msaaTexture: GpuTexture;
}

// ---- Frame State ------------------------------------------------------------

/**
 * Mutable per-loop state. Owned by the loop controller.
 * [LAW:one-source-of-truth] frameIndex is the single temporal authority.
 */
export interface FrameLoopState {
  frameIndex: number;
}

export function createFrameLoopState(): FrameLoopState {
  return { frameIndex: 0 };
}

// ---- Parity -----------------------------------------------------------------

/**
 * Derived read/write buffer assignments for a given frame.
 * [LAW:one-source-of-truth] resolveFrameParity is the single authority
 * for which buffer is read vs write.
 */
export interface FrameParity {
  readonly isEven: boolean;
  readonly readBufferIndex: 0 | 1;
  readonly writeBufferIndex: 0 | 1;
}

export function resolveFrameParity(frameIndex: number): FrameParity {
  // [LAW:one-source-of-truth] Parity derivation is the single authority for
  // which buffer is read vs write in a given frame.
  const isEven = (frameIndex % 2) === 0;
  return {
    isEven,
    readBufferIndex: isEven ? 0 : 1,
    writeBufferIndex: isEven ? 1 : 0,
  };
}

// ---- Bind Group Selection ---------------------------------------------------

export interface FrameBindGroups {
  readonly physicsGroup: GpuBindGroup;
  readonly postPhysicsReadGroup: GpuBindGroup;
}

export function selectBindGroups(
  resources: FrameLoopResources,
  parity: FrameParity,
): FrameBindGroups {
  // [LAW:dataflow-not-control-flow] Bind group selection varies by data (parity),
  // not by whether selection executes.
  return {
    physicsGroup: parity.isEven ? resources.physicsGroupA : resources.physicsGroupB,
    postPhysicsReadGroup: parity.isEven ? resources.readOnlyGroupB : resources.readOnlyGroupA,
  };
}

// ---- Frame Context ----------------------------------------------------------

/**
 * Everything needed to execute one frame. Constructed fresh per frame
 * from resources + derived parity + serialized input data.
 */
export interface FrameContext {
  readonly resources: FrameLoopResources;
  readonly parity: FrameParity;
  readonly bindGroups: FrameBindGroups;
  readonly inputData: ArrayBuffer;
}

// ---- Frame Execution --------------------------------------------------------

/**
 * Execute one frame: all 5 stages in canonical order.
 *
 * [LAW:dataflow-not-control-flow] All stages execute every frame.
 * Variability is in data values (empty dispatches, zero-instance draws),
 * not in whether stages execute.
 *
 * [LAW:single-enforcer] Pass ordering (compute -> draw-prep -> render)
 * is enforced here, the single frame execution boundary.
 */
export function executeFrame(ctx: FrameContext, state: FrameLoopState): void {
  const { resources, parity, bindGroups, inputData } = ctx;
  const encoder = resources.device.createCommandEncoder();

  // Stage 1: Input Marshal
  // Upload 256-byte input header to the READ buffer.
  // The read buffer contains current-frame state; the input header occupies
  // offset 0 of whichever arena is the read source this frame.
  const readBuffer = parity.isEven ? resources.arenaA : resources.arenaB;
  resources.device.queue.writeBuffer(readBuffer, 0, inputData, 0, INPUT_BUFFER_SIZE);

  // Stage 2: Compute Dispatch (physics/simulation)
  // Physics reads current arena, writes next arena.
  {
    const pass = encoder.beginComputePass();
    pass.setBindGroup(0, bindGroups.physicsGroup);
    for (const pipeline of resources.computePipelines) {
      pass.setPipeline(pipeline);
      pass.dispatchWorkgroups(resources.workgroupCount);
    }
    pass.end();
  }

  // Stage 3: Draw Prep (GPU-side indirect args)
  // CPU never writes draw counts -- GPU autonomously determines instance count.
  {
    const pass = encoder.beginComputePass();
    pass.setPipeline(resources.drawPrepPipeline);
    pass.setBindGroup(0, bindGroups.postPhysicsReadGroup);
    pass.dispatchWorkgroups(1);
    pass.end();
  }

  // Stage 4: Render Pass (rasterize to canvas)
  {
    const colorView = resources.msaaTexture.createView();
    const resolveTarget = resources.canvasContext.getCurrentTexture().createView();
    const depthView = resources.depthTexture.createView();

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: colorView,
        resolveTarget,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
      depthStencilAttachment: {
        view: depthView,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1.0,
      },
    });
    pass.setPipeline(resources.renderPipeline);
    pass.setBindGroup(0, bindGroups.postPhysicsReadGroup);
    executeIndirectDraws(pass, {
      indirectBuffer: resources.indirectBuffer,
      indexBuffer: resources.indexBuffer,
      indexedRecordCount: resources.indexedRecordCount,
      indexedRegionBaseBytes: resources.indexedRegionBaseBytes,
      nonIndexedRecordCount: resources.nonIndexedRecordCount,
      nonIndexedRegionBaseBytes: resources.nonIndexedRegionBaseBytes,
    });
    pass.end();
  }

  // Submit all GPU commands as a single batch.
  resources.device.queue.submit([encoder.finish()]);

  // Stage 5: Present (advance frame index -- the "swap")
  // [LAW:one-source-of-truth] Frame advancement is a single integer increment.
  // Buffer roles rotate automatically via parity derivation.
  state.frameIndex++;
}

// ---- Loop Controller --------------------------------------------------------

export interface FrameLoopController {
  readonly stop: () => void;
}

/**
 * Drive the requestAnimationFrame loop.
 *
 * [LAW:dataflow-not-control-flow] Every rAF callback executes the same
 * pipeline: derive parity -> select bind groups -> get input -> execute frame.
 * No conditional stage skipping.
 */
export function startFrameLoop(
  resources: FrameLoopResources,
  state: FrameLoopState,
  getInputData: () => ArrayBuffer,
  onError: (error: unknown) => void,
): FrameLoopController {
  let cancelled = false;
  let rafId: number | null = null;

  function tick(): void {
    if (cancelled) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (cancelled) return;
      try {
        // [LAW:dataflow-not-control-flow] Derive all frame parameters from
        // state.frameIndex, then execute the fixed pipeline.
        const parity = resolveFrameParity(state.frameIndex);
        const bindGroups = selectBindGroups(resources, parity);
        const inputData = getInputData();
        executeFrame({ resources, parity, bindGroups, inputData }, state);
      } catch (err) {
        // [LAW:no-silent-fallbacks] Halt on error -- do not silently continue.
        onError(err);
        return;
      }
      tick();
    });
  }

  tick();

  return {
    stop: () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
