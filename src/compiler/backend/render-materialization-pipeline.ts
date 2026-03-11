/**
 * Pass 6b: Render Materialization Pipeline Allocation
 *
 * Analyzes render targets and allocates render materialization slots through
 * the IRBuilder. This sub-pass runs after block lowering (pass 6) and before
 * schedule construction (pass 7).
 *
 * Responsibilities:
 * - Render target analysis (which fields need materialization)
 * - Slot allocation via builder (no shadow allocator)
 * - Building pre-resolved pipeline steps (materialize, render)
 *
 * Pass 7 consumes the output and only orders steps — it never allocates.
 *
 * [LAW:single-enforcer] All slot allocation goes through IRBuilder.allocTypedSlot().
 * [LAW:one-source-of-truth] fieldExprToRefSlot reuses binding-pass slots so debug index
 * and runtime reference the same slot.
 */

import type { StepRender, StepMaterialize, InstanceDecl } from '../ir/types';
import type { InstanceId, ValueSlot } from '../ir/Indices';
import type { ValueExpr, ValueExprId } from '../ir/value-expr';
import type { UnlinkedIRFragments } from './lower-blocks';
import type { AcyclicOrLegalGraph, NormalizedEdge, BlockIndex } from '../ir/patches';
import type { CompilerGraphBlock } from '../ir/CompilerGraph';
import type { ValueRefPacked } from '../ir/lowerTypes';
import { isExprRef } from '../ir/lowerTypes';
import { getBlockDefinition } from '../../blocks/registry';
import {
  FLOAT,
  canonicalType,
  payloadStride,
  requireManyInstance,
  unitNone,
  withInstance,
} from '../../core/canonical-types';
import type { CanonicalType } from '../../core/canonical-types';
import { getValueExprChildren } from '../../runtime/ValueExprTreeWalker';

// =============================================================================
// Public Interface
// =============================================================================

/**
 * Output of pass 6b — pre-built render materialization steps with all slots resolved.
 *
 * Pass 7 consumes these arrays and only determines execution ordering.
 */
export interface RenderMaterializationPipelineIR {
  /** Materialize steps (one per unique field+semantic) */
  readonly materializeSteps: readonly StepMaterialize[];
  /** Render steps (one per render block) */
  readonly renderSteps: readonly StepRender[];
}

// =============================================================================
// Render Target Analysis (pure helpers, moved from schedule-program.ts)
// =============================================================================

/**
 * Target info collected from render blocks.
 * Used to generate materialize -> render chain.
 */
