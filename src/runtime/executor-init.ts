/**
 * Executor Init — Module-level allocations for the runtime executor
 *
 * This file is NOT in the ESLint hot-path target list, so allocations here
 * are allowed. These are created once at module load and reused every frame.
 */

import { createMaterializeScratch } from './MaterializeScratch';

// Module-level scratch allocator for Materializer buffers.
export const MATERIALIZE_SCRATCH = createMaterializeScratch();

function createSingleArgBuf(): number[] {
  return [0];
}

// Pre-allocated single-element buffer for composed opcode pipeline in ScalarKernelLibrary
export const singleArgBuf: number[] = createSingleArgBuf();
