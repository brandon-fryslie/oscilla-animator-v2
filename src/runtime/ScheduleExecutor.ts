/**
 * Schedule Executor - Core Frame Execution Loop
 *
 * Executes the IR program schedule step-by-step to produce a frame.
 * Simplified for v2 - pure IR path, no legacy complexity.
 */

import type { CompiledProgramIR, ValueSlot, FieldSlotEntry } from '../compiler/ir/program';
import type { ScheduleIR } from '../compiler/backend/schedule-program';
import type { Step, InstanceDecl, DomainInstance, StepRender } from '../compiler/ir/types';
import type { SigExprId, IrInstanceId as InstanceId } from '../types';
import type { RuntimeState } from './RuntimeState';
import type { TopologyId } from '../shapes/types';
import type { RenderFrameIR } from '../render/types';
import type { RenderBufferArena } from '../render/RenderBufferArena';
import { BufferPool } from './BufferPool';
import { resolveTime } from './timeResolution';
import { materialize } from './Materializer';
import { evaluateSignal } from './SignalEvaluator';
import { evaluateEvent } from './EventEvaluator';
import { writeShape2D } from './RuntimeState';
import { detectDomainChange } from './ContinuityMapping';
import { applyContinuity, finalizeContinuityFrame } from './ContinuityApply';
import { createStableDomainInstance, createUnstableDomainInstance } from './DomainIdentity';
import { assembleRenderFrame, type AssemblerContext } from './RenderAssembler';
import { resolveCameraFromGlobals } from './CameraResolver';

/**
 * Slot lookup cache entry
 */
interface SlotLookup {
  storage: 'f64' | 'f32' | 'i32' | 'u32' | 'object' | 'shape2d';
  offset: number;
  stride: number;
  slot: ValueSlot;
}

// Cache slot lookup tables per compiled program to avoid per-frame Map allocation.
const SLOT_LOOKUP_CACHE = new WeakMap<CompiledProgramIR, Map<ValueSlot, SlotLookup>>();

// Module-level pool for Materializer buffers.
// These buffers are CACHED in RuntimeState.cache.fieldBuffers and reused across frames,
// so they don't need arena semantics. The pool grows once and then stabilizes.
const MATERIALIZER_POOL = new BufferPool();

function getSlotLookupMap(program: CompiledProgramIR): Map<ValueSlot, SlotLookup> {
  const cached = SLOT_LOOKUP_CACHE.get(program);
  if (cached) return cached;
  const map = new Map<ValueSlot, SlotLookup>();
  for (const meta of program.slotMeta) {
    if (meta.stride == null) {
      throw new Error(`slotMeta missing required stride for slot ${meta.slot}`);
    }
    map.set(meta.slot, {
      storage: meta.storage,
      offset: meta.offset,
      stride: meta.stride,
      slot: meta.slot,
    });
  }
  SLOT_LOOKUP_CACHE.set(program, map);
  return map;
}

function assertSlotExists(slotLookupMap: Map<ValueSlot, SlotLookup>, slot: ValueSlot, what: string): SlotLookup {
  const lookup = slotLookupMap.get(slot);
  if (!lookup) throw new Error(`Missing slotMeta entry for ${what} (slot ${slot})`);
  return lookup;
}

function assertF64Stride(
  slotLookupMap: Map<ValueSlot, SlotLookup>,
  slot: ValueSlot,
  expectedStride: number,
  what: string,
): SlotLookup {
  const lookup = assertSlotExists(slotLookupMap, slot, what);
  if (lookup.storage !== 'f64') {
    throw new Error(`${what} must be f64 storage, got ${lookup.storage}`);
  }
  if (lookup.stride !== expectedStride) {
    throw new Error(`${what} must have stride=${expectedStride}, got ${lookup.stride}`);
  }
  return lookup;
}

