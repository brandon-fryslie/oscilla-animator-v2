/**
 * Executor Init — Module-level allocations for ScheduleExecutor
 *
 * This file is NOT in the ESLint hot-path target list, so allocations here
 * are allowed. These are created once at module load and reused every frame.
 */

import type { StepRender } from '../compiler/ir/types';
import { BufferPool } from './BufferPool';

// Module-level pool for Materializer buffers.
// These buffers are CACHED in RuntimeState.cache.valueExprFieldBuffers and reused across frames,
// so they don't need arena semantics. The pool grows once and then stabilizes.
export const MATERIALIZER_POOL = new BufferPool();

// Module-level render steps array — reused across frames to avoid per-frame allocation.
export const renderStepsBuffer: StepRender[] = [];

// Reusable Shape2D record — populated in-place before each writeShape2D call.
export const shapeRecord = {
  topologyId: 0,
  pointsFieldSlot: 0,
  pointsCount: 0,
  styleRef: 0,
  flags: 0,
};

// Pre-allocated single-element buffer for composed opcode pipeline in SignalKernelLibrary
export const singleArgBuf: number[] = [0];

// Reusable AssemblerContext — populated in-place each frame to avoid per-frame object literal.
// Fields are set before each use in executeFrame().
export const assemblerCtx = {
  instances: null as any,
  state: null as any,
  resolvedCamera: null as any,
  arena: null as any,
  scalarExprToArenaOffset: null as any,
  slotToArena: null as any,
};
