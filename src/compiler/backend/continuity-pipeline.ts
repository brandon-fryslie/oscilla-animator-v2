/**
 * Pass 6b: Continuity Pipeline Allocation
 *
 * Analyzes render targets and allocates continuity pipeline slots through
 * the IRBuilder. This sub-pass runs after block lowering (pass 6) and before
 * schedule construction (pass 7).
 *
 * Responsibilities:
 * - Render target analysis (which fields need materialization)
 * - Continuity slot allocation via builder (no shadow allocator)
 * - Building pre-resolved pipeline steps (mapBuild, materialize, continuityApply, render)
 *
 * Pass 7 consumes the output and only orders steps — it never allocates.
 *
 * [LAW:single-enforcer] All slot allocation goes through IRBuilder.allocTypedSlot().
 * [LAW:one-source-of-truth] fieldExprToRefSlot reuses binding-pass slots so debug index
 * and runtime reference the same slot.
 */

import type { StepRender, StepMaterialize, StepContinuityMapBuild, StepContinuityApply, InstanceDecl } from '../ir/types';
import type { InstanceId, ValueSlot } from '../ir/Indices';
import type { ValueExpr, ValueExprId } from '../ir/value-expr';
import type { UnlinkedIRFragments } from './lower-blocks';
import type { AcyclicOrLegalGraph, NormalizedEdge, BlockIndex } from '../ir/patches';
import type { CompilerGraphBlock } from '../ir/CompilerGraph';
import type { ValueRefPacked } from '../ir/lowerTypes';
import { isExprRef } from '../ir/lowerTypes';
import type { TopologyId } from '../../shapes/types';
import { getBlockDefinition } from '../../blocks/registry';
import { getPolicyForSemantic } from '../../runtime/ContinuityDefaults';
import { requireManyInstance, payloadStride } from '../../core/canonical-types';
import type { CanonicalType } from '../../core/canonical-types';

// =============================================================================
// Public Interface
// =============================================================================

/**
 * Output of pass 6b — pre-built continuity pipeline steps with all slots resolved.
 *
 * Pass 7 consumes these arrays and only determines execution ordering.
 */
export interface ContinuityPipelineIR {
  /** ContinuityMapBuild steps (one per instance with render targets) */
  readonly mapBuildSteps: readonly StepContinuityMapBuild[];
  /** Materialize steps (one per unique field+semantic) */
  readonly materializeSteps: readonly StepMaterialize[];
  /** ContinuityApply steps (one per unique field+semantic) */
  readonly continuityApplySteps: readonly StepContinuityApply[];
  /** Render steps (one per render block) */
  readonly renderSteps: readonly StepRender[];
}

// =============================================================================
// Render Target Analysis (pure helpers, moved from schedule-program.ts)
// =============================================================================

/**
 * Target info collected from render blocks.
 * Used to generate materialize → continuity → render chain.
 */
interface RenderTargetInfo {
  renderBlockId: string;
  instanceId: InstanceId;
  controlPoints: { id: ValueExprId; stride: number };
  color: { id: ValueExprId; stride: number };
  scale?:
    | { k: 'one'; id: ValueExprId }
    | { k: 'field'; id: ValueExprId; stride: number };
  shape?:
    | { k: 'one'; id: ValueExprId }
    | { k: 'field'; id: ValueExprId; stride: number };
}

/**
 * Find all render blocks in the validated graph.
 */
function findRenderBlocks(
  blocks: readonly CompilerGraphBlock[]
): Array<{ block: CompilerGraphBlock; index: BlockIndex }> {
  const result: Array<{ block: CompilerGraphBlock; index: BlockIndex }> = [];

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
  const edge = edges.find(
    e => e.toBlock === blockIndex && e.toPort === portId
  );

  if (!edge) return undefined;

  const sourceOutputs = blockOutputs.get(edge.fromBlock);
  if (!sourceOutputs) return undefined;

  return sourceOutputs.get(edge.fromPort);
}

function asExprValueRef(ref: ValueRefPacked | undefined): { id: ValueExprId; stride: number } | undefined {
  if (!ref) return undefined;
  if (!('id' in ref)) return undefined;
  if (!('stride' in ref)) return undefined;

  const id = (ref as any).id as ValueExprId;
  const stride = (ref as any).stride;
  if (typeof stride !== 'number') return undefined;
  return { id, stride };
}

