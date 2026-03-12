/**
 * Pass 7: Schedule Construction
 *
 * Builds execution schedule with explicit phase ordering:
 * 1. Update rails/time inputs
 * 2. Execute cardinality-one values (materialize)
 * 3. Execute render-field materialization
 * 4. Apply discrete ops (eventDispatch)
 * 5. Sinks (render)
 * 6. State writes (stateWrite)
 *
 * The schedule respects data dependencies within each phase and provides
 * deterministic execution order.
 *
 * [LAW:single-enforcer] This pass is PURE ORDERING — no slot allocation.
 * All slots are allocated by Pass 6 (block lowering) and Pass 6b (render materialization pipeline).
 */

import type {
  Step,
  StepEvalEvent,
  StepMaterialize,
  TimeModel,
  StateMapping,
  ScalarSlotDecl,
  FieldSlotDecl,
} from '../ir/types';
import { SCALAR_INSTANCE_ID, type InstanceId } from '../ir/Indices';
import type { ValueExpr, ValueExprId } from '../ir/value-expr';
import type { UnlinkedIRFragments } from './lower-blocks';
import type { AcyclicOrLegalGraph } from '../ir/patches';
import type { RenderMaterializationPipelineIR } from './render-materialization-pipeline';
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

  /** Number of event expressions in the ValueExpr table (runtime metadata). */
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

const ARENA_SCALAR_PAYLOAD_KINDS = new Set([
  'float',
  'int',
  'bool',
  'vec2',
  'vec3',
  'vec4',
  'color',
  'shape',
  'cameraProjection',
]);

function isArenaScalarPayload(expr: ValueExpr): boolean {
  return ARENA_SCALAR_PAYLOAD_KINDS.has(expr.type.payload.kind);
}

function canMaterializeScalarKernelExpr(
  expr: Extract<ValueExpr, { kind: 'kernel' }>,
  valueExprs: readonly ValueExpr[],
  cache: Map<number, boolean>,
  visiting: Set<number>,
): boolean {
  switch (expr.kernelKind) {
    case 'map':
      return canMaterializeScalarExpr(expr.input as number, valueExprs, cache, visiting);
    case 'zip':
      return expr.inputs.every((id) =>
        canMaterializeScalarExpr(id as number, valueExprs, cache, visiting),
      );
    case 'reduce':
      return true;
    case 'zipPromote':
    case 'broadcast':
    case 'pathDerivative':
    case 'pathSample':
      return false;
    default: {
      const _exhaustive: never = expr;
      throw new Error(
        `Unknown kernel kind during scalar materialize eligibility check: ${(_exhaustive as ValueExpr).kind}`,
      );
    }
  }
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

  const result = (() => {
    switch (expr.kind) {
      case 'const':
      case 'time':
      case 'external':
      case 'state':
      case 'eventRead':
      case 'intrinsic':
      case 'shapeRef':
        return true;
      case 'event':
        return false;
      case 'kernel':
        return canMaterializeScalarKernelExpr(expr, valueExprs, cache, visiting);
      case 'extract':
        return canMaterializeScalarExpr(expr.input as number, valueExprs, cache, visiting);
      case 'construct':
        return expr.components.every((id) =>
          canMaterializeScalarExpr(id as number, valueExprs, cache, visiting),
        );
      case 'oklchToRgb':
        return canMaterializeScalarExpr(expr.input as number, valueExprs, cache, visiting);
      default: {
        const _exhaustive: never = expr;
        throw new Error(
          `Unknown ValueExpr kind during scalar materialize eligibility check: ${(_exhaustive as ValueExpr).kind}`,
        );
      }
    }
  })();

  cache.set(exprId, result);
  visiting.delete(exprId);
  return result;
}

function validateBroadcastComponentExpr(
  broadcastExprId: number,
  componentExprId: number,
  valueExprs: readonly ValueExpr[],
): void {
  const componentExpr = valueExprs[componentExprId as number];
  if (!componentExpr) {
    throw new Error(
      `Schedule invariant violated: broadcast expr ${broadcastExprId} references missing component expr ${componentExprId}`,
    );
  }
  const componentCard = requireInst(componentExpr.type.extent.cardinality, 'cardinality').kind;
  if (componentCard === 'many') {
    throw new Error(
      `Schedule invariant violated: broadcast expr ${broadcastExprId} component expr ${componentExprId} is many-cardinality`,
    );
  }
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
      validateBroadcastComponentExpr(exprId, componentExprId as number, valueExprs);
    }
  }
}

function validateScalarIntrinsic(
  exprId: number,
  expr: Extract<ValueExpr, { kind: 'intrinsic' }>,
): void {
  const card = requireInst(expr.type.extent.cardinality, 'cardinality').kind;
  if (card === 'many') {
    // [LAW:single-enforcer] Scalar-evaluation compatibility is enforced once at schedule construction.
    throw new Error(
      `Schedule invariant violated: scalar root depends on field intrinsic expr ${exprId}`,
    );
  }
}

