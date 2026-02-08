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
 */

import type { Step, StepEvalValue, StepRender, StepMaterialize, StepContinuityMapBuild, StepContinuityApply, TimeModel, InstanceId, InstanceDecl, ValueSlot, StateMapping, EventSlotId, ScalarSlotDecl, FieldSlotDecl, EvalStrategy, EvalTarget } from '../ir/types';
import type { ValueExpr, ValueExprId } from '../ir/value-expr';
import type { UnlinkedIRFragments } from './lower-blocks';
import type { AcyclicOrLegalGraph, NormalizedEdge, Block, BlockIndex } from '../ir/patches';
import type { TimeModelIR } from '../ir/schedule';
import type { ValueRefPacked } from '../ir/lowerTypes';
import type { TopologyId } from '../../shapes/types';
import { getBlockDefinition } from '../../blocks/registry';
import { getPolicyForSemantic } from '../../runtime/ContinuityDefaults';
import { requireManyInstance, payloadStride, requireInst } from '../../core/canonical-types';
import type { CanonicalType } from '../../core/canonical-types';

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
 * Sprint 3: Step Format Unification
 * - Replaces runtime kind discrimination (evalSig/evalEvent)
 * - Strategy is const enum → inlines to integer constants
 * - No performance overhead vs current string switch
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

/**
 * Find all render blocks in the validated graph.
 */
function findRenderBlocks(
  blocks: readonly Block[]
): Array<{ block: Block; index: BlockIndex }> {
  const result: Array<{ block: Block; index: BlockIndex }> = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const def = getBlockDefinition(block.type);
    if (def?.capability === 'render') {
      result.push({ block, index: i as BlockIndex });
    }
  }

  return result;
}

/**
 * Get the ValueRef for a specific input port of a block.
 * Traces through edges to find the source block's output.
 */
