/**
 * Schedule Executor - Core Frame Execution Loop
 *
 * Executes the IR program schedule step-by-step to produce a frame.
 * Simplified for v2 - pure IR path, no legacy complexity.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ScheduleIR } from '../compiler/backend/schedule-program';
import type { Step, InstanceDecl, DomainInstance, StepRender } from '../compiler/ir/types';
import type { IrInstanceId as InstanceId } from '../types';
import { instanceId as makeInstanceId } from '../core/ids';
import type { RuntimeState } from './RuntimeState';
import type { RenderFrameIR } from '../render/types';
import type { RenderBufferArena } from '../render/RenderBufferArena';
import { resolveTime } from './timeResolution';
import { writeShape2D } from './RuntimeState';
import {
  MATERIALIZER_POOL,
  renderStepsBuffer as _renderSteps,
  shapeRecord as _shapeRecord,
  assemblerCtx as _assemblerCtx,
} from './executor-init';
import { detectDomainChange } from './ContinuityMapping';
import { applyContinuity, finalizeContinuityFrame } from './ContinuityApply';
import { createStableDomainInstance, createUnstableDomainInstance } from './DomainIdentity';
import { assembleRenderFrame, type AssemblerContext } from './RenderAssembler';
import { resolveCameraFromGlobals } from './CameraResolver';
import { requireManyInstance } from '../core/canonical-types';
import type { ValueSlot } from '../compiler/ir/Indices';
import { SYSTEM_PALETTE_SLOT } from '../compiler/ir/Indices';
import { evaluateValueExprScalar, evaluateConstructScalar } from './ValueExprSignalEvaluator';
import { evaluateValueExprEvent } from './ValueExprEventEvaluator';
import { materializeValueExpr } from './ValueExprMaterializer';
import { arenaSlice, type ArenaSlotDescriptor } from './ArenaValueStore';
import {
  type SlotLookup,
  getExprAddressTable,
  assertF64Stride,
} from './ExprAddressTable';

// [LAW:one-source-of-truth] Arena is the canonical numeric store.
// slotToArena comes from ExprAddressTable — no direct program.arenaLayout accesses here.
function resolveArenaDescriptor(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  lookup: SlotLookup,
): ArenaSlotDescriptor {
  const arenaDesc = slotToArena.get(lookup.slot);
  if (!arenaDesc) {
    throw new Error(`resolveArenaDescriptor: missing arena descriptor for numeric slot ${lookup.slot}`);
  }
  return arenaDesc;
}

function resolveNumericBuffer(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  slot: ValueSlot,
): Float32Array {
  const arenaDesc = slotToArena.get(slot);
  if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
    throw new Error('resolveNumericBuffer: missing arena descriptor for numeric slot ' + slot);
  }
  if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
    throw new Error(
      'resolveNumericBuffer: arena too small for slot ' +
        slot +
        ' (need ' +
        (arenaDesc.offset + arenaDesc.length) +
        ', have ' +
        state.arena.length +
        ')',
    );
  }
  return arenaSlice(state.arena, arenaDesc);
}

function ensureOutputBuffer(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  slot: ValueSlot,
  length: number,
): Float32Array {
  const arenaDesc = slotToArena.get(slot);
  if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
    throw new Error('ensureOutputBuffer: missing arena descriptor for numeric slot ' + slot);
  }
  if (arenaDesc.length < length) {
    throw new Error(
      'ensureOutputBuffer: arena descriptor too small for slot ' +
        slot +
        ' (need length ' +
        length +
        ', have ' +
        arenaDesc.length +
        ')',
    );
  }
  if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
    throw new Error(
      'ensureOutputBuffer: arena too small for slot ' +
        slot +
        ' (need ' +
        (arenaDesc.offset + arenaDesc.length) +
        ', have ' +
        state.arena.length +
        ')',
    );
  }
  return arenaSlice(state.arena, arenaDesc);
}

function writeArenaScalar(slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>, state: RuntimeState, lookup: SlotLookup, value: number): void {
  if (lookup.storage !== 'f64') {
    throw new Error('writeArenaScalar: expected f64-class storage for slot ' + lookup.slot + ', got ' + lookup.storage);
  }
  if (lookup.stride !== 1) {
    throw new Error('writeArenaScalar: expected stride=1 for slot ' + lookup.slot + ', got stride=' + lookup.stride);
  }
  const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);
  state.arena[arenaDesc.offset] = value;
}

function writeArenaStrided(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  lookup: SlotLookup,
  src: ArrayLike<number>,
  stride: number,
): void {
  if (lookup.storage !== 'f64') {
    throw new Error('writeArenaStrided: expected f64-class storage for slot ' + lookup.slot + ', got ' + lookup.storage);
  }
  if (lookup.stride !== stride) {
    throw new Error('writeArenaStrided: expected stride=' + stride + ' for slot ' + lookup.slot + ', got ' + lookup.stride);
  }
  const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);
  const o = arenaDesc.offset;
  for (let i = 0; i < stride; i++) {
    state.arena[o + i] = src[i] as number;
  }
}

function readCanonicalNumeric(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  state: RuntimeState,
  lookup: SlotLookup,
  component: number = 0,
): number {
  const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);
  return state.arena[arenaDesc.offset + component];
}

// Module-level helper: resolve slot to storage offset (hoisted to avoid per-frame closure)
function resolveSlotOffsetFromMap(slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>, slot: ValueSlot): SlotLookup {
  const lookup = slotLookupMap.get(slot);
  if (!lookup) {
    throw new Error('Slot ' + slot + ' not found in slotMeta');
  }
  return lookup;
}

// Module-level callback for events.forEach (hoisted to avoid per-frame closure)
function _clearEventPayloads(payloads: unknown[]): void {
  payloads.length = 0;
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

  // [LAW:one-source-of-truth] Single address table for all slot/expr/field queries.
  // slotToArena replaces all direct program.arenaLayout[slot] accesses in this file.
  const addressTable = getExprAddressTable(program);
  const { slotLookup: slotLookupMap, fieldExprToSlot, slotToArena } = addressTable;

  // Helper uses module-level resolveSlotOffsetFromMap() — no closure needed

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
  state.events.forEach(_clearEventPayloads);

  // === System-reserved time outputs ===
  // These are part of the runtime contract: they are written deterministically from resolved time each frame.
  // Slot allocation/stride is enforced via slotMeta; no runtime-only side channels.
  const TIME_PALETTE_SLOT = SYSTEM_PALETTE_SLOT;
  if (!(time.palette instanceof Float32Array) || time.palette.length !== 4) {
    throw new Error('time.palette must be Float32Array(4) in RGBA [0..1]');
  }
  const palette = assertF64Stride(slotLookupMap, TIME_PALETTE_SLOT, 4, 'time.palette slot');
  writeArenaStrided(slotToArena, state, palette, time.palette, 4);

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

  // Unified ValueExpr table (signals/fields/events live here)
  const valueExprs = program.valueExprs.nodes;

  // Resolve camera from program render globals (will be populated after signal evaluation)
  // Note: assemblerContext is constructed after Phase 1 when slots are populated
  let assemblerContext: AssemblerContext;

  // Collect render steps for v2 batch assembly (reuse module-level array)
  _renderSteps.length = 0;

  // [LAW:one-source-of-truth] Populate scalarExprToArenaOffset before Phase 1 so extract
  // reads multi-component signals from arena using canonical ExprAddressTable offsets.
  state.cache.scalarExprToArenaOffset = addressTable.scalarExprToArenaOffset;

  // PHASE 1: Execute all non-stateWrite steps
  for (const step of steps) {
    switch (step.kind) {
      case 'evalValue': {
        // Unified value evaluation with strategy-based dispatch (Sprint 3)
        // Strategy is pre-resolved at compile time to avoid runtime type inspection
        const strategy = step.strategy;
        
        if (strategy === 0 /* EvalStrategy.ContinuousScalar */ || strategy === 1 /* EvalStrategy.ContinuousField */) {
          // Continuous path (signals) - was evalSig
          if (step.target.storage !== 'value') {
            throw new Error('evalValue: ContinuousScalar/Field requires value storage, got ' + step.target.storage);
          }
          
          const targetSlot = step.target.slot;
          const lookup = resolveSlotOffsetFromMap(slotLookupMap,targetSlot);
          const { storage, offset, slot, stride } = lookup;

          if (storage === 'shape2d') {
            // Shape signal: write Shape2D record to shape2d bank
            const veId = step.expr;
            const exprNode = valueExprs[veId as number];
            if (exprNode.kind === 'shapeRef') {
              // Resolve control point field slot (avoid IIFE closure)
              let cpFieldSlot = 0;
              if (exprNode.controlPointField != null) {
                const cpSlot = fieldExprToSlot.get(exprNode.controlPointField as number);
                if (cpSlot === undefined) throw new Error('Control point field ' + exprNode.controlPointField + ' not in fieldExprToSlot — compiler bug');
                cpFieldSlot = cpSlot;
              }
              // Write shape record — populate reusable record fields
              _shapeRecord.topologyId = exprNode.topologyId;
              _shapeRecord.pointsFieldSlot = cpFieldSlot;
              _shapeRecord.pointsCount = 0;
              _shapeRecord.styleRef = 0;
              _shapeRecord.flags = 0;
              writeShape2D(state.values.shape2d, offset, _shapeRecord);
            }
          } else if (storage === 'f64') {
            // Check if this is a multi-component construct expression
            const exprNode = valueExprs[step.expr as number];

            if (stride > 1 && exprNode?.kind === 'construct') {
              // Multi-component signal: use construct evaluator to write all components
              const arenaDesc = resolveArenaDescriptor(slotToArena, lookup);
              const written = evaluateConstructScalar(
                exprNode,
                valueExprs,
                state,
                state.arena,
                arenaDesc.offset,
              );

              if (written !== stride) {
                throw new Error(
                  'evalValue: construct wrote ' + written + ' components but slot stride is ' + stride
                );
              }
              // Debug tap: Record each component value
              for (let i = 0; i < stride; i++) {
                state.tap?.recordSlotValue?.((slot + i) as ValueSlot, readCanonicalNumeric(slotToArena, state, lookup, i));
              }

              // Cache first component (for backward compatibility)
              state.cache.values[step.expr as number] = readCanonicalNumeric(slotToArena, state, lookup, 0);
              state.cache.stamps[step.expr as number] = state.cache.frameId;
            } else if (stride === 1) {
              // Scalar signal: evaluate and write single value
              const value = evaluateValueExprScalar(step.expr as any, program.valueExprs.nodes, state);

              writeArenaScalar(slotToArena, state, lookup, value);

              // Debug tap: Record slot value (Sprint 1: Debug Probe)
              state.tap?.recordSlotValue?.(slot, value);

              // Cache (indexed by expr id). Under Option B these ids are ValueExprIds.
              state.cache.values[step.expr as number] = value;
              state.cache.stamps[step.expr as number] = state.cache.frameId;
            } else {
              // stride>1 but not construct - invalid
              throw new Error(
                'evalValue: stride=' + stride + ' slot ' + slot + ' requires construct expression, got ' + (exprNode ? exprNode.kind : 'unknown')
              );
            }
          } else {
            throw new Error('evalValue: unsupported storage type \'' + storage + '\' for slot ' + slot + ' expr ' + step.expr + ' strategy ' + strategy);
          }
        } else if (strategy === 2 /* EvalStrategy.DiscreteScalar */ || strategy === 3 /* EvalStrategy.DiscreteField */) {
          // Discrete path (events) - was evalEvent
          if (step.target.storage !== 'event') {
            throw new Error('evalValue: DiscreteScalar/Field requires event storage, got ' + step.target.storage);
          }
          
          // ValueExpr-only event evaluation (cutover complete)
          const fired = evaluateValueExprEvent(step.expr as any, program.valueExprs, state, program);

          // Monotone OR: only write 1, never write 0 back — ensures any-fired-stays-fired
          if (fired) {
            state.eventScalars[step.target.slot as number] = 1;
          }
        } else {
          throw new Error('evalValue: unknown strategy ' + strategy);
        }
        break;
      }

      case 'materialize': {
        // ValueExpr-only materialization (cutover complete)
        const veId = step.field;

        // Use the instanceId from the schedule step (set by schedule-program.ts)
        // rather than deriving from the ValueExpr type, which may have a stale placeholder
        const instanceDecl = instances.get(step.instanceId);
        const count = instanceDecl && typeof instanceDecl.count === 'number' ? instanceDecl.count : 0;
        // [LAW:one-source-of-truth] Arena lookup via ExprAddressTable — no direct arenaLayout access.
        const arenaDesc = slotToArena.get(step.target);
        if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) {
          throw new Error('materialize: missing arena descriptor for slot ' + step.target);
        }
        if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
          throw new Error(
            'materialize: arena too small for slot ' +
              step.target +
              ' (need ' +
              (arenaDesc.offset + arenaDesc.length) +
              ', have ' +
              state.arena.length +
              ')',
          );
        }
        const arenaTarget = arenaSlice(state.arena, arenaDesc);

        const buffer = materializeValueExpr(
          veId,
          program.valueExprs,
          step.instanceId,
          count,
          state,
          program,
          MATERIALIZER_POOL,
          arenaTarget,
        );

        // Debug tap: Record field value
        state.tap?.recordFieldValue?.(step.target, buffer);
        break;
      }

      case 'render': {
        // Collect render steps for v2 batch assembly (after Phase 1)
        _renderSteps.push(step);
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

        // Resolve base/output through arena first (canonical numeric storage), with object fallback.
        const baseBuffer = resolveNumericBuffer(slotToArena, state, baseSlot);

        const outputBuffer = baseSlot === outputSlot
          ? baseBuffer
          : ensureOutputBuffer(slotToArena, state, outputSlot, baseBuffer.length);

        applyContinuity(step, state, (slot) => {
          if (slot === baseSlot) return baseBuffer;
          if (slot === outputSlot) return outputBuffer;
          const buffer = resolveNumericBuffer(slotToArena, state, slot);
          if (!buffer) throw new Error('Continuity: Buffer not found for slot ' + slot);
          return buffer;
        });
        state.tap?.recordFieldValue?.(outputSlot, outputBuffer);
        break;
      }



      case 'fieldStateWrite': {
        // Per-lane state write is handled in PHASE 2 (after all reads complete)
        break;
      }

      default: {
        const _exhaustive: never = step;
        throw new Error('Unknown step kind: ' + (_exhaustive as Step).kind);
      }
    }
  }

  // PHASE 1.5: Demand-driven field materialization for debug tracking
  // Materialize any tracked field slots that weren't already written by the render pipeline
  if (state.tap) {
    const trackedSlots = state.tap.getTrackedFieldSlots?.();
    if (trackedSlots && trackedSlots.size > 0) {
      for (const slot of trackedSlots) {
        const arenaDesc = slotToArena.get(slot);
        if (arenaDesc && arenaDesc.offset >= 0 && arenaDesc.length > 0) {
          if (state.arena.length < arenaDesc.offset + arenaDesc.length) {
            throw new Error(
              'debug tracked slot arena too small for slot ' +
                slot +
                ' (need ' +
                (arenaDesc.offset + arenaDesc.length) +
                ', have ' +
                state.arena.length +
                ')',
            );
          }
          state.tap.recordFieldValue?.(slot, arenaSlice(state.arena, arenaDesc));
          continue;
        }

        const existing = state.values.objects.get(slot);
        if (existing !== undefined) {
          state.tap.recordFieldValue?.(slot, existing as any);
          continue;
        }

        throw new Error('debug tracked slot has neither arena descriptor nor object payload for slot ' + slot);
      }
    }
  }

  // Resolve camera from program render globals (slots now populated by signal evaluation)
  const resolvedCamera = resolveCameraFromGlobals(program, state);

  // Build assembler context with resolved camera and arena
  // Populate reusable module-level context to avoid per-frame object literal
  _assemblerCtx.instances = instances as ReadonlyMap<string, InstanceDecl>;
  _assemblerCtx.state = state;
  _assemblerCtx.resolvedCamera = resolvedCamera;
  _assemblerCtx.arena = arena;
  _assemblerCtx.scalarExprToArenaOffset = state.cache.scalarExprToArenaOffset!;
  _assemblerCtx.slotToArena = addressTable.slotToArena;
  assemblerContext = _assemblerCtx as AssemblerContext;

  // Build v2 frame from collected render steps (zero allocations - uses arena)
  const frame = assembleRenderFrame(_renderSteps, assemblerContext);

  // PHASE 2: Execute all stateWrite steps
  // This ensures state reads in Phase 1 saw previous frame's values
  for (const step of steps) {
    if (step.kind === 'stateWrite') {
      // Write to persistent state array using ValueExpr evaluation
      const value = evaluateValueExprScalar(step.value as any, program.valueExprs.nodes, state);
      state.state[step.stateSlot as number] = value;
    }
    if (step.kind === 'fieldStateWrite') {
      // Per-lane state write: evaluate field and write each lane
      const veId = step.value as any;
      const exprNode = valueExprs[veId as number];

      // Determine count from the ValueExpr's instance (via type)
      const instanceRef = requireManyInstance(exprNode.type);
      const instanceDecl = instances.get(instanceRef.instanceId);
      const count = instanceDecl && typeof instanceDecl.count === 'number' ? instanceDecl.count : 0;
      if (count === 0) continue;

      // Materialize the field to get values using ValueExpr materializer
      const instanceIdStr = String(instanceRef.instanceId);

      const tempBuffer = materializeValueExpr(
        veId,
        program.valueExprs,
        makeInstanceId(instanceIdStr),
        count,
        state,
        program,
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

  // Release all materializer pool buffers back to the pool for reuse next frame.
  // At this point all materialized buffers have been consumed into arena/state.
  MATERIALIZER_POOL.releaseAll();

  // 3.5 Finalize continuity frame (spec §5.1)
  // Updates time tracking and clears frame-local flags
  finalizeContinuityFrame(state);

  // 5. Store frame in output slot (DoD: outputs contract)
  if (program.outputs.length > 0) {
    const outputSpec = program.outputs[0];
    const { storage, slot } = resolveSlotOffsetFromMap(slotLookupMap,outputSpec.slot);

    if (storage === 'object') {
      // For object storage, use slot as Map key
      state.values.objects.set(slot, frame);
    } else {
      throw new Error(
        'Output slot expects object storage, got ' + storage
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
