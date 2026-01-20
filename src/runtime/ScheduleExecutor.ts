/**
 * Schedule Executor - Core Frame Execution Loop
 *
 * Executes the IR program schedule step-by-step to produce a frame.
 * Simplified for v2 - pure IR path, no legacy complexity.
 */

import type { CompiledProgramIR, ValueSlot } from '../compiler/ir/program';
import type { ScheduleIR } from '../compiler/passes-v2/pass7-schedule';
import type { Step, InstanceDecl, DomainInstance } from '../compiler/ir/types';
import type { SigExprId, IrInstanceId as InstanceId } from '../types';
import type { RuntimeState } from './RuntimeState';
import type { BufferPool } from './BufferPool';
import { resolveTime } from './timeResolution';
import { materialize } from './Materializer';
import { evaluateSignal } from './SignalEvaluator';
import { detectDomainChange } from './ContinuityMapping';
import { applyContinuity, finalizeContinuityFrame } from './ContinuityApply';
import { createStableDomainInstance, createUnstableDomainInstance } from './DomainIdentity';

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
 *
 * Shape encoding:
 *   0 = circle
 *   1 = square
 *   2 = triangle
 */
export interface RenderPassIR {
  kind: 'instances2d';
  count: number;
  position: ArrayBufferView;
  color: ArrayBufferView;
  size: number | ArrayBufferView; // Can be uniform size or per-particle sizes
  shape: number | ArrayBufferView; // Can be uniform shape or per-particle shapes
}

/**
 * Helper: Resolve slot to storage offset using slotMeta
 *
 * DoD: Runtime MUST use slotMeta.offset for typed array access (f64, f32, etc)
 * For object storage, we still use slot as the Map key
 */
