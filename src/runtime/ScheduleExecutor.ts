/**
 * Schedule Executor - Core Frame Execution Loop
 *
 * Executes the IR program schedule step-by-step to produce a frame.
 * Simplified for v2 - pure IR path, no legacy complexity.
 */

import type { CompiledProgramIR, ValueSlot, FieldSlotEntry } from '../compiler/ir/program';
import type { ScheduleIR } from '../compiler/passes-v2/pass7-schedule';
import type { Step, InstanceDecl, DomainInstance, StepRender } from '../compiler/ir/types';
import type { SigExprId, IrInstanceId as InstanceId } from '../types';
import type { RuntimeState } from './RuntimeState';
import type { BufferPool } from './BufferPool';
import type { TopologyId } from '../shapes/types';
import type { RenderFrameIR } from '../render/types';
import { resolveTime } from './timeResolution';
import { materialize } from './Materializer';
import { evaluateSignal } from './SignalEvaluator';
import { evaluateEvent } from './EventEvaluator';
import { writeShape2D } from './RuntimeState';
import { detectDomainChange } from './ContinuityMapping';
import { applyContinuity, finalizeContinuityFrame } from './ContinuityApply';
import { createStableDomainInstance, createUnstableDomainInstance } from './DomainIdentity';
import { assembleRenderFrame, type AssemblerContext, type CameraParams } from './RenderAssembler';

/**
 * Slot lookup cache entry
 */
interface SlotLookup {
  storage: 'f64' | 'f32' | 'i32' | 'u32' | 'object' | 'shape2d';
  offset: number;
  slot: ValueSlot;
}

/**
 * Execute one frame of the program
 *
 * @param program - Compiled IR program (CompiledProgramIR)
 * @param state - Runtime state
 * @param pool - Buffer pool
 * @param tAbsMs - Absolute time in milliseconds
 * @param camera - Optional camera params for projection (viewer-level, not compiled state)
 * @returns RenderFrameIR for this frame
 */