function isEventExtent(id: ValueExprId, valueExprs: readonly ValueExpr[]): boolean {
  const expr = valueExprs[id as number];
  return !!expr && expr.kind === 'event';
}

function isFieldExtent(id: ValueExprId, valueExprs: readonly ValueExpr[]): boolean {
  const expr = valueExprs[id as number];
  if (!expr) return false;
  if (expr.kind === 'event') return false;

  try {
    requireManyInstance(expr.type);
    return true;
  } catch {
    return false;
  }
}

function isCardinalityOneExpr(id: ValueExprId, valueExprs: readonly ValueExpr[]): boolean {
  const expr = valueExprs[id as number];
  if (!expr) return false;
  if (expr.kind === 'event') return false;

  return !isFieldExtent(id, valueExprs);
}

/**
 * Infer instance from a field expression by walking the expression tree.
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
 * Resolve shape info from a cardinality-one expression.
 * Returns topologyId, paramExprs, and optional controlPointField with stride.
 */
function resolveShapeInfo(
  shapeExprId: ValueExprId,
  valueExprs: readonly ValueExpr[]
):
  | {
      topologyId: TopologyId;
      paramExprs: readonly ValueExprId[];
      controlPointField?: { id: ValueExprId; stride: number };
    }
  | undefined {
  const expr = valueExprs[shapeExprId as number];
  if (!expr) return undefined;
  if (isEventExtent(shapeExprId, valueExprs)) return undefined;

  if (expr.kind === 'shapeRef') {
    const topologyId = (expr as any).topologyId as TopologyId;

    const paramExprs = (expr as any).paramArgs as readonly ValueExprId[];
    if (!paramExprs) throw new Error('shapeRef missing paramArgs field — malformed ValueExprShapeRef');

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
      paramExprs,
      controlPointField,
    };
  }

  return undefined;
}

/**
 * Collect render target info from render blocks.
 *
 * SHAPE LOOKUP (2026-02-04):
 * Shape is no longer extracted from a shape input port. Instead, it's looked up
 * from InstanceDecl.shapeField using the instanceId inferred from the controlPoints field.
 */
