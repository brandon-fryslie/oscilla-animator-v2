/**
 * Pass 7: Schedule Construction
 *
 * Builds execution schedule with explicit phase ordering:
 * 1. Update rails/time inputs
 * 2. Execute continuous scalars (evalValue)
 * 3. Build continuity mappings (continuityMapBuild)
 * 4. Execute continuous fields (materialize)
 * 5. Apply continuity to field targets (continuityApply)
 * 6. Apply discrete ops (events)
 * 7. Sinks (render)
 * 8. State writes (stateWrite)
 *
 * The schedule respects data dependencies within each phase and provides
 * deterministic execution order.
 *
 * [LAW:single-enforcer] This pass is PURE ORDERING — no slot allocation.
 * All slots are allocated by Pass 6 (block lowering) and Pass 6b (continuity pipeline).
 */

import type { Step, StepEvalValue, StepMaterialize, TimeModel, StateMapping, ScalarSlotDecl, FieldSlotDecl, EvalStrategy, EvalTarget } from '../ir/types';
import { SCALAR_INSTANCE_ID, type ValueSlot, type InstanceId } from '../ir/Indices';
import type { ValueExpr, ValueExprId } from '../ir/value-expr';
import type { UnlinkedIRFragments } from './lower-blocks';
import type { AcyclicOrLegalGraph } from '../ir/patches';
import type { TimeModelIR } from '../ir/schedule';
import type { ContinuityPipelineIR } from './continuity-pipeline';
import { requireInst } from '../../core/canonical-types';
import type { CanonicalType } from '../../core/canonical-types';
import type { InstanceDecl } from '../ir/types';

// =============================================================================
// Schedule IR Types
// =============================================================================

/**
 * ScheduleIR - Complete execution schedule
 *
 * Contains everything the runtime needs to execute a frame:
 * - timeModel: Time configuration
 * - instances: Instance declarations (count, layout, etc)
 * - steps: Ordered execution steps
 * - stateSlotCount: Number of persistent state slots
 * - stateMappings: Canonical source for state slot declarations (ScalarSlotDecl | FieldSlotDecl)
 *
 * **Accessing State Slots:**
 * Use `getScalarSlots(schedule)` and `getFieldSlots(schedule)` for typed access to state declarations.
 * These provide the spec-aligned API (ScalarSlotDecl, FieldSlotDecl) while maintaining the
 * implementation's union array (stateMappings).
 *
 * @see ScalarSlotDecl - Type alias for scalar state slots (spec terminology)
 * @see FieldSlotDecl - Type alias for field state slots (spec terminology)
 * @see getScalarSlots - Helper to filter scalar slots
 * @see getFieldSlots - Helper to filter field slots
 * @see design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md §I9
 */
export interface ScheduleIR {
  /** Time model configuration */
  readonly timeModel: TimeModel;

  /** Instance declarations (instance ID → InstanceDecl) */
  readonly instances: ReadonlyMap<InstanceId, InstanceDecl>;

  /** Ordered execution steps */
  readonly steps: readonly Step[];

  /** Number of persistent state slots */
  readonly stateSlotCount: number;

  /**
   * Canonical source for state slot declarations with stable IDs.
   *
   * This array contains both scalar and field state mappings (ScalarSlotDecl | FieldSlotDecl).
   * Each mapping includes:
   * - Stable semantic identity (stateId) for hot-swap migration
   * - Positional slot information (slotIndex/slotStart)
   * - Memory layout (stride, laneCount)
   * - Initial values
   *
   * Use `getScalarSlots()` / `getFieldSlots()` for typed access, or iterate directly:
   *
   * @example
   * ```typescript
   * // Option 1: Typed accessors
   * const scalars = getScalarSlots(schedule);
   * const fields = getFieldSlots(schedule);
   *
   * // Option 2: Direct iteration with discrimination
   * for (const mapping of schedule.stateMappings) {
   *   if (mapping.kind === 'scalar') {
   *     console.log(`Scalar: ${mapping.stateId} at slot ${mapping.slotIndex}`);
   *   } else {
   *     console.log(`Field: ${mapping.stateId}, ${mapping.laneCount} lanes`);
   *   }
   * }
   * ```
   */
  readonly stateMappings: readonly StateMapping[];

  /** Number of event slots (for sizing eventScalars Uint8Array) */
  readonly eventSlotCount: number;