function validateScalarExtractExpr(
  exprId: number,
  expr: Extract<ValueExpr, { kind: 'extract' }>,
  valueExprs: readonly ValueExpr[],
  scalarRootExprIds: ReadonlySet<number>,
  stack: number[],
): void {
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

  if (inputIsAddressable) {
    stack.push(inputExprId);
    return;
  }
  if (inputExpr.kind !== 'construct') {
    throw new Error(
      `Schedule invariant violated: scalar extract expr ${exprId} input expr ${inputExprId} has no scalar construct source`,
    );
  }

  const componentExprId = inputExpr.components[expr.componentIndex];
  if (componentExprId === undefined) {
    throw new Error(
      `Schedule invariant violated: extract expr ${exprId} component ${expr.componentIndex} missing in construct expr ${inputExprId}`,
    );
  }
  stack.push(componentExprId as number);
}

function validateScalarKernelExpr(
  exprId: number,
  expr: Extract<ValueExpr, { kind: 'kernel' }>,
  stack: number[],
): void {
  switch (expr.kernelKind) {
    case 'map':
      stack.push(expr.input as number);
      return;
    case 'zip':
      for (const inputId of expr.inputs) {
        stack.push(inputId as number);
      }
      return;
    case 'reduce':
      // [LAW:single-enforcer] Reduce sub-graph evaluation is delegated to executor context.
      return;
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

function validateScalarExpr(
  exprId: number,
  expr: ValueExpr,
  valueExprs: readonly ValueExpr[],
  scalarRootExprIds: ReadonlySet<number>,
  stack: number[],
): void {
  switch (expr.kind) {
    case 'const':
    case 'time':
    case 'external':
    case 'state':
    case 'eventRead':
    case 'shapeRef':
    case 'event':
      return;
    case 'intrinsic':
      validateScalarIntrinsic(exprId, expr);
      return;
    case 'oklchToRgb':
      throw new Error(
        `Schedule invariant violated: scalar root depends on field-only oklchToRgb expr ${exprId}`,
      );
    case 'construct':
      for (const componentId of expr.components) {
        stack.push(componentId as number);
      }
      return;
    case 'extract':
      validateScalarExtractExpr(exprId, expr, valueExprs, scalarRootExprIds, stack);
      return;
    case 'kernel':
      validateScalarKernelExpr(exprId, expr, stack);
      return;
    default: {
      const _exhaustive: never = expr;
      throw new Error(
        `Unknown ValueExpr kind during scalar invariant validation: ${(_exhaustive as ValueExpr).kind}`,
      );
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
    validateScalarExpr(exprId, expr, valueExprs, scalarRootExprIds, stack);
  }
}

// =============================================================================
// Pass 7 Entry Point
// =============================================================================

/**
 * Pass 7: Schedule Construction (pure ordering)
 *
 * Builds topologically-ordered execution schedule from unlinked IR fragments
 * and pre-built render materialization steps.
 *
 * [LAW:single-enforcer] This pass ONLY orders steps. All slot allocation is done by
 * Pass 6 (block lowering) and Pass 6b (render materialization pipeline).
 *
 * @param unlinkedIR - Block IR fragments from Pass 6
 * @param validated - Validated graph with SCC information
 * @param renderMaterializationPipeline - Pre-built render materialization steps from Pass 6b
 * @returns Execution schedule with phase ordering
 */
export function pass7Schedule(
  unlinkedIR: UnlinkedIRFragments,
  validated: AcyclicOrLegalGraph,
  renderMaterializationPipeline: RenderMaterializationPipelineIR
): ScheduleIR {
  // [LAW:one-source-of-truth] Time model authority is the IR builder schedule
  // emitted by block lowering effects (not pass-threaded metadata).
  const timeModel: TimeModel = unlinkedIR.builder.getSchedule();

  // Get instances from IRBuilder
  const instances = unlinkedIR.builder.getInstances();

  // Get expressions for strategy derivation and event dependency analysis
  const valueExprs = unlinkedIR.builder.getValueExprs();

  // Collect steps from builder (stateWrite steps from stateful blocks)
  const builderSteps = unlinkedIR.builder.getSteps();

  const { scalarMaterializeSteps, scalarRootExprIds } = buildScalarMaterializeSteps(
    unlinkedIR.builder,
    valueExprs,
  );
  const {
    pre: scalarMaterializeStepsPre,
    post: scalarMaterializeStepsPost,
  } = splitEventDependentMaterializeSteps(scalarMaterializeSteps, valueExprs);

  // [LAW:single-enforcer] Schedule construction is the single compile-time boundary
  // that validates ValueExpr runtime invariants before execution.
  validateBroadcastKernelInputs(valueExprs);
  validateScalarExtractInputs(valueExprs, scalarRootExprIds);

  // Generate eventDispatch steps for all registered event slots.
  // Events are evaluated after materialization and before render.
  const eventDispatchSteps = collectEventDispatchSteps(unlinkedIR.builder, valueExprs);
  const stateWriteSteps = collectStateWriteSteps(builderSteps);

  // [LAW:one-source-of-truth] Event-dependent field materializations are split
  // here using canonical ValueExpr dependency analysis so runtime never reads
  // stale pre-dispatch event scalars for field slots.
  const {
    pre: renderMaterializeStepsPre,
    post: renderMaterializeStepsPost,
  } = splitEventDependentMaterializeSteps(renderMaterializationPipeline.materializeSteps, valueExprs);

  // Combine all steps in correct execution order:
  // 1. Materialize-pre (ones/fields NOT dependent on events)
  // 2. Render materialize-pre (fields independent of events)
  // 3. EvalEvent (evaluate discrete events -> eventScalars)
  // 4. Materialize-post (ones that depend on eventRead)
  // 5. Render materialize-post (event-dependent fields)
  // 6. Render
  // 7. StateWrite (persist state for next frame)
  const steps = buildOrderedScheduleSteps({
    scalarPre: scalarMaterializeStepsPre,
    renderPre: renderMaterializeStepsPre,
    eventDispatch: eventDispatchSteps,
    scalarPost: scalarMaterializeStepsPost,
    renderPost: renderMaterializeStepsPost,
    renderSteps: renderMaterializationPipeline.renderSteps,
    stateWriteSteps,
  });

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

function buildScalarMaterializeSteps(
  builder: UnlinkedIRFragments['builder'],
  valueExprs: readonly ValueExpr[],
): {
  scalarMaterializeSteps: StepMaterialize[];
  scalarRootExprIds: Set<number>;
} {
  const scalarSlots = builder.getScalarSlots();
  const scalarRootExprIds = new Set<number>(scalarSlots.keys());
  const scalarMaterializeEligibility = new Map<number, boolean>();
  const scalarMaterializeSteps: StepMaterialize[] = [];

  for (const [scalarExprId, target] of scalarSlots) {
    const exprId = scalarExprId as ValueExprId;
    const expr = valueExprs[exprId as number];
    if (!expr) continue;

    const canMaterialize =
      isArenaScalarPayload(expr) &&
      canMaterializeScalarExpr(exprId as number, valueExprs, scalarMaterializeEligibility, new Set());
    if (!canMaterialize) {
      // [LAW:no-silent-fallbacks] Legacy evalOne scheduling is removed; scalar
      // paths must compile through canonical materialize lowering or fail.
      throw new Error(
        `Schedule invariant violated: scalar expr ${String(exprId)} (${expr.kind}) requires deprecated evalOne fallback`,
      );
    }
    scalarMaterializeSteps.push({
      kind: 'materialize',
      field: exprId,
      instanceId: SCALAR_INSTANCE_ID,
      target,
    });
  }

  return { scalarMaterializeSteps, scalarRootExprIds };
}

function collectEventDispatchSteps(
  builder: UnlinkedIRFragments['builder'],
  valueExprs: readonly ValueExpr[],
): StepEvalEvent[] {
  const eventDispatchSteps: StepEvalEvent[] = [];
  for (const [eventId, target] of builder.getEventSlots()) {
    const expr = valueExprs[eventId as number];
    if (!expr) continue;
    eventDispatchSteps.push({
      kind: 'eventDispatch',
      expr: eventId,
      target,
    });
  }
  return eventDispatchSteps;
}

function collectStateWriteSteps(builderSteps: readonly Step[]): Step[] {
  return builderSteps.filter(
    (step) => step.kind === 'stateWrite' || step.kind === 'fieldStateWrite',
  );
}

function splitEventDependentMaterializeSteps(
  materializeSteps: readonly StepMaterialize[],
  valueExprs: readonly ValueExpr[],
): { pre: StepMaterialize[]; post: StepMaterialize[] } {
  const pre: StepMaterialize[] = [];
  const post: StepMaterialize[] = [];
  for (const step of materializeSteps) {
    if (valueExprDependsOnEvent(step.field as number, valueExprs)) {
      post.push(step);
    } else {
      pre.push(step);
    }
  }
  return { pre, post };
}

function buildOrderedScheduleSteps(args: {
  readonly scalarPre: readonly StepMaterialize[];
  readonly renderPre: readonly StepMaterialize[];
  readonly eventDispatch: readonly StepEvalEvent[];
  readonly scalarPost: readonly StepMaterialize[];
  readonly renderPost: readonly StepMaterialize[];
  readonly renderSteps: readonly Step[];
  readonly stateWriteSteps: readonly Step[];
}): Step[] {
  // [LAW:dataflow-not-control-flow] Canonical schedule executes all stages in
  // fixed order; stage inputs may be empty.
  return [
    ...args.scalarPre,
    ...args.renderPre,
    ...args.eventDispatch,
    ...args.scalarPost,
    ...args.renderPost,
    ...args.renderSteps,
    ...args.stateWriteSteps,
  ];
}