function resolveSlotOffset(
  program: CompiledProgramIR,
  slot: ValueSlot
): { storage: 'f64' | 'f32' | 'i32' | 'u32' | 'object'; offset: number; slot: ValueSlot } {
  const meta = program.slotMeta.find((m) => m.slot === slot);
  if (!meta) {
    throw new Error(`Slot ${slot} not found in slotMeta`);
  }
  return { storage: meta.storage, offset: meta.offset, slot };
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
  // Extract schedule components
  const schedule = program.schedule as ScheduleIR;
  const timeModel = schedule.timeModel;
  const instances = schedule.instances;
  const steps = schedule.steps;

  // 1. Advance frame (cache owns frameId)
  state.cache.frameId++;

  // 2. Resolve effective time
  const time = resolveTime(tAbsMs, timeModel, state.timeState);
  state.time = time;

  // 3. Execute schedule steps in TWO PHASES
  // Phase 1: Execute evalSig, materialize, render (skip stateWrite)
  // Phase 2: Execute all stateWrite steps
  // This ensures state reads see previous frame's values
  const passes: RenderPassIR[] = [];

  // Get dense arrays from program
  const signals = program.signalExprs.nodes;
  const fields = program.fieldExprs.nodes;

  // PHASE 1: Execute all non-stateWrite steps
  for (const step of steps) {
    switch (step.kind) {
      case 'evalSig': {
        // Evaluate signal and store in slot using slotMeta.offset
        const value = evaluateSignal(step.expr, signals, state);
        const { storage, offset } = resolveSlotOffset(program, step.target);

        if (storage === 'f64') {
          // DoD: Use slotMeta.offset for typed array access
          state.values.f64[offset] = value;
        } else {
          throw new Error(`evalSig expects f64 storage, got ${storage}`);
        }

        // Cache the result
        state.cache.sigValues[step.expr as number] = value;
        state.cache.sigStamps[step.expr as number] = state.cache.frameId;
        break;
      }

      case 'materialize': {
        // Materialize field to buffer and store in slot
        const buffer = materialize(
          step.field,
          step.instanceId, // string
          fields,
          signals,
          instances as ReadonlyMap<string, InstanceDecl>,
          state,
          pool
        );
        // Store directly in objects map using slot as key
        // (Object storage doesn't need slotMeta offset lookup)
        state.values.objects.set(step.target, buffer);
        break;
      }

      case 'render': {
        // Assemble render pass - read from slots (after continuity applied)
        const instance = instances.get(step.instanceId as InstanceId);
        if (!instance) {
          throw new Error(`Instance ${step.instanceId} not found`);
        }

        // Read position buffer from slot (continuity-applied)
        const position = state.values.objects.get(step.positionSlot) as ArrayBufferView;
        if (!position) {
          throw new Error(`Position buffer not found in slot ${step.positionSlot}`);
        }

        // Read color buffer from slot (continuity-applied)
        const color = state.values.objects.get(step.colorSlot) as ArrayBufferView;
        if (!color) {
          throw new Error(`Color buffer not found in slot ${step.colorSlot}`);
        }

        // Size can be a signal (uniform) or slot (per-particle after continuity)
        let size: number | ArrayBufferView;
        if (step.size !== undefined) {
          if (step.size.k === 'slot') {
            // Slot - read continuity-applied buffer
            const sizeBuffer = state.values.objects.get(step.size.slot) as ArrayBufferView;
            if (!sizeBuffer) {
              throw new Error(`Size buffer not found in slot ${step.size.slot}`);
            }
            size = sizeBuffer;
          } else {
            // Signal - evaluate once for uniform size
            size = evaluateSignal(step.size.id, signals, state);
          }
        } else {
          // Default size when no input connected
          size = 10;
        }

        // Shape can be a signal (uniform) or slot (per-particle after continuity)
        let shape: number | ArrayBufferView;
        if (step.shape !== undefined) {
          if (step.shape.k === 'slot') {
            // Slot - read continuity-applied buffer
            const shapeBuffer = state.values.objects.get(step.shape.slot) as ArrayBufferView;
            if (!shapeBuffer) {
              throw new Error(`Shape buffer not found in slot ${step.shape.slot}`);
            }
            shape = shapeBuffer;
          } else {
            // Signal - evaluate once for uniform shape
            shape = evaluateSignal(step.shape.id, signals, state);
          }
        } else {
          // Default shape when no input connected (0 = circle)
          shape = 0;
        }

        // Resolve count from instance
        const count = typeof instance.count === 'number' ? instance.count : 0;

        passes.push({
          kind: 'instances2d',
          count,
          position,
          color,
          size,
          shape,
        });
        break;
      }

      case 'stateWrite': {
        // SKIP in Phase 1 - will be executed in Phase 2
        break;
      }

      case 'continuityMapBuild': {
        // Continuity System: Build element mapping when domain changes (spec §5.1)
        const { instanceId } = step;

        // Get instance declaration
        const instance = instances.get(instanceId as InstanceId);
        if (!instance) {
          // Instance not found - skip
          break;
        }

        // Resolve count (dynamic counts need evaluation)
        const count = typeof instance.count === 'number' ? instance.count : 0;
        if (count === 0) break;

        // Create DomainInstance from InstanceDecl
        // Use identity mode from instance declaration
        let newDomain: DomainInstance;
        if (instance.identityMode === 'stable') {
          // Stable identity: generate deterministic element IDs
          const seed = instance.elementIdSeed ?? 0;
          newDomain = createStableDomainInstance(count, seed);
        } else {
          // No identity: crossfade fallback required
          newDomain = createUnstableDomainInstance(count);
        }

        // Detect domain change and compute mapping
        const { changed, mapping } = detectDomainChange(
          instanceId,
          newDomain,
          state.continuity.prevDomains
        );

        if (changed) {
          // DEBUG: Only log when actual change detected
          const oldDomain = state.continuity.prevDomains.get(instanceId);
          console.log(`\n[DOMAIN CHANGE] instanceId=${instanceId}, ${oldDomain?.count ?? 'none'} -> ${count}, mapping=${mapping?.kind ?? 'null'}`);

          // Store mapping (may be null for crossfade fallback)
          if (mapping) {
            state.continuity.mappings.set(instanceId, mapping);
          } else {
            // No mapping possible - crossfade will handle it
            state.continuity.mappings.delete(instanceId);
            console.log(`[DOMAIN CHANGE] WARNING: No mapping possible - continuity will be lost!`);
          }
          state.continuity.domainChangeThisFrame = true;
        }

        // Update prevDomains for next frame comparison
        state.continuity.prevDomains.set(instanceId, newDomain);
        break;
      }

      case 'continuityApply': {
        // Continuity System: Apply continuity policy to field target (spec §5.1)
        const { policy, baseSlot, outputSlot } = step;

        // Get base buffer from materialized values
        const baseBuffer = state.values.objects.get(baseSlot) as ArrayBufferView | undefined;
        if (!baseBuffer) {
          // Base buffer not materialized yet - skip
          // This can happen if the materialize step hasn't run
          break;
        }

        // Skip continuity for non-float buffers (like Uint8ClampedArray colors)
        // Continuity operations require float math; colors need proper float-space handling
        // TODO: Add float-space color continuity support (convert to linear RGB, apply continuity, convert back)
        if (!(baseBuffer instanceof Float32Array)) {
          // Just pass through the base buffer unchanged
          state.values.objects.set(outputSlot, baseBuffer);
          break;
        }

        // Skip if policy is 'none' - no continuity processing needed
        if (policy.kind === 'none') {
          // For 'none' policy, just copy base to output
          state.values.objects.set(outputSlot, baseBuffer);
          break;
        }

        // Ensure output buffer exists (allocate from pool if needed)
        let outputBuffer = state.values.objects.get(outputSlot) as Float32Array | undefined;
        if (!outputBuffer || outputBuffer.length !== baseBuffer.length) {
          // Allocate output buffer with same size as base
          outputBuffer = pool.alloc('f32', baseBuffer.length) as Float32Array;
          state.values.objects.set(outputSlot, outputBuffer);
        }

        // Apply continuity policy (gauge, slew, crossfade, or project)
        applyContinuity(
          step,
          state,
          (slot: ValueSlot) => {
            if (slot === baseSlot) {
              return baseBuffer;
            }
            if (slot === outputSlot) {
              return outputBuffer!;
            }
            const buffer = state.values.objects.get(slot) as Float32Array | undefined;
            if (!buffer) {
              throw new Error(`Continuity: Buffer not found for slot ${slot}`);
            }
            return buffer;
          }
        );
        break;
      }

      default: {
        const _exhaustive: never = step;
        throw new Error(`Unknown step kind: ${(_exhaustive as Step).kind}`);
      }
    }
  }

  // PHASE 2: Execute all stateWrite steps
  // This ensures state reads in Phase 1 saw previous frame's values
  for (const step of steps) {
    if (step.kind === 'stateWrite') {
      // Write to persistent state array
      const value = evaluateSignal(step.value, signals, state);
      state.state[step.stateSlot as number] = value;
    }
  }

  // 3.5 Finalize continuity frame (spec §5.1)
  // Updates time tracking and clears frame-local flags
  finalizeContinuityFrame(state);

  // 4. Build RenderFrameIR
  const frame: RenderFrameIR = {
    version: 1,
    passes,
  };

  // 5. Store frame in output slot (DoD: outputs contract)
  if (program.outputs.length > 0) {
    const outputSpec = program.outputs[0];
    const { storage, slot } = resolveSlotOffset(program, outputSpec.slot);

    if (storage === 'object') {
      // For object storage, use slot as Map key
      state.values.objects.set(slot, frame);
    } else {
      throw new Error(
        `Output slot expects object storage, got ${storage}`
      );
    }

    // 6. Read from outputs[0].slot (DoD: runtime reads from outputs[0].slot)
    const outputFrame = state.values.objects.get(slot);
    if (!outputFrame) {
      throw new Error('Output frame not found in slot');
    }
    return outputFrame as RenderFrameIR;
  }

  // Fallback: no outputs defined (shouldn't happen with proper compilation)
  return frame;
}