  /** Number of event expressions (for sizing eventPrevPredicate Uint8Array) */
  readonly eventCount: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get scalar state slot declarations from a schedule.
 *
 * Filters the `stateMappings` array to return only scalar (signal cardinality) state slots.
 * This provides the spec-aligned API name while maintaining the single-source-of-truth
 * implementation via the union array.
 *
 * @param schedule - The schedule IR to query
 * @returns Array of scalar state slot declarations
 *
 * @example
 * ```typescript
 * const scalars = getScalarSlots(schedule);
 * scalars.forEach(slot => {
 *   console.log(`Scalar state ${slot.stateId} at slot ${slot.slotIndex}`);
 * });
 * ```
 */
export function getScalarSlots(schedule: ScheduleIR): ScalarSlotDecl[] {
  return schedule.stateMappings.filter((m): m is ScalarSlotDecl => m.kind === 'scalar');
}

/**
 * Get field state slot declarations from a schedule.
 *
 * Filters the `stateMappings` array to return only field (many cardinality) state slots.
 * These represent per-lane state that undergoes continuity-based remapping during hot-swap.
 *
 * @param schedule - The schedule IR to query
 * @returns Array of field state slot declarations
 *
 * @example
 * ```typescript
 * const fields = getFieldSlots(schedule);
 * fields.forEach(slot => {
 *   console.log(`Field state ${slot.stateId} for instance ${slot.instanceId}: ${slot.laneCount} lanes`);
 * });
 * ```
 */
export function getFieldSlots(schedule: ScheduleIR): FieldSlotDecl[] {
  return schedule.stateMappings.filter((m): m is FieldSlotDecl => m.kind === 'field');
}

/**
 * Derive evaluation strategy from CanonicalType at compile time.
 * Pre-resolving strategy avoids runtime type inspection in the hot loop.
 *
 * @param type - Fully resolved canonical type (no vars)
 * @returns Evaluation strategy for executor dispatch
 */
function deriveStrategy(type: CanonicalType): EvalStrategy {
  const temp = requireInst(type.extent.temporality, 'temporality');
  const card = requireInst(type.extent.cardinality, 'cardinality');

  const isDiscrete = temp.kind === 'discrete';
  const isMany = card.kind === 'many';

  if (isDiscrete) {
    return isMany ? 3 /* EvalStrategy.DiscreteField */ : 2 /* EvalStrategy.DiscreteScalar */;
  }
  return isMany ? 1 /* EvalStrategy.ContinuousField */ : 0 /* EvalStrategy.ContinuousScalar */;
}

function isScalarNumericPayload(expr: ValueExpr): boolean {
  const payloadKind = expr.type.payload.kind;
  return payloadKind === 'float' || payloadKind === 'int' || payloadKind === 'bool';
}

function canMaterializeScalarExpr(
  exprId: number,
  valueExprs: readonly ValueExpr[],
  cache: Map<number, boolean>,
  visiting: Set<number>,
): boolean {
  const cached = cache.get(exprId);
  if (cached !== undefined) return cached;
  if (visiting.has(exprId)) {
    cache.set(exprId, false);
    return false;
  }
  visiting.add(exprId);

  const expr = valueExprs[exprId];
  if (!expr) {
    cache.set(exprId, false);
    visiting.delete(exprId);
    return false;
  }

  let result = false;
  switch (expr.kind) {
    case 'const':
    case 'time':
    case 'external':
    case 'state':
    case 'eventRead':
    case 'intrinsic':
      result = true;
      break;
    case 'kernel':
      switch (expr.kernelKind) {
        case 'map':
          result = canMaterializeScalarExpr(expr.input as number, valueExprs, cache, visiting);
          break;
        case 'zip':
          result = expr.inputs.every((id) =>
            canMaterializeScalarExpr(id as number, valueExprs, cache, visiting),
          );
          break;
        case 'reduce':
        case 'zipSig':
        case 'broadcast':
        case 'pathDerivative':
        case 'pathSample':
          result = false;
          break;
      }
      break;
    case 'extract':
      result = canMaterializeScalarExpr(expr.input as number, valueExprs, cache, visiting);
      break;
    case 'construct':
      result = expr.components.every((id) =>
        canMaterializeScalarExpr(id as number, valueExprs, cache, visiting),
      );
      break;
    case 'hslToRgb':
      result = canMaterializeScalarExpr(expr.input as number, valueExprs, cache, visiting);
      break;
    case 'shapeRef':
    case 'event':
      result = false;
      break;
    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown ValueExpr kind during scalar materialize eligibility check: ${(_exhaustive as ValueExpr).kind}`);
    }
  }

  cache.set(exprId, result);
  visiting.delete(exprId);
  return result;
}

// =============================================================================
// Pass 7 Entry Point
// =============================================================================

/**
 * Pass 7: Schedule Construction (pure ordering)
 *
 * Builds topologically-ordered execution schedule from unlinked IR fragments
 * and pre-built continuity pipeline steps.
 *
 * [LAW:single-enforcer] This pass ONLY orders steps. All slot allocation is done by
 * Pass 6 (block lowering) and Pass 6b (continuity pipeline).
 *
 * @param unlinkedIR - Block IR fragments from Pass 6
 * @param validated - Validated graph with SCC information
 * @param continuityPipeline - Pre-built continuity pipeline steps from Pass 6b
 * @returns Execution schedule with phase ordering
 */
export function pass7Schedule(
  unlinkedIR: UnlinkedIRFragments,
  validated: AcyclicOrLegalGraph,
  continuityPipeline: ContinuityPipelineIR
): ScheduleIR {
  // Convert TimeModelIR to TimeModel
  const timeModel: TimeModel = convertTimeModel(validated.timeModel);

  // Get instances from IRBuilder
  const instances = unlinkedIR.builder.getInstances();

  // Get expressions for strategy derivation and event dependency analysis
  const valueExprs = unlinkedIR.builder.getValueExprs();

  // Collect steps from builder (stateWrite steps from stateful blocks)
  const builderSteps = unlinkedIR.builder.getSteps();

  // Collect slots that are targets of slotWriteStrided steps.
  // These slots are written by the strided write step, not evalValue.
  const stridedWriteSlots = new Set<ValueSlot>();
  for (const step of builderSteps) {
    if (step.kind === 'slotWriteStrided') {
      stridedWriteSlots.add(step.slotBase);
    }
  }

  // Generate evalValue steps for all signals with registered slots.
  // Signals that depend on eventRead must be evaluated AFTER events.
  // Pre-event signals go in Phase 1, post-event signals go after evalEvent.
  //
  // CRITICAL: Skip slots that are targets of slotWriteStrided steps.
  // Those slots have stride > 1 and are written by the strided write, not evalValue.
  const sigSlots = unlinkedIR.builder.getSigSlots();
  const evalValueStepsPre: Step[] = [];
  const evalValueStepsPost: Step[] = [];
  const scalarMaterializeStepsPre: StepMaterialize[] = [];
  const scalarMaterializeStepsPost: StepMaterialize[] = [];
  const scalarMaterializeEligibility = new Map<number, boolean>();
  for (const [sigId, slot] of sigSlots) {
    // Skip slots that are written by slotWriteStrided
    if (stridedWriteSlots.has(slot)) {
      continue;
    }

    const exprId = sigId as ValueExprId;
    const expr = valueExprs[exprId as number];
    if (!expr) continue;

    // [LAW:one-source-of-truth] Eligible scalar numeric signal DAGs are migrated to the
    // materializer path via SCALAR_INSTANCE_ID instead of evalValue.
    if (
      isScalarNumericPayload(expr) &&
      canMaterializeScalarExpr(exprId as number, valueExprs, scalarMaterializeEligibility, new Set())
    ) {
      const scalarStep: StepMaterialize = {
        kind: 'materialize',
        field: exprId,
        instanceId: SCALAR_INSTANCE_ID,
        target: slot,
      };
      if (sigDependsOnEvent(sigId as number, valueExprs)) {
        scalarMaterializeStepsPost.push(scalarStep);
      } else {
        scalarMaterializeStepsPre.push(scalarStep);
      }
      continue;
    }

    const strategy = deriveStrategy(expr.type);
    const target: EvalTarget = { storage: 'value', slot };

    const step: StepEvalValue = {
      kind: 'evalValue',
      expr: exprId,
      target,
      strategy,
    };

    if (sigDependsOnEvent(sigId as number, valueExprs)) {
      evalValueStepsPost.push(step);
    } else {
      evalValueStepsPre.push(step);
    }
  }

  // Generate evalValue steps for all registered event slots.
  // Events are evaluated after continuityApply and before render.
  const eventSlots = unlinkedIR.builder.getEventSlots();
  const evalEventSteps: Step[] = [];
  for (const [eventId, eventSlot] of eventSlots) {
    const expr = valueExprs[eventId as number];
    if (!expr) continue;

    const strategy = deriveStrategy(expr.type);
    const target: EvalTarget = { storage: 'event', slot: eventSlot };

    evalEventSteps.push({
      kind: 'evalValue',
      expr: eventId,
      target,
      strategy,
    });
  }

  // Separate builder steps by kind:
  // - slotWriteStrided goes in Phase 1 (with evalValue)
  // - stateWrite/fieldStateWrite goes in Phase 8 (end)
  const slotWriteStridedSteps: Step[] = [];
  const stateWriteSteps: Step[] = [];
  for (const step of builderSteps) {
    if (step.kind === 'slotWriteStrided') {
      slotWriteStridedSteps.push(step);
    } else if (step.kind === 'stateWrite' || step.kind === 'fieldStateWrite') {
      stateWriteSteps.push(step);
    }
  }

  // Combine all steps in correct execution order:
  // 1. EvalValue-pre + SlotWriteStrided (signals NOT dependent on events)
  // 2. ContinuityMapBuild (detect domain changes, compute mappings)
  // 3. Materialize (evaluate fields to buffers)
  // 4. ContinuityApply (apply gauge/slew/crossfade to buffers)
  // 5. EvalEvent (evaluate discrete events → eventScalars)
  // 6. EvalValue-post (signals that depend on eventRead)
  // 7. Render (use continuity-applied buffers)
  // 8. StateWrite (persist state for next frame)
  const steps: Step[] = [
    ...evalValueStepsPre,
    ...slotWriteStridedSteps,
    ...scalarMaterializeStepsPre,
    ...continuityPipeline.mapBuildSteps,
    ...continuityPipeline.materializeSteps,
    ...continuityPipeline.continuityApplySteps,
    ...evalEventSteps,
    ...scalarMaterializeStepsPost,
    ...evalValueStepsPost,
    ...continuityPipeline.renderSteps,
    ...stateWriteSteps,
  ];

  const stateSlotCount = unlinkedIR.builder.getStateSlotCount();
  const stateMappings = unlinkedIR.builder.getStateMappings();

  // Get event counts for runtime allocation
  const eventSlotCount = unlinkedIR.builder.getEventSlotCount();
  const eventCount = unlinkedIR.builder.getValueExprs().filter(e => e.kind === 'event').length;

  return {
    timeModel,
    instances,
    steps,
    stateSlotCount,
    stateMappings,
    eventSlotCount,
    eventCount,
  };
}

/**
 * Check if a signal expression transitively depends on an eventRead.
 * Used to schedule event-dependent signals after event evaluation.
 */
function sigDependsOnEvent(sigId: number, valueExprs: readonly ValueExpr[]): boolean {
  const visited = new Set<number>();

  function check(id: number): boolean {
    if (visited.has(id)) return false;
    visited.add(id);

    const expr = valueExprs[id];
    if (!expr) return false;

    switch (expr.kind) {
      case 'eventRead':
        return true;

      case 'kernel': {
        switch (expr.kernelKind) {
          case 'map':
            return check(expr.input as number);
          case 'zip':
            return expr.inputs.some(input => check(input as number));
          case 'zipSig':
            return (
              check(expr.field as number) ||
              expr.signals.some(sig => check(sig as number))
            );
          case 'broadcast':
            return check(expr.signal as number);
          case 'reduce':
            return check(expr.field as number);
          case 'pathDerivative':
            return check(expr.field as number);
          default:
            return false;
        }
      }

      case 'const':
      case 'time':
      case 'external':
      case 'state':
      case 'shapeRef':
      case 'intrinsic':
      case 'event':
        return false;

      default:
        return false;
    }
  }

  return check(sigId);
}

/**
 * Convert TimeModelIR to TimeModel for schedule.
 */
function convertTimeModel(timeModelIR: TimeModelIR): TimeModel {
  if (timeModelIR.kind === 'finite') {
    return { kind: 'finite', durationMs: timeModelIR.durationMs };
  }
  return {
    kind: 'infinite',
    periodAMs: timeModelIR.periodAMs,
    periodBMs: timeModelIR.periodBMs,
  };
}