export function executeFrame(
  program: CompiledProgramIR,
  state: RuntimeState,
  pool: BufferPool,
  tAbsMs: number,
  camera?: CameraParams,
): RenderFrameIR {
  // Extract schedule components
  const schedule = program.schedule as ScheduleIR;
  const timeModel = schedule.timeModel;
  const instances = schedule.instances;
  const steps = schedule.steps;

  // C-16: Pre-compute slot lookup map to eliminate O(n*m) runtime dispatch
  // Build once per frame (could be cached on program object for even better performance)
  const slotLookupMap = new Map<ValueSlot, SlotLookup>();
  for (const meta of program.slotMeta) {
    slotLookupMap.set(meta.slot, {
      storage: meta.storage,
      offset: meta.offset,
      slot: meta.slot,
    });
  }

  // Helper: Resolve slot to storage offset using pre-computed map (O(1) lookup)
  const resolveSlotOffset = (slot: ValueSlot): SlotLookup => {
    const lookup = slotLookupMap.get(slot);
    if (!lookup) {
      throw new Error(`Slot ${slot} not found in slotMeta`);
    }
    return lookup;
  };

  // 1. Advance frame (cache owns frameId)
  state.cache.frameId++;

  // 2. Resolve effective time
  const time = resolveTime(tAbsMs, timeModel, state.timeState);
  state.time = time;

  // 2.5. Clear event scalars (events fire for exactly one tick, spec §6.1)
  state.eventScalars.fill(0);

  // Store palette color object in objects map for signal evaluation
  // Use a reserved slot number for palette (slot 0 is reserved for time palette)
  const PALETTE_SLOT = 0 as ValueSlot;
  state.values.objects.set(PALETTE_SLOT, time.palette);

  // 3. Execute schedule steps in TWO PHASES
  // Phase 1: Execute evalSig, materialize, render (skip stateWrite)
  // Phase 2: Execute all stateWrite steps
  // This ensures state reads see previous frame's values

  // Get dense arrays from program
  const signals = program.signalExprs.nodes;
  const fields = program.fieldExprs.nodes;

  // Create AssemblerContext once (used for v2 frame assembly after Phase 1)
  const assemblerContext: AssemblerContext = {
    signals,
    instances: instances as ReadonlyMap<string, InstanceDecl>,
    state,
    camera,
  };

  // Collect render steps for v2 batch assembly
  const renderSteps: StepRender[] = [];

  // PHASE 1: Execute all non-stateWrite steps
  for (const step of steps) {
    switch (step.kind) {
      case 'evalSig': {
        // Evaluate signal and store in slot using slotMeta.offset
        const { storage, offset, slot } = resolveSlotOffset(step.target);

        if (storage === 'shape2d') {
          // Shape signal: write Shape2D record to shape2d bank
          const exprNode = signals[step.expr as number];
          if (exprNode.kind === 'shapeRef') {
            writeShape2D(state.values.shape2d, offset, {
              topologyId: exprNode.topologyId,
              pointsFieldSlot: (exprNode.controlPointField as number) ?? 0,
              pointsCount: 0,
              styleRef: 0,
              flags: 0,
            });
          }
        } else if (storage === 'f64') {
          const value = evaluateSignal(step.expr, signals, state);
          state.values.f64[offset] = value;

          // Debug tap: Record slot value (Sprint 1: Debug Probe)
          state.tap?.recordSlotValue?.(slot, value);

          // Cache the result
          state.cache.sigValues[step.expr as number] = value;
          state.cache.sigStamps[step.expr as number] = state.cache.frameId;
        } else {
          throw new Error(`evalSig: unsupported storage type '${storage}'`);
        }
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

        // Debug tap: Record field value
        state.tap?.recordFieldValue?.(step.target, buffer);
        break;
      }

      case 'render': {
        // Collect render steps for v2 batch assembly (after Phase 1)
        renderSteps.push(step);
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
          // Store mapping (may be null for crossfade fallback)
          if (mapping) {
            state.continuity.mappings.set(instanceId, mapping);
          } else {
            // No mapping possible - crossfade will handle it
            state.continuity.mappings.delete(instanceId);
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

      case 'evalEvent': {
        // Evaluate event expression and write to eventScalars (monotone OR)
        // Monotone OR: only write 1, never write 0 back — ensures any-fired-stays-fired
        const fired = evaluateEvent(
          step.expr,
          program.eventExprs.nodes,
          state,
          signals
        );
        if (fired) {
          state.eventScalars[step.target as number] = 1;
        }
        break;
      }

      case 'fieldStateWrite': {
        // Per-lane state write is handled in PHASE 2 (after all reads complete)
        break;
      }

      default: {
        const _exhaustive: never = step;
        throw new Error(`Unknown step kind: ${(_exhaustive as Step).kind}`);
      }
    }
  }

  // PHASE 1.5: Demand-driven field materialization for debug tracking
  // Materialize any tracked field slots that weren't already written by the render pipeline
  if (state.tap) {
    const trackedSlots = state.tap.getTrackedFieldSlots?.();
    if (trackedSlots && trackedSlots.size > 0) {
      for (const slot of trackedSlots) {
        // Skip if already materialized by the render pipeline
        if (state.values.objects.has(slot)) {
          // Already written - just ensure debug tap is notified
          const existing = state.values.objects.get(slot);
          if (existing instanceof Float32Array) {
            state.tap.recordFieldValue?.(slot, existing);
          }
          continue;
        }

        // Look up field expression info from registry
        const entry = program.fieldSlotRegistry.get(slot);
        if (!entry) continue;

        // Materialize the field on demand
        const buffer = materialize(
          entry.fieldId,
          entry.instanceId as unknown as string,
          fields,
          signals,
          instances as ReadonlyMap<string, InstanceDecl>,
          state,
          pool
        );

        // Store in objects map and notify debug tap
        state.values.objects.set(slot, buffer);
        state.tap.recordFieldValue?.(slot, buffer);
      }
    }
  }

  // Build v2 frame from collected render steps
  const frame = assembleRenderFrame(renderSteps, assemblerContext);

  // PHASE 2: Execute all stateWrite steps
  // This ensures state reads in Phase 1 saw previous frame's values
  for (const step of steps) {
    if (step.kind === 'stateWrite') {
      // Write to persistent state array
      const value = evaluateSignal(step.value, signals, state);
      state.state[step.stateSlot as number] = value;
    }
    if (step.kind === 'fieldStateWrite') {
      // Per-lane state write: evaluate field and write each lane
      // Get the field expression to find the instance
      const expr = fields[step.value as number];
      if (!expr) continue;

      // Determine count from the field expression's instance
      let count = 0;
      if ('instanceId' in expr && expr.instanceId) {
        const instanceDecl = instances.get(expr.instanceId as unknown as InstanceId);
        count = instanceDecl && typeof instanceDecl.count === 'number' ? instanceDecl.count : 0;
      }
      if (count === 0) continue;

      // Materialize the field to get values - use a string instanceId from the expression
      const instanceIdStr = 'instanceId' in expr ? String(expr.instanceId) : '';
      const tempBuffer = materialize(
        step.value,
        instanceIdStr,
        fields,
        signals,
        instances as ReadonlyMap<string, InstanceDecl>,
        state,
        pool
      );

      // Write each lane to state
      const baseSlot = step.stateSlot as number;
      const src = tempBuffer as Float32Array;
      for (let i = 0; i < count && i < src.length; i++) {
        state.state[baseSlot + i] = src[i];
      }
    }
  }

  // 3.5 Finalize continuity frame (spec §5.1)
  // Updates time tracking and clears frame-local flags
  finalizeContinuityFrame(state);

  // 5. Store frame in output slot (DoD: outputs contract)
  if (program.outputs.length > 0) {
    const outputSpec = program.outputs[0];
    const { storage, slot } = resolveSlotOffset(outputSpec.slot);

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
