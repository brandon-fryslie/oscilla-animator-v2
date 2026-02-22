/**
 * Pass 7: Schedule Construction
 *
 * Builds execution schedule with explicit phase ordering:
 * 1. Update rails/time inputs
 * 2. Execute cardinality-one values (evalOne/materialize)
 * 3. Build continuity mappings (continuityMapBuild)
 * 4. Execute continuous fields (materialize)
 * 5. Apply continuity to field targets (continuityApply)
 * 6. Apply discrete ops (eventDispatch)
 * 7. Sinks (render)
 * 8. State writes (stateWrite)
 *
 * The schedule respects data dependencies within each phase and provides
 * deterministic execution order.
 *
 * [LAW:single-enforcer] This pass is PURE ORDERING — no slot allocation.
 * All slots are allocated by Pass 6 (block lowering) and Pass 6b (continuity pipeline).
 */

import type { Step, StepEvalOne, StepEvalEvent, StepMaterialize, TimeModel, StateMapping, ScalarSlotDecl, FieldSlotDecl } from '../ir/types';
import { SCALAR_INSTANCE_ID, type InstanceId } from '../ir/Indices';
import type { ValueExpr, ValueExprId } from '../ir/value-expr';
import type { UnlinkedIRFragments } from './lower-blocks';
import type { AcyclicOrLegalGraph } from '../ir/patches';
import type { TimeModelIR } from '../ir/schedule';
import type { ContinuityPipelineIR } from './continuity-pipeline';
import { requireInst } from '../../core/canonical-types';
import type { InstanceDecl } from '../ir/types';
import { payloadStride } from '../../core/canonical-types';

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
 * Filters the `stateMappings` array to return only scalar (one-cardinality) state slots.
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
  return schedule.stateMappings.filter(
    (m): m is ScalarSlotDecl => m.laneCount === 1 && m.instanceId === undefined,
  );
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
  return schedule.stateMappings.filter(
    // [LAW:one-source-of-truth] instanceId carries field-vs-scalar semantics; laneCount may be 1.
    (m): m is FieldSlotDecl => m.instanceId !== undefined,
  );
}