interface RenderTargetInfo {
  renderBlockId: string;
  instanceId: InstanceId;
  controlPoints: { id: ValueExprId; stride: number };
  color: { id: ValueExprId; stride: number };
  scale?: { id: ValueExprId; stride: number };
  shape?: { sourceExprId: ValueExprId };
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

function resolveShapeRefInfo(
  rootExprId: ValueExprId,
  valueExprs: readonly ValueExpr[],
):
  | {
      controlPointField?: { id: ValueExprId; stride: number };
    }
  | undefined {
  const stack = [rootExprId as number];
  const visited = new Set<number>();
  let resolved: ValueExprId | undefined;
  while (stack.length > 0) {
    const exprId = stack.pop()!;
    if (visited.has(exprId)) continue;
    visited.add(exprId);
    const expr = valueExprs[exprId];
    if (!expr) continue;
    if (expr.kind === 'shapeRef') {
      if (resolved !== undefined && resolved !== (exprId as ValueExprId)) {
        throw new Error(
          `RenderInstances2D: shape source ${String(rootExprId)} resolves to multiple shapeRef expressions (${String(resolved)}, ${String(exprId)})`,
        );
      }
      resolved = exprId as ValueExprId;
      continue;
    }
    for (const child of getValueExprChildren(expr)) {
      stack.push(child as number);
    }
  }
  if (resolved === undefined) return undefined;
  const shapeRefExpr = valueExprs[resolved as number];
  if (!shapeRefExpr || shapeRefExpr.kind !== 'shapeRef') return undefined;
  const cpId = (shapeRefExpr as any).controlPointField as ValueExprId | undefined;
  const controlPointField = cpId !== undefined
    ? (() => {
        const cpExpr = valueExprs[cpId as number];
        const stride = cpExpr ? payloadStride(cpExpr.type.payload) : 1;
        return { id: cpId, stride };
      })()
    : undefined;
  return {
    controlPointField,
  };
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
      ? { id: scaleExpr.id, stride: scaleExpr.stride }
      : undefined;

    const shapeFieldId = instanceDecl.shapeField;
    const shapeExpr = valueExprs[shapeFieldId as number];
    if (!shapeExpr) {
      throw new Error(
        `RenderInstances2D: Shape field ${shapeFieldId} not found in valueExprs. ` +
        `Instance ${instanceId} has invalid shapeField reference.`
      );
    }

    const shape = { sourceExprId: shapeFieldId };

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
 * Pass 6b: Render Materialization Pipeline Allocation
 *
 * Analyzes render targets and allocates all render materialization slots through
 * the IRBuilder. Returns pre-built steps that pass 7 can order without allocating.
 *
 * [LAW:single-enforcer] All slot allocation goes through builder.allocTypedSlot().
 * No shadow allocator, no post-hoc slotMeta generation.
 *
 * @param unlinkedIR - Block IR fragments from Pass 6
 * @param validated - Validated graph with blocks and edges
 * @returns RenderMaterializationPipelineIR with pre-built steps (all slots allocated through builder)
 */
export function allocateRenderMaterializationPipeline(
  unlinkedIR: UnlinkedIRFragments,
  validated: AcyclicOrLegalGraph
): RenderMaterializationPipelineIR {
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

  // Build the render materialization pipeline with builder-allocated slots
  const materializeSteps: StepMaterialize[] = [];
  const renderSteps: StepRender[] = [];

  // Track materialize-instance+field+semantic -> slot mappings to avoid duplicate materializations.
  // [LAW:one-source-of-truth] Canonical render path has one slot representation per field semantic.
  const fieldSlots = new Map<string, ValueSlot>();

  for (const target of renderTargets) {
    const { renderBlockId, instanceId, controlPoints, color, scale, shape } = target;
    const controlPointsExpr = valueExprs[controlPoints.id as number];
    if (!controlPointsExpr) {
      throw new Error(`RenderInstances2D (${renderBlockId}): missing controlPoints expr ${controlPoints.id}`);
    }
    const renderInstance = requireManyInstance(controlPointsExpr.type);
    const readValueExpr = (id: ValueExprId, context: string): ValueExpr => {
      const expr = builder.getValueExprs()[id as number];
      if (!expr) {
        throw new Error(`RenderInstances2D (${renderBlockId}): missing ${context} expr ${id}`);
      }
      return expr;
    };

    // Helper to get or create canonical materialize slot for a field
    const getFieldSlot = (
      fieldId: ValueExprId,
      semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom',
      roleKey: string,
    ): ValueSlot => {
      // [LAW:one-source-of-truth] Materialization count is derived from the field's own instance.
      const fieldInstanceId = inferFieldInstanceFromExprs(fieldId, valueExprs) ?? instanceId;
      const key = `${fieldInstanceId}:${semantic}:${roleKey}`;
      let slot = fieldSlots.get(key);
      if (slot === undefined) {
        const fieldExpr = readValueExpr(fieldId, roleKey);

        // [LAW:one-source-of-truth] Reuse the binding-pass-allocated ref.slot as baseSlot
        // so materialize writes to the same slot the debug index references.
        slot = fieldExprToRefSlot.get(fieldId as number) ?? builder.allocTypedSlot(
          fieldExpr.type,
          `render_materialize_${instanceId}_${semantic}`,
        );
        fieldSlots.set(key, slot);

        // 2. Emit Materialize step
        materializeSteps.push({
          kind: 'materialize',
          field: fieldId,
          instanceId: fieldInstanceId,
          target: slot,
        });
      }
      return slot;
    };

    // [LAW:one-source-of-truth] Render position is keyed from RenderInstances2D.controlPoints.
    const posSlot = getFieldSlot(controlPoints.id, 'position', `${renderBlockId}:controlPoints`);

    // Process color (semantic: color)
    // [LAW:dataflow-not-control-flow] Color always enters the materialize pipeline;
    // one-cardinality colors are lifted to field data via broadcast.
    const colorExpr = valueExprs[color.id as number];
    if (!colorExpr) {
      throw new Error(`RenderInstances2D (${renderBlockId}): missing color expr ${color.id}`);
    }
    const colorFieldExprId = isFieldExtent(color.id, valueExprs)
      ? color.id
      : builder.broadcast(color.id, withInstance(colorExpr.type, renderInstance));
    const colorFieldExpr = valueExprs[colorFieldExprId as number];
    if (!colorFieldExpr) {
      throw new Error(
        `RenderInstances2D (${renderBlockId}): missing broadcast color expr ${colorFieldExprId}`,
      );
    }
    const colorSlot = getFieldSlot(
      colorFieldExprId,
      'color',
      `${renderBlockId}:color`,
    );

    // [LAW:one-source-of-truth] Render scale is always materialized through one
    // slot-backed field path. Unwired scale inputs are normalized to identity.
    const identityScaleExprId = builder.constantWithKey(
      { kind: 'float', value: 1 },
      canonicalType(FLOAT, unitNone()),
      'render.scale.identity.one',
    );
    const scaleSourceExprId = scale?.id ?? identityScaleExprId;
    const scaleExpr = valueExprs[scaleSourceExprId as number];
    if (!scaleExpr) {
      throw new Error(`RenderInstances2D (${renderBlockId}): missing scale expr ${scaleSourceExprId}`);
    }
    const scaleFieldExprId = isFieldExtent(scaleSourceExprId, valueExprs)
      ? scaleSourceExprId
      : builder.broadcast(scaleSourceExprId, withInstance(scaleExpr.type, renderInstance));
    const scaleFieldExpr = valueExprs[scaleFieldExprId as number];
    if (!scaleFieldExpr) {
      throw new Error(
        `RenderInstances2D (${renderBlockId}): missing broadcast scale expr ${scaleFieldExprId}`,
      );
    }
    // [LAW:one-source-of-truth] Scale modulation follows the authored field directly.
    const scaleSlot = getFieldSlot(
      scaleFieldExprId,
      'custom',
      `scale:${String(scaleFieldExprId)}`,
    );
    const scaleOutput: StepRender['scale'] = { k: 'slot', slot: scaleSlot };

    // Process shape
    let shapeOutput: StepRender['shape'] | undefined = undefined;
    let controlPointsOutput: StepRender['controlPoints'] = undefined;

    if (shape) {
      const shapeSourceExprId = shape.sourceExprId;
      const shapeSourceExpr = readValueExpr(shapeSourceExprId, 'shape');
      const shapeFieldExprId = isFieldExtent(shapeSourceExprId, builder.getValueExprs())
        ? shapeSourceExprId
        : builder.broadcast(shapeSourceExprId, withInstance(shapeSourceExpr.type, renderInstance));
      const shapeFieldExpr = readValueExpr(shapeFieldExprId, 'shape');
      const shapeSlot = getFieldSlot(
        shapeFieldExprId,
        'custom',
        `${renderBlockId}:shape`,
      );
      // [LAW:one-source-of-truth] Render steps publish one canonical slot-backed
      // shape-handle source for all sinks (no oneHandle branch at runtime).
      shapeOutput = { k: 'slot', slot: shapeSlot };
      // [LAW:single-enforcer] Render materialization pipeline is the single compile-time
      // boundary that resolves shape-handle ancestry and optional control-point
      // field metadata.
      const shapeInfo = resolveShapeRefInfo(shapeSourceExprId, builder.getValueExprs());
      if (!shapeInfo) {
        throw new Error(
          `RenderInstances2D (${renderBlockId}) shape source ${String(shapeSourceExprId)} must resolve to a shapeRef expression`,
        );
      }
      if (shapeInfo.controlPointField !== undefined) {
        const cpSlot = getFieldSlot(
          shapeInfo.controlPointField.id,
          'custom',
          `${renderBlockId}:controlPoints`,
        );
        controlPointsOutput = { k: 'slot', slot: cpSlot };
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
      controlPointsSlot: posSlot,
      colorSlot,
      scale: scaleOutput,
      shape: shapeOutput,
      ...(controlPointsOutput && { controlPoints: controlPointsOutput }),
    };

    renderSteps.push(renderStep);
  }

  return {
    materializeSteps,
    renderSteps,
  };
}
