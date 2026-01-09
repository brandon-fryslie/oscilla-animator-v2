/**
 * Schedule Executor - Core Frame Execution Loop
 *
 * Executes the IR program schedule step-by-step to produce a frame.
 * Simplified for v2 - pure IR path, no legacy complexity.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { Step } from '../compiler/ir/types';
import type { SigExprId } from '../types';
import type { RuntimeState } from './RuntimeState';
import type { BufferPool } from './BufferPool';
import { resolveTime } from './timeResolution';
import { materialize } from './Materializer';
import { evaluateSignal } from './SignalEvaluator';

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
  size: number | ArrayBufferView; // Can be uniform size or per-particle sizes
}

/**
 * Execute one frame of the program
 *
 * @param program - Compiled IR program (CompiledProgramIR)
 * @param state - Runtime state
 * @param pool - Buffer pool
 * @param tAbsMs - Absolute time in milliseconds
 * @returns RenderFrameIR for this frame
 */
export function executeFrame(
  program: CompiledProgramIR,
  state: RuntimeState,
  pool: BufferPool,
  tAbsMs: number
): RenderFrameIR {
  // Extract schedule components (legacy wrapper for now)
  const schedule = program.schedule as any;
  const timeModel = schedule.timeModel || { kind: 'infinite' as const };
  const domains = schedule.domains || new Map();
  const steps: readonly Step[] = schedule.steps || [];

  // 1. Advance frame (cache owns frameId)
  state.cache.frameId++;

  // 2. Resolve effective time
  const time = resolveTime(tAbsMs, timeModel, state.timeState);
  state.time = time;

  // 3. Execute schedule steps
  const passes: RenderPassIR[] = [];

  // Get dense arrays from program
  const signals = program.signalExprs.nodes;
  const fields = program.fieldExprs.nodes;

  for (const step of steps) {
    switch (step.kind) {
      case 'evalSig': {
        // Evaluate signal and store in slot
        const value = evaluateSignal(step.expr, signals, state);
        state.values.f64[step.target as number] = value;

        // Cache the result
        state.cache.sigValues[step.expr as number] = value;
        state.cache.sigStamps[step.expr as number] = state.cache.frameId;
        break;
      }

      case 'materialize': {
        // Materialize field to buffer and store in slot
        const buffer = materialize(
          step.field,
          step.domain,
          fields,
          signals,
          domains,
          state,
          pool
        );
        state.values.objects.set(step.target, buffer);
        break;
      }

      case 'render': {
        // Assemble render pass
        const domain = domains.get(step.domain);
        if (!domain) {
          throw new Error(`Domain ${step.domain} not found`);
        }

        const position = materialize(
          step.position,
          step.domain,
          fields,
          signals,
          domains,
          state,
          pool
        );

        const color = materialize(
          step.color,
          step.domain,
          fields,
          signals,
          domains,
          state,
          pool
        );

        // Size can be a signal (uniform) or field (per-particle)
        let size: number | ArrayBufferView;
        if (step.size !== undefined) {
          // Check if it's a signal or field ID by checking array bounds
          const isSignal = (step.size as number) < signals.length;
          const isField = (step.size as number) < fields.length;

          // Check field FIRST - fields take precedence for per-particle data
          if (isField) {
            // It's a field - materialize per-particle values
            size = materialize(
              step.size as any,
              step.domain,
              fields,
              signals,
              domains,
              state,
              pool
            );
          } else if (isSignal) {
            // It's a signal - evaluate once
            size = evaluateSignal(step.size as SigExprId, signals, state);
          } else {
            size = 10; // Fallback
          }
        } else {
          size = 10;
        }

        passes.push({
          kind: 'instances2d',
          count: domain.count,
          position,
          color,
          size,
        });
        break;
      }

      default: {
        const _exhaustive: never = step;
        throw new Error(`Unknown step kind: ${(_exhaustive as Step).kind}`);
      }
    }
  }

  // 4. Return render frame
  return {
    version: 1,
    passes,
  };
}