function getInputRef(
  blockIndex: BlockIndex,
  portId: string,
  edges: readonly NormalizedEdge[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>
): ValueRefPacked | undefined {
  // Find edge targeting this block.port
  const edge = edges.find(
    e => e.toBlock === blockIndex && e.toPort === portId
  );

  if (!edge) return undefined;

  // Look up source block's outputs
  const sourceOutputs = blockOutputs.get(edge.fromBlock);
  if (!sourceOutputs) return undefined;

  return sourceOutputs.get(edge.fromPort);
}

/**
 * Target info collected from render blocks.
 * Used to generate materialize → continuity → render chain.
 */
interface RenderTargetInfo {
  instanceId: InstanceId;
  position: { id: ValueExprId; stride: number };
  color: { id: ValueExprId; stride: number };
  scale?: { k: 'sig'; id: ValueExprId };
  shape?:
    | { k: 'sig'; id: ValueExprId }
    | { k: 'field'; id: ValueExprId; stride: number };
}

/**
 * Collect render target info from render blocks.
 * Instance is inferred from the position field, not grabbed blindly.
 */
function isEventExtent(id: ValueExprId, valueExprs: readonly ValueExpr[]): boolean {
  const expr = valueExprs[id as number];
  // New type system: treat explicit ValueExpr kind 'event' as event-extent.
  return !!expr && expr.kind === 'event';
}

function isFieldExtent(id: ValueExprId, valueExprs: readonly ValueExpr[]): boolean {
  const expr = valueExprs[id as number];
  if (!expr) return false;
  if (expr.kind === 'event') return false;

  // Field-extent is defined by having a Many-instance extent.
  try {
    requireManyInstance(expr.type);
    return true;
  } catch {
    return false;
  }
}

function isSignalExpr(id: ValueExprId, valueExprs: readonly ValueExpr[]): boolean {
  const expr = valueExprs[id as number];
  if (!expr) return false;
  if (expr.kind === 'event') return false;

  // If it isn't a field and isn't an event, treat it as signal-extent.
  return !isFieldExtent(id, valueExprs);
}

function asExprValueRef(ref: ValueRefPacked | undefined): { id: ValueExprId; stride: number } | undefined {
  if (!ref) return undefined;
  // ValueRefPacked may be scalar/instance/etc. Only expr-backed refs carry id+stride.
  if (!('id' in ref)) return undefined;
  if (!('stride' in ref)) return undefined;

  const id = (ref as any).id as ValueExprId;
  const stride = (ref as any).stride;
  if (typeof stride !== 'number') return undefined;
  return { id, stride };
}

/**
 * Collect render target info from render blocks.
 *
 * SHAPE LOOKUP (2026-02-04):
 * Shape is no longer extracted from a shape input port. Instead, it's looked up
 * from InstanceDecl.shapeField using the instanceId inferred from the position field.
 *
 * This simplifies wiring - users only need to wire position and color, not shape separately.
 * The shape field reference is stored when the instance is created (e.g., Array block stores
 * elementInput.id as the shapeField when creating the instance).
 *
 * Supports both uniform and heterogeneous shapes:
 * - If InstanceDecl.shapeField points to Signal<shape>: all elements share one shape
 * - If InstanceDecl.shapeField points to Field<shape>: each element can have different shape
 */
function collectRenderTargets(
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>,
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
  valueExprs: readonly ValueExpr[]
): RenderTargetInfo[] {
  const targets: RenderTargetInfo[] = [];
  const renderBlocks = findRenderBlocks(blocks);

  for (const { block, index } of renderBlocks) {
    // Trace inputs through edges to blockOutputs
    const posRef = getInputRef(index, 'pos', edges, blockOutputs);
    const colorRef = getInputRef(index, 'color', edges, blockOutputs);
    const scaleRef = getInputRef(index, 'scale', edges, blockOutputs);
    // Shape input port REMOVED - shape now looked up from InstanceDecl

    const pos = asExprValueRef(posRef);
    const color = asExprValueRef(colorRef);
    const scaleExpr = asExprValueRef(scaleRef);

    // Hard check that pos/color exist and are expr-backed
    if (!pos || !color) {
      continue;
    }

    // Ensure pos/color are fields
    if (!isFieldExtent(pos.id, valueExprs)) continue;
    if (!isFieldExtent(color.id, valueExprs)) continue;

    // Infer instance from position field (not first instance!)
    const instanceId = inferFieldInstanceFromExprs(pos.id, valueExprs);
    if (!instanceId) {
      continue;
    }

    // Look up instance to get shape field reference
    const instanceDecl = instances.get(instanceId);
    if (!instanceDecl) {
      throw new Error(
        `RenderInstances2D: Instance ${instanceId} not found in instances registry. ` +
        `This indicates a compiler bug - instanceId was inferred from position field but instance doesn't exist.`
      );
    }

    if (!instanceDecl.shapeField) {
      throw new Error(
        `RenderInstances2D: Instance ${instanceId} does not have a shapeField. ` +
        `Ensure the instance was created with a shape (e.g., Array block with Ellipse.shape as element).`
      );
    }

    // Build optional scale (uniform signal only - no per-particle scale)
    const scale = scaleExpr && isSignalExpr(scaleExpr.id, valueExprs)
      ? { k: 'sig' as const, id: scaleExpr.id }
      : undefined;

    // Get shape from InstanceDecl.shapeField
    // Determine if it's a field or signal based on the ValueExpr
    const shapeFieldId = instanceDecl.shapeField;
    const shapeExpr = valueExprs[shapeFieldId as number];
    if (!shapeExpr) {
      throw new Error(
        `RenderInstances2D: Shape field ${shapeFieldId} not found in valueExprs. ` +
        `Instance ${instanceId} has invalid shapeField reference.`
      );
    }

    const shapeFieldStride = payloadStride(shapeExpr.type.payload);
    const shape = isFieldExtent(shapeFieldId, valueExprs)
      ? { k: 'field' as const, id: shapeFieldId, stride: shapeFieldStride }
      : { k: 'sig' as const, id: shapeFieldId };

    targets.push({
      instanceId,
      position: { id: pos.id, stride: pos.stride },
      color: { id: color.id, stride: color.stride },
      scale,
      shape,
    });
  }

  return targets;
}

/**
 * Infer instance from a field expression by walking the expression tree.
 * Mirrors IRBuilderImpl.inferFieldInstance() logic.
 */
function inferFieldInstanceFromExprs(
  fieldId: ValueExprId,
  valueExprs: readonly ValueExpr[]
): InstanceId | undefined {
  const expr = valueExprs[fieldId as number];
  if (!expr) return undefined;

  try {
    return requireManyInstance(expr.type).instanceId;
  } catch {
    return undefined;
  }
}

/**
 * Resolve shape info from a signal expression.
 * Returns topologyId, paramSignals, and optional controlPointField with stride if the signal is a shapeRef.
 */
function resolveShapeInfo(
  sigId: ValueExprId,
  valueExprs: readonly ValueExpr[]
):
  | {
      topologyId: TopologyId;
      paramSignals: readonly ValueExprId[];
      controlPointField?: { id: ValueExprId; stride: number };
    }
  | undefined {
  const expr = valueExprs[sigId as number];
  if (!expr) return undefined;
  if (isEventExtent(sigId, valueExprs)) return undefined;

  if (expr.kind === 'shapeRef') {
    // shapeRef field names are owned by the ValueExpr IR. Do not reintroduce legacy tags.
    const topologyId = (expr as any).topologyId as TopologyId;

    const paramSignals = (expr as any).paramArgs as readonly ValueExprId[];
    if (!paramSignals) throw new Error('shapeRef missing paramArgs field — malformed ValueExprShapeRef');

    const cpId = (expr as any).controlPointField as ValueExprId | undefined;
    const controlPointField = cpId !== undefined
      ? (() => {
          const cpExpr = valueExprs[cpId as number];
          const stride = cpExpr ? payloadStride(cpExpr.type.payload) : 1;
          return { id: cpId, stride };
        })()
      : undefined;

    return {
      topologyId,
      paramSignals,
      controlPointField,
    };
  }

  return undefined;
}

/**
 * Build the complete continuity pipeline:
 * 1. ContinuityMapBuild steps (one per instance)
 * 2. Materialize steps (one per field target)
 * 3. ContinuityApply steps (one per target)
 * 4. Render steps (read from output slots)
 *
 * Returns all steps needed for rendering with continuity.
 */
function buildContinuityPipeline(
  targets: RenderTargetInfo[],
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
  valueExprs: readonly ValueExpr[],
  slotAllocator: () => ValueSlot
): {
  mapBuildSteps: StepContinuityMapBuild[];
  materializeSteps: StepMaterialize[];
  continuityApplySteps: StepContinuityApply[];
  renderSteps: StepRender[];
} {
  const mapBuildSteps: StepContinuityMapBuild[] = [];
  const materializeSteps: StepMaterialize[] = [];
  const continuityApplySteps: StepContinuityApply[] = [];
  const renderSteps: StepRender[] = [];

  // Track which instances we've already emitted mapBuild for
  const mapBuildEmitted = new Set<InstanceId>();

  // Track field+semantic → slot mappings to avoid duplicate materializations
  // NOTE: semantic must be part of the key because continuity policy depends on semantic.
  const fieldSlots = new Map<string, { baseSlot: ValueSlot; outputSlot: ValueSlot }>();

  for (const target of targets) {
    const { instanceId, position, color, scale, shape } = target;

    // 1. Emit ContinuityMapBuild for this instance (if not already)
    if (!mapBuildEmitted.has(instanceId)) {
      mapBuildSteps.push({
        kind: 'continuityMapBuild',
        instanceId,
        outputMapping: `mapping_${instanceId}`,
      });
      mapBuildEmitted.add(instanceId);
    }

    // Helper to get or create slots for a field
    const getFieldSlots = (
      fieldId: ValueExprId,
      semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom',
      stride: number
    ): { baseSlot: ValueSlot; outputSlot: ValueSlot } => {
      // Key includes semantic because the continuity policy is semantic-derived.
      const key = `${instanceId}:${semantic}:${fieldId}`;
      let slots = fieldSlots.get(key);
      if (!slots) {
        const baseSlot = slotAllocator();
        const outputSlot = slotAllocator();
        slots = { baseSlot, outputSlot };
        fieldSlots.set(key, slots);

        // 2. Emit Materialize step
        materializeSteps.push({
          kind: 'materialize',
          field: fieldId,
          instanceId,
          target: baseSlot,
        });

        // 3. Emit ContinuityApply step
        const policy = getPolicyForSemantic(semantic);
        const targetKey = `${instanceId}_${semantic}_${fieldId}`;
        continuityApplySteps.push({
          kind: 'continuityApply',
          targetKey,
          instanceId,
          policy,
          baseSlot,
          outputSlot,
          semantic,
          stride,
        });
      }
      return slots;
    };

    // Process position (semantic: position)
    const posSlots = getFieldSlots(position.id, 'position', position.stride);

    // Process color (semantic: color)
    const colorSlots = getFieldSlots(color.id, 'color', color.stride);

    // Process scale (uniform signal only - no per-particle scale)
    let scaleOutput: StepRender['scale'] = undefined;
    if (scale) {
      // Scale is always a signal (uniform)
      scaleOutput = scale;
    }

    // Process shape (semantic: custom) if it's a field or signal
    let shapeOutput: StepRender['shape'] | undefined = undefined;
    let controlPointsOutput: StepRender['controlPoints'] = undefined;

    if (shape) {
      if (shape.k === 'field') {
        const shapeSlots = getFieldSlots(shape.id, 'custom', shape.stride);
        shapeOutput = { k: 'slot', slot: shapeSlots.outputSlot };
      } else {
        // Signal - resolve topology + param signals + control points
        const shapeInfo = resolveShapeInfo(shape.id, valueExprs);
        if (shapeInfo) {
          shapeOutput = {
            k: 'sig',
            topologyId: shapeInfo.topologyId,
            paramSignals: shapeInfo.paramSignals,
          };

          // P5b: If shape has control point field, materialize it
          if (shapeInfo.controlPointField !== undefined) {
            const cpSlots = getFieldSlots(
              shapeInfo.controlPointField.id,
              'custom',
              shapeInfo.controlPointField.stride
            );
            controlPointsOutput = { k: 'slot', slot: cpSlots.outputSlot };
          }
        }
      }
    }

    // Validate shape is present (required by runtime)
    if (!shapeOutput) {
      throw new Error(
        `Render step for instance ${instanceId} requires shape, but shape is undefined. ` +
        `Ensure a shape block (Ellipse, Rect, etc.) is wired to the render pipeline.`
      );
    }

    // 4. Create render step that reads from output slots
    const renderStep: StepRender = {
      kind: 'render',
      instanceId,
      positionSlot: posSlots.outputSlot,
      colorSlot: colorSlots.outputSlot,
      ...(scaleOutput && { scale: scaleOutput }),
      shape: shapeOutput,
      ...(controlPointsOutput && { controlPoints: controlPointsOutput }), // P5c: Add control points to render step
    };

    renderSteps.push(renderStep);
  }

  return { mapBuildSteps, materializeSteps, continuityApplySteps, renderSteps };
}

// =============================================================================
// Pass 7 Entry Point
// =============================================================================

/**
 * Pass 7: Schedule Construction
 *
 * Builds topologically-ordered execution schedule from unlinked IR fragments.
 * Now includes full continuity pipeline:
 * 1. ContinuityMapBuild (domain change detection)
 * 2. Materialize (field evaluation)
 * 3. ContinuityApply (gauge/slew/crossfade)
 * 4. Render (use continuity-applied values)
 *
 * @param unlinkedIR - Block IR fragments from Pass 6
 * @param validated - Validated graph with SCC information
 * @returns Execution schedule with phase ordering
 */
export function pass7Schedule(
  unlinkedIR: UnlinkedIRFragments,
  validated: AcyclicOrLegalGraph
): ScheduleIR {
  // Convert TimeModelIR to TimeModel
  const timeModel: TimeModel = convertTimeModel(validated.timeModel);

  // Get instances from IRBuilder
  const instances = unlinkedIR.builder.getInstances();

  // Create slot allocator - we need to allocate new slots for continuity buffers
  // Start from the current slot count from the builder
  let nextSlot = unlinkedIR.builder.getSlotCount();
  const slotAllocator = (): ValueSlot => {
    return nextSlot++ as ValueSlot;
  };

  // Get expressions for instance inference and shape resolution
  const valueExprs = unlinkedIR.builder.getValueExprs();

  // Collect render targets from render blocks (instance inferred from position field)
  const renderTargets = collectRenderTargets(
    validated.blocks,
    validated.edges,
    unlinkedIR.blockOutputs,
    instances,
    valueExprs
  );

  // Build the complete continuity pipeline
  const {
    mapBuildSteps,
    materializeSteps,
    continuityApplySteps,
    renderSteps,
  } = buildContinuityPipeline(renderTargets, instances, valueExprs, slotAllocator);

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
  // This enables the debug tap to record signal values for the debug probe.
  //
  // NOTE: Only Signal edges support debug probing. Field edges (arrays) use
  // `materialize` steps which don't have a tap point yet. Field visualization
  // requires different treatment (summary stats, spatial view) and is deferred
  // until after the field refactor.
  //
  // See: .agent_planning/debug-probe/README.md
  //
  // Signals that depend on eventRead must be evaluated AFTER events (Phase 5→6).
  // Pre-event signals go in Phase 1, post-event signals go after evalEvent.
  //
  // CRITICAL: Skip slots that are targets of slotWriteStrided steps.
  // Those slots have stride > 1 and are written by the strided write, not evalValue.
  const sigSlots = unlinkedIR.builder.getSigSlots();
  const evalValueStepsPre: Step[] = [];
  const evalValueStepsPost: Step[] = [];
  for (const [sigId, slot] of sigSlots) {
    // Skip slots that are written by slotWriteStrided
    if (stridedWriteSlots.has(slot)) {
      continue;
    }

    const exprId = sigId as ValueExprId;
    const expr = valueExprs[exprId as number];
    if (!expr) continue;

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
    // Other step kinds from builder are ignored (should not exist)
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
    ...mapBuildSteps,
    ...materializeSteps,
    ...continuityApplySteps,
    ...evalEventSteps,
    ...evalValueStepsPost,
    ...renderSteps,
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
