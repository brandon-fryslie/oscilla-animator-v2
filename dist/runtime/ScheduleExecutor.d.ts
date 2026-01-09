/**
 * Schedule Executor - Core Frame Execution Loop
 *
 * Executes the IR program schedule step-by-step to produce a frame.
 * Simplified for v2 - pure IR path, no legacy complexity.
 */
import type { IRProgram } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import type { BufferPool } from './BufferPool';
/**
 * RenderFrameIR - Output from frame execution
 *
 * Contains all render passes for the frame.
 */
export interface RenderFrameIR {
    version: 1;
    passes: RenderPassIR[];
}
/**
 * RenderPassIR - Single render pass
 */
export interface RenderPassIR {
    kind: 'instances2d';
    count: number;
    position: ArrayBufferView;
    color: ArrayBufferView;
    size: number | ArrayBufferView;
}
/**
 * Execute one frame of the program
 *
 * @param program - Compiled IR program
 * @param state - Runtime state
 * @param pool - Buffer pool
 * @param tAbsMs - Absolute time in milliseconds
 * @returns RenderFrameIR for this frame
 */
export declare function executeFrame(program: IRProgram, state: RuntimeState, pool: BufferPool, tAbsMs: number): RenderFrameIR;