function isArenaScalarPayload(expr: ValueExpr): boolean {
  const payloadKind = expr.type.payload.kind;
  return (
    payloadKind === 'float' ||
    payloadKind === 'int' ||
    payloadKind === 'bool' ||
    payloadKind === 'vec2' ||
    payloadKind === 'vec3' ||
    payloadKind === 'vec4' ||
    payloadKind === 'color'
  );
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
        case 'zipPromote':
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

function validateBroadcastKernelInputs(valueExprs: readonly ValueExpr[]): void {
  for (let exprId = 0; exprId < valueExprs.length; exprId++) {
    const expr = valueExprs[exprId];
    if (!expr || expr.kind !== 'kernel' || expr.kernelKind !== 'broadcast') continue;

    const oneExpr = valueExprs[expr.one as number];
    if (!oneExpr) {
      throw new Error(
        `Schedule invariant violated: broadcast expr ${exprId} references missing source expr ${expr.one}`,
      );
    }

    const oneCard = requireInst(oneExpr.type.extent.cardinality, 'cardinality').kind;
    if (oneCard === 'many') {
      throw new Error(
        `Schedule invariant violated: broadcast expr ${exprId} source expr ${expr.one} is many-cardinality`,
      );
    }

    for (const componentExprId of expr.oneComponents ?? []) {
      const componentExpr = valueExprs[componentExprId as number];
      if (!componentExpr) {
        throw new Error(
          `Schedule invariant violated: broadcast expr ${exprId} references missing component expr ${componentExprId}`,
        );
      }
      const componentCard = requireInst(componentExpr.type.extent.cardinality, 'cardinality').kind;
      if (componentCard === 'many') {
        throw new Error(
          `Schedule invariant violated: broadcast expr ${exprId} component expr ${componentExprId} is many-cardinality`,
        );
      }
    }
  }
}

function validateScalarExtractInputs(
  valueExprs: readonly ValueExpr[],
  scalarRootExprIds: ReadonlySet<number>,
): void {
  const visited = new Set<number>();
  const stack = Array.from(scalarRootExprIds.values());

  while (stack.length > 0) {
    const exprId = stack.pop()!;
    if (visited.has(exprId)) continue;
    visited.add(exprId);

    const expr = valueExprs[exprId];
    if (!expr) {
      throw new Error(`Schedule invariant violated: scalar root references missing expr ${exprId}`);
    }

    switch (expr.kind) {
      case 'const':
      case 'time':
      case 'external':
      case 'state':
      case 'eventRead':
      case 'shapeRef':
      case 'event':
        continue;

      case 'intrinsic': {
        const card = requireInst(expr.type.extent.cardinality, 'cardinality').kind;
        if (card === 'many') {
          // [LAW:single-enforcer] Scalar-evaluation compatibility is enforced once at schedule construction.
          throw new Error(
            `Schedule invariant violated: scalar root depends on field intrinsic expr ${exprId}`,
          );
        }
        continue;
      }

      case 'hslToRgb': {
        throw new Error(
          `Schedule invariant violated: scalar root depends on field-only hslToRgb expr ${exprId}`,
        );
      }

      case 'construct': {
        for (const componentId of expr.components) {
          stack.push(componentId as number);
        }
        continue;
      }

      case 'extract': {
        const inputExprId = expr.input as number;
        const inputExpr = valueExprs[inputExprId];
        if (!inputExpr) {
          throw new Error(
            `Schedule invariant violated: extract expr ${exprId} references missing input expr ${inputExprId}`,
          );
        }

        const inputCard = requireInst(inputExpr.type.extent.cardinality, 'cardinality').kind;
        if (inputCard === 'many') {
          throw new Error(
            `Schedule invariant violated: scalar extract expr ${exprId} input expr ${inputExprId} is many-cardinality`,
          );
        }

        const inputStride = payloadStride(inputExpr.type.payload);
        if (expr.componentIndex < 0 || expr.componentIndex >= inputStride) {
          throw new Error(
            `Schedule invariant violated: extract expr ${exprId} requests component ${expr.componentIndex} but input stride is ${inputStride}`,
          );
        }

        const inputIsAddressable = scalarRootExprIds.has(inputExprId);
        if (!inputIsAddressable && inputExpr.kind !== 'construct') {
          throw new Error(
            `Schedule invariant violated: scalar extract expr ${exprId} input expr ${inputExprId} has no scalar slot mapping`,
          );
        }

        if (!inputIsAddressable && inputExpr.kind === 'construct') {
          const componentExprId = inputExpr.components[expr.componentIndex];
          if (componentExprId === undefined) {
            throw new Error(
              `Schedule invariant violated: extract expr ${exprId} component ${expr.componentIndex} missing in construct expr ${inputExprId}`,
            );
          }
          stack.push(componentExprId as number);
        } else {
          stack.push(inputExprId);
        }
        continue;
      }

      case 'kernel': {
        switch (expr.kernelKind) {
          case 'map':
            stack.push(expr.input as number);
            continue;
          case 'zip':
            for (const inputId of expr.inputs) {
              stack.push(inputId as number);
            }
            continue;
          case 'reduce':
            // [LAW:single-enforcer] Reduce sub-graph evaluation is delegated to executor context.
            continue;
          case 'zipPromote':
          case 'broadcast':
          case 'pathDerivative':
          case 'pathSample':
            throw new Error(
              `Schedule invariant violated: scalar root depends on field-only kernel ${expr.kernelKind} (expr ${exprId})`,
            );
          default: {
            const _exhaustive: never = expr;
            throw new Error(
              `Unknown kernel kind during scalar invariant validation: ${(_exhaustive as ValueExpr).kind}`,
            );
          }
        }
      }

      default: {
        const _exhaustive: never = expr;
        throw new Error(
          `Unknown ValueExpr kind during scalar invariant validation: ${(_exhaustive as ValueExpr).kind}`,
        );
      }
    }
  }
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

  // Generate scalar write steps for all registered cardinality-one slots.
  // Scalar expressions that depend on eventRead must be evaluated AFTER events.
  // Pre-event ones go in Phase 1, post-event ones go after eventDispatch.
  const scalarSlots = unlinkedIR.builder.getScalarSlots();
  const scalarRootExprIds = new Set<number>(scalarSlots.keys());
  const evalOneStepsPre: StepEvalOne[] = [];
  const evalOneStepsPost: StepEvalOne[] = [];
  const scalarMaterializeStepsPre: StepMaterialize[] = [];
  const scalarMaterializeStepsPost: StepMaterialize[] = [];
  const scalarMaterializeEligibility = new Map<number, boolean>();
  for (const [scalarExprId, slot] of scalarSlots) {
    const exprId = scalarExprId as ValueExprId;
    const expr = valueExprs[exprId as number];
    if (!expr) continue;

    if (expr.kind === 'time' && expr.which === 'palette') {
      // [LAW:single-enforcer] Palette slot is authored once by executor pre-frame setup.
      // Do not emit a competing eval/materialize step from ValueExpr scheduling.
      continue;
    }

    // [LAW:one-source-of-truth] Eligible arena-compatible scalar DAGs are migrated to the
    // materializer path via SCALAR_INSTANCE_ID instead of evalValue.
    if (
      isArenaScalarPayload(expr) &&
      canMaterializeScalarExpr(exprId as number, valueExprs, scalarMaterializeEligibility, new Set())
    ) {
      const scalarStep: StepMaterialize = {
        kind: 'materialize',
        field: exprId,
        instanceId: SCALAR_INSTANCE_ID,
        target: slot,
      };
      if (valueExprDependsOnEvent(scalarExprId as number, valueExprs)) {
        scalarMaterializeStepsPost.push(scalarStep);
      } else {
        scalarMaterializeStepsPre.push(scalarStep);
      }
      continue;
    }

    const step: StepEvalOne = {
      kind: 'evalOne',
      expr: exprId,
      target: slot,
    };

    if (valueExprDependsOnEvent(scalarExprId as number, valueExprs)) {
      evalOneStepsPost.push(step);
    } else {
      evalOneStepsPre.push(step);
    }
  }

  // [LAW:single-enforcer] Schedule construction is the single compile-time boundary
  // that validates ValueExpr runtime invariants before execution.
  validateBroadcastKernelInputs(valueExprs);
  validateScalarExtractInputs(valueExprs, scalarRootExprIds);

  // Generate eventDispatch steps for all registered event slots.
  // Events are evaluated after continuityApply and before render.
  const eventSlots = unlinkedIR.builder.getEventSlots();
  const eventDispatchSteps: StepEvalEvent[] = [];
  for (const [eventId, eventSlot] of eventSlots) {
    const expr = valueExprs[eventId as number];
    if (!expr) continue;

    eventDispatchSteps.push({
      kind: 'eventDispatch',
      expr: eventId,
      target: eventSlot,
    });
  }

  // Separate builder steps by kind:
  // - stateWrite/fieldStateWrite goes in Phase 8 (end)
  const stateWriteSteps: Step[] = [];
  for (const step of builderSteps) {
    if (step.kind === 'stateWrite' || step.kind === 'fieldStateWrite') {
      stateWriteSteps.push(step);
    }
  }

  // Combine all steps in correct execution order:
  // 1. EvalOne-pre (ones NOT dependent on events)
  // 2. ContinuityMapBuild (detect domain changes, compute mappings)
  // 3. Materialize (evaluate fields to buffers)
  // 4. ContinuityApply (apply gauge/slew/crossfade to buffers)
  // 5. EvalEvent (evaluate discrete events → eventScalars)
  // 6. EvalOne-post (ones that depend on eventRead)
  // 7. Render (use continuity-applied buffers)
  // 8. StateWrite (persist state for next frame)
  const steps: Step[] = [
    ...evalOneStepsPre,
    ...scalarMaterializeStepsPre,
    ...continuityPipeline.mapBuildSteps,
    ...continuityPipeline.materializeSteps,
    ...continuityPipeline.continuityApplySteps,
    ...eventDispatchSteps,
    ...scalarMaterializeStepsPost,
    ...evalOneStepsPost,
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
 * Check if a value expression transitively depends on an eventRead.
 * Used to schedule event-dependent cardinality-one values after event evaluation.
 */
function valueExprDependsOnEvent(valueExprId: number, valueExprs: readonly ValueExpr[]): boolean {
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
          case 'zipPromote':
            return (
              check(expr.field as number) ||
              expr.ones.some(sig => check(sig as number))
            );
          case 'broadcast':
            return check(expr.one as number);
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

  return check(valueExprId);
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