function writeF64Scalar(state: RuntimeState, lookup: SlotLookup, value: number): void {
  if (lookup.storage !== 'f64') {
    throw new Error(`writeF64Scalar: expected f64 storage for slot ${lookup.slot}, got ${lookup.storage}`);
  }
  if (lookup.stride !== 1) {
    throw new Error(`writeF64Scalar: expected stride=1 for slot ${lookup.slot}, got stride=${lookup.stride}`);
  }
  state.values.f64[lookup.offset] = value;
}

function writeF64Strided(state: RuntimeState, lookup: SlotLookup, src: ArrayLike<number>, stride: number): void {
  if (lookup.storage !== 'f64') {
    throw new Error(`writeF64Strided: expected f64 storage for slot ${lookup.slot}, got ${lookup.storage}`);
  }
  if (lookup.stride !== stride) {
    throw new Error(`writeF64Strided: expected stride=${stride} for slot ${lookup.slot}, got ${lookup.stride}`);
  }
  const o = lookup.offset;
  for (let i = 0; i < stride; i++) {
    state.values.f64[o + i] = src[i] as number;
  }
}

/**
 * Execute one frame of the program
 *
 * @param program - Compiled IR program (CompiledProgramIR)
 * @param state - Runtime state
 * @param arena - Pre-allocated buffer arena for render operations
 * @param tAbsMs - Absolute time in milliseconds
 * @returns RenderFrameIR for this frame
 */