function collectRenderTargets(
  blocks: readonly CompilerGraphBlock[],
  edges: readonly NormalizedEdge[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>,
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
  valueExprs: readonly ValueExpr[]
): RenderTargetInfo[] {
  const targets: RenderTargetInfo[] = [];
  const renderBlocks = findRenderBlocks(blocks);

  for (const { block, index } of renderBlocks) {
    const controlPointsRef = getInputRef(index, 'controlPoints', edges, blockOutputs);
    const colorRef = getInputRef(index, 'color', edges, blockOutputs);
    const scaleRef = getInputRef(index, 'scale', edges, blockOutputs);

    const controlPoints = asExprValueRef(controlPointsRef);
    const color = asExprValueRef(colorRef);
    const scaleExpr = asExprValueRef(scaleRef);

    if (!controlPoints || !color) {
      continue;
    }

    if (!isFieldExtent(controlPoints.id, valueExprs)) continue;
    if (!isFieldExtent(color.id, valueExprs)) continue;

    const instanceId = inferFieldInstanceFromExprs(controlPoints.id, valueExprs);
    if (!instanceId) {
      continue;
    }

    const instanceDecl = instances.get(instanceId);
    if (!instanceDecl) {
      throw new Error(
        `RenderInstances2D: Instance ${instanceId} not found in instances registry. ` +
        `This indicates a compiler bug - instanceId was inferred from controlPoints field but instance doesn't exist.`
      );
    }

    if (!instanceDecl.shapeField) {
      throw new Error(
        `RenderInstances2D: Instance ${instanceId} does not have a shapeField. ` +
        `Ensure the instance was created with a shape (e.g., Array block with Ellipse.shape as element).`
      );
    }

    const scale = scaleExpr
      ? isCardinalityOneExpr(scaleExpr.id, valueExprs)
        ? { k: 'one' as const, id: scaleExpr.id }
        : isFieldExtent(scaleExpr.id, valueExprs)
          ? { k: 'field' as const, id: scaleExpr.id, stride: scaleExpr.stride }
          : undefined
      : undefined;

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
      : { k: 'one' as const, id: shapeFieldId };

    targets.push({
      renderBlockId: block.id,
      instanceId,
      controlPoints: { id: controlPoints.id, stride: controlPoints.stride },
      color: { id: color.id, stride: color.stride },
      scale,
      shape,
    });
  }

  return targets;
}

// =============================================================================
// Pass 6b Entry Point
// =============================================================================

/**
 * Pass 6b: Continuity Pipeline Allocation
 *
 * Analyzes render targets and allocates all continuity pipeline slots through
 * the IRBuilder. Returns pre-built steps that pass 7 can order without allocating.
 *
 * [LAW:single-enforcer] All slot allocation goes through builder.allocTypedSlot().
 * No shadow allocator, no post-hoc slotMeta generation.
 *
 * @param unlinkedIR - Block IR fragments from Pass 6
 * @param validated - Validated graph with blocks and edges
 * @returns ContinuityPipelineIR with pre-built steps (all slots allocated through builder)
 */
export function allocateContinuityPipeline(
  unlinkedIR: UnlinkedIRFragments,
  validated: AcyclicOrLegalGraph
): ContinuityPipelineIR {
  const builder = unlinkedIR.builder;
  const instances = builder.getInstances();
  const valueExprs = builder.getValueExprs();

  // [LAW:one-source-of-truth] Build map from field ValueExprId → binding-pass-allocated ref.slot.
  // This allows the pipeline to reuse ref.slot as the materialize target,
  // so the debug index (which maps edges to ref.slot) and runtime (which writes to materialize target)
  // reference the same slot.
  const fieldExprToRefSlot = new Map<number, ValueSlot>();
  for (const [, outputs] of unlinkedIR.blockOutputs.entries()) {
    for (const [, ref] of outputs.entries()) {
      if (!isExprRef(ref) || ref.slot === undefined) continue;
      const veId = ref.id as unknown as number;
      const expr = valueExprs[veId];
      if (!expr) continue;
      // Only map field-extent outputs (many cardinality)
      try {
        requireManyInstance(expr.type);
        fieldExprToRefSlot.set(veId, ref.slot);
      } catch {
        // Not a field - skip
      }
    }
  }

  // Collect render targets from render blocks
  const renderTargets = collectRenderTargets(
    validated.blocks,
    validated.edges,
    unlinkedIR.blockOutputs,
    instances,
    valueExprs
  );

  // Build the continuity pipeline with builder-allocated slots
  const mapBuildSteps: StepContinuityMapBuild[] = [];
  const materializeSteps: StepMaterialize[] = [];
  const continuityApplySteps: StepContinuityApply[] = [];
  const renderSteps: StepRender[] = [];

  // Track which instances we've already emitted mapBuild for
  const mapBuildEmitted = new Set<InstanceId>();

  // Track materialize-instance+field+semantic → slot mappings to avoid duplicate materializations
  const fieldSlots = new Map<string, { baseSlot: ValueSlot; outputSlot: ValueSlot }>();

  const ensureMapBuildStep = (instanceId: InstanceId): void => {
    if (mapBuildEmitted.has(instanceId)) return;
    mapBuildSteps.push({
      kind: 'continuityMapBuild',
      instanceId,
      outputMapping: `mapping_${instanceId}`,
    });
    mapBuildEmitted.add(instanceId);
  };

  for (const target of renderTargets) {
    const { renderBlockId, instanceId, controlPoints, color, scale, shape } = target;

    // Helper to get or create slots for a field
    const getFieldSlots = (
      fieldId: ValueExprId,
      semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom',
      stride: number,
      roleKey: string,
    ): { baseSlot: ValueSlot; outputSlot: ValueSlot } => {
      // [LAW:one-source-of-truth] Materialization count/continuity mapping are derived from the field's own instance.
      const fieldInstanceId = inferFieldInstanceFromExprs(fieldId, valueExprs) ?? instanceId;
      // [LAW:one-source-of-truth] Continuity keys must be stable across recompiles.
      // Compile-ephemeral ValueExprIds are excluded from runtime continuity identity.
      const key = `${fieldInstanceId}:${semantic}:${roleKey}`;
      let slots = fieldSlots.get(key);
      if (!slots) {
        ensureMapBuildStep(fieldInstanceId);

        // [LAW:one-source-of-truth] Reuse the binding-pass-allocated ref.slot as baseSlot
        // so materialize writes to the same slot the debug index references.
        const existingSlot = fieldExprToRefSlot.get(fieldId as number);
        const baseSlot = existingSlot ?? builder.allocTypedSlot(
          valueExprs[fieldId as number].type,
          `continuity_base_${instanceId}_${semantic}`
        );

        // [LAW:single-enforcer] outputSlot always allocated through builder
        const outputSlot = builder.allocTypedSlot(
          valueExprs[fieldId as number].type,
          `continuity_output_${instanceId}_${semantic}`
        );

        slots = { baseSlot, outputSlot };
        fieldSlots.set(key, slots);

        // 2. Emit Materialize step
        materializeSteps.push({
          kind: 'materialize',
          field: fieldId,
          instanceId: fieldInstanceId,
          target: baseSlot,
        });

        // 3. Emit ContinuityApply step
        const policy = getPolicyForSemantic(semantic);
        const targetKey = `${semantic}:${fieldInstanceId}:${roleKey}`;
        continuityApplySteps.push({
          kind: 'continuityApply',
          targetKey,
          instanceId: fieldInstanceId,
          policy,
          baseSlot,
          outputSlot,
          semantic,
          stride,
        });
      }
      return slots;
    };

    // [LAW:one-source-of-truth] Render position continuity is keyed from RenderInstances2D.controlPoints.
    // We preserve semantic='position' for continuity policy ownership.
    const posSlots = getFieldSlots(controlPoints.id, 'position', controlPoints.stride, `${renderBlockId}:controlPoints`);

    // Process color (semantic: color)
    const colorSlots = getFieldSlots(color.id, 'color', color.stride, `${renderBlockId}:color`);

    // [LAW:dataflow-not-control-flow] Scale is always processed through one of the declared variants.
    let scaleOutput: StepRender['scale'] = undefined;
    if (scale) {
      if (scale.k === 'one') {
        scaleOutput = scale;
      } else {
        // [LAW:one-source-of-truth] Field scale follows the same materialize+continuity path as other field inputs.
        const scaleSlots = getFieldSlots(scale.id, 'custom', scale.stride, `${renderBlockId}:scale`);
        scaleOutput = { k: 'slot', slot: scaleSlots.outputSlot };
      }
    }

    // Process shape
    let shapeOutput: StepRender['shape'] | undefined = undefined;
    let controlPointsOutput: StepRender['controlPoints'] = undefined;

    if (shape) {
      if (shape.k === 'field') {
        const shapeSlots = getFieldSlots(shape.id, 'custom', shape.stride, `${renderBlockId}:shape`);
        shapeOutput = { k: 'slot', slot: shapeSlots.outputSlot };
      } else {
        // One-cardinality shape - resolve topology + param expressions + control points
        const shapeInfo = resolveShapeInfo(shape.id, valueExprs);
        if (shapeInfo) {
          shapeOutput = {
            k: 'one',
            topologyId: shapeInfo.topologyId,
            paramExprs: shapeInfo.paramExprs,
          };

          if (shapeInfo.controlPointField !== undefined) {
            const cpSlots = getFieldSlots(
              shapeInfo.controlPointField.id,
              'custom',
              shapeInfo.controlPointField.stride,
              `${renderBlockId}:controlPoints`,
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
      controlPointsSlot: posSlots.outputSlot,
      colorSlot: colorSlots.outputSlot,
      ...(scaleOutput && { scale: scaleOutput }),
      shape: shapeOutput,
      ...(controlPointsOutput && { controlPoints: controlPointsOutput }),
    };

    renderSteps.push(renderStep);
  }

  return {
    mapBuildSteps,
    materializeSteps,
    continuityApplySteps,
    renderSteps,
  };
}
