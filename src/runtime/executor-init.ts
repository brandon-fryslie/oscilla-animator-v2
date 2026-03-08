/**
 * Executor Init — Module-level allocations for ScheduleExecutor
 *
 * This file is NOT in the ESLint hot-path target list, so allocations here
 * are allowed. These are created once at module load and reused every frame.
 */

import type { StepRender } from '../compiler/ir/types';
import { createMaterializeScratch } from './MaterializeScratch';
import type { AssemblerContext } from './RenderAssembler';

// Module-level scratch allocator for Materializer buffers.
export const MATERIALIZE_SCRATCH = createMaterializeScratch();

// Module-level render steps array — reused across frames to avoid per-frame allocation.
export const renderStepsBuffer: StepRender[] = [];

// Pre-allocated single-element buffer for composed opcode pipeline in ScalarKernelLibrary
export const singleArgBuf: number[] = [0];

// Reusable AssemblerContext — populated in-place each frame to avoid per-frame object literal.
// Fields are set before each use in executeFrame().
export const assemblerCtx = {
  program: null as unknown as AssemblerContext['program'],
  instances: null as unknown as AssemblerContext['instances'],
  state: null as unknown as AssemblerContext['state'],
  resolvedCamera: null as unknown as AssemblerContext['resolvedCamera'],
  arena: null as unknown as AssemblerContext['arena'],
  scalarExprToArenaAddress: undefined as AssemblerContext['scalarExprToArenaAddress'],
  slotToArena: undefined as AssemblerContext['slotToArena'],
  pureFnContext: undefined as AssemblerContext['pureFnContext'],
};