export function executeFrame(
  program: CompiledProgramIR,
  state: RuntimeState,
  arena: RenderBufferArena,
  tAbsMs: number,
): RenderFrameIR {
  // Extract schedule components
  const schedule = program.schedule as ScheduleIR;
  const timeModel = schedule.timeModel;
  const instances = schedule.instances;
  const steps = schedule.steps;

  // C-16: Pre-compute slot lookup map to eliminate O(n*m) runtime dispatch
  // Use module-level cache for slot lookup tables.
  const slotLookupMap = getSlotLookupMap(program);

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

  // 1.5. Commit external channel writes (spec: External Input System Section 3.1)
  state.externalChannels.commit();

  // 2. Resolve effective time
  const time = resolveTime(tAbsMs, timeModel, state.timeState);
  state.time = time;

  // 2.5. Clear event scalars and payloads (events fire for exactly one tick, spec §6.1)
  state.eventScalars.fill(0);

  // Clear event payload arrays (spec-compliant event storage)
  // Monotone OR semantics: clear at frame start, only append during frame
  state.events.forEach((payloads) => {
    payloads.length = 0; // Clear array but reuse allocation
  });

  // === System-reserved time outputs ===
  // These are part of the runtime contract: they are written deterministically from resolved time each frame.
  // Slot allocation/stride is enforced via slotMeta; no runtime-only side channels.
  const TIME_PALETTE_SLOT = 0 as ValueSlot;
  if (!(time.palette instanceof Float32Array) || time.palette.length !== 4) {
    throw new Error('time.palette must be Float32Array(4) in RGBA [0..1]');
  }
  const palette = assertF64Stride(slotLookupMap, TIME_PALETTE_SLOT, 4, 'time.palette slot');
  writeF64Strided(state, palette, time.palette, 4);

  // ═══════════════════════════════════════════════════════════════════════════
  // TWO-PHASE EXECUTION MODEL
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Phase 1 (below): Evaluate all signals, materialize fields, fire events,
  //                  collect render ops. Reads state from PREVIOUS frame.
  // Phase 2 (line ~464): Write new state values for NEXT frame.
  //
  // This separation is NON-NEGOTIABLE. It ensures:
  // - Stateful blocks (UnitDelay, Lag, etc.) maintain proper delay semantics
  // - Cycles only cross frame boundaries via state (invariant I7)
  // - All signals see consistent state within a frame
  // - Hot-swap can migrate state without corruption
  //
  // See: docs/runtime/execution-model.md for full rationale and examples.
  // ═══════════════════════════════════════════════════════════════════════════

  // Get dense arrays from program
  const signals = program.signalExprs.nodes;
  const fields = program.fieldExprs.nodes;

  // Resolve camera from program render globals (will be populated after signal evaluation)
  // Note: assemblerContext is constructed after Phase 1 when slots are populated
  let assemblerContext: AssemblerContext;

  // Collect render steps for v2 batch assembly
  const renderSteps: StepRender[] = [];

  // PHASE 1: Execute all non-stateWrite steps
  for (const step of steps) {
    switch (step.kind) {
      case 'evalSig': {
        // Evaluate signal and store in slot using slotMeta.offset
        const lookup = resolveSlotOffset(step.target);
        const { storage, offset, slot, stride } = lookup;

        if (storage === 'shape2d') {
          // Shape signal: write Shape2D record to shape2d bank
          const exprNode = signals[step.expr as number];
          if (exprNode.kind === 'shapeRef') {
            writeShape2D(state.values.shape2d, offset, {
              topologyId: exprNode.topologyId,
              pointsFieldSlot: exprNode.controlPointField?.id as number ?? 0,
              pointsCount: 0,
              styleRef: 0,
              flags: 0,
            });
          }
        } else if (storage === 'f64') {
          if (stride !== 1) {
            throw new Error(`evalSig: expected stride=1 for scalar signal slot ${slot}, got stride=${stride}`);
          }
          const value = evaluateSignal(step.expr, signals, state);
          writeF64Scalar(state, lookup, value);

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

      case 'slotWriteStrided': {
        // P2: Execute strided slot write
        // Evaluate each component signal and write to contiguous slots
        const lookup = resolveSlotOffset(step.slotBase);
        const { storage, offset, stride } = lookup;

        if (storage !== 'f64') {
          throw new Error(`slotWriteStrided: expected f64 storage for slot ${step.slotBase}, got ${storage}`);
        }

        if (step.inputs.length !== stride) {
          throw new Error(
            `slotWriteStrided: inputs.length (${step.inputs.length}) must equal stride (${stride}) for slot ${step.slotBase}`
          );
        }

        // Evaluate each component and write sequentially
        for (let i = 0; i < step.inputs.length; i++) {
          const componentValue = evaluateSignal(step.inputs[i], signals, state);
          state.values.f64[offset + i] = componentValue;

          // Debug tap: Record slot value for each component
          state.tap?.recordSlotValue?.((step.slotBase + i) as ValueSlot, componentValue);
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
          MATERIALIZER_POOL
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

        // Continuity ops are currently only implemented for Float32 fields.
        // Non-float buffers (e.g., Uint8ClampedArray for color) pass through unchanged.
        if (!(baseBuffer instanceof Float32Array)) {
          state.values.objects.set(outputSlot, baseBuffer);
          break;
        }

        // Skip if policy is 'none' - no continuity processing needed
        if (policy.kind === 'none') {
          // For 'none' policy, just copy base to output
          state.values.objects.set(outputSlot, baseBuffer);
          break;
        }

        // Ensure output buffer exists (allocate from Materializer pool if needed)
        let outputBuffer = state.values.objects.get(outputSlot) as Float32Array | undefined;
        if (!outputBuffer || outputBuffer.length !== baseBuffer.length) {
          // Allocate output buffer with same size as base
          outputBuffer = MATERIALIZER_POOL.alloc('f32', baseBuffer.length) as Float32Array;
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
          if (existing) {
            state.tap.recordFieldValue?.(slot, existing as any);
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
          MATERIALIZER_POOL
        );

        // Store in objects map and notify debug tap
        state.values.objects.set(slot, buffer);
        state.tap.recordFieldValue?.(slot, buffer);
      }
    }
  }

  // Resolve camera from program render globals (slots now populated by signal evaluation)
  const resolvedCamera = resolveCameraFromGlobals(program, state);

  // Build assembler context with resolved camera and arena
  assemblerContext = {
    signals,
    instances: instances as ReadonlyMap<string, InstanceDecl>,
    state,
    resolvedCamera,
    arena,
  };

  // Build v2 frame from collected render steps (zero allocations - uses arena)
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
        MATERIALIZER_POOL
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
