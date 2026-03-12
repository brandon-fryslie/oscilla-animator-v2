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
  const resolved = findShapeRefExprId(rootExprId, valueExprs);
  if (resolved === undefined) return undefined;

  const shapeRefExpr = valueExprs[resolved as number];
  if (!shapeRefExpr || shapeRefExpr.kind !== 'shapeRef') return undefined;

  const cpId = (shapeRefExpr as any).controlPointField as ValueExprId | undefined;
  if (cpId === undefined) {
    return {};
  }
  const cpExpr = valueExprs[cpId as number];
  const stride = cpExpr ? payloadStride(cpExpr.type.payload) : 1;
  return {
    controlPointField: { id: cpId, stride },
  };
}

function findShapeRefExprId(
  rootExprId: ValueExprId,
  valueExprs: readonly ValueExpr[],
): ValueExprId | undefined {
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
  return resolved;
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
type FieldSemantic = 'position' | 'radius' | 'opacity' | 'color' | 'custom';

function readValueExprOrThrow(
  valueExprs: readonly ValueExpr[],
  exprId: ValueExprId,
  message: string,
): ValueExpr {
  const expr = valueExprs[exprId as number];
  if (!expr) throw new Error(message);
  return expr;
}

function collectFieldExprToRefSlots(
  unlinkedIR: UnlinkedIRFragments,
  valueExprs: readonly ValueExpr[],
): Map<number, ValueSlot> {
  const fieldExprToRefSlot = new Map<number, ValueSlot>();
  for (const [, outputs] of unlinkedIR.blockOutputs.entries()) {
    for (const [, ref] of outputs.entries()) {
      if (!isExprRef(ref) || ref.slot === undefined) continue;
      const veId = ref.id as unknown as number;
      const expr = valueExprs[veId];
      if (!expr) continue;
      try {
        requireManyInstance(expr.type);
        fieldExprToRefSlot.set(veId, ref.slot);
      } catch {
        // Not a field - skip
      }
    }
  }
  return fieldExprToRefSlot;
}

function createFieldSlotAllocator(args: {
  readonly builder: UnlinkedIRFragments['builder'];
  readonly valueExprs: readonly ValueExpr[];
  readonly instanceId: InstanceId;
  readonly renderBlockId: string;
  readonly fieldSlots: Map<string, ValueSlot>;
  readonly fieldExprToRefSlot: Map<number, ValueSlot>;
  readonly materializeSteps: StepMaterialize[];
}): (fieldId: ValueExprId, semantic: FieldSemantic, roleKey: string) => ValueSlot {
  return (fieldId: ValueExprId, semantic: FieldSemantic, roleKey: string): ValueSlot => {
    const fieldInstanceId = inferFieldInstanceFromExprs(fieldId, args.valueExprs) ?? args.instanceId;
    const key = `${fieldInstanceId}:${semantic}:${roleKey}`;
    let slot = args.fieldSlots.get(key);
    if (slot !== undefined) return slot;

    const fieldExpr = readValueExprOrThrow(
      args.valueExprs,
      fieldId,
      `RenderInstances2D (${args.renderBlockId}): missing ${roleKey} expr ${fieldId}`,
    );
    slot = args.fieldExprToRefSlot.get(fieldId as number)
      ?? args.builder.allocTypedSlot(fieldExpr.type, `render_materialize_${args.instanceId}_${semantic}`);
    args.fieldSlots.set(key, slot);
    args.materializeSteps.push({
      kind: 'materialize',
      field: fieldId,
      instanceId: fieldInstanceId,
      target: slot,
    });
    return slot;
  };
}

function resolveFieldExprId(args: {
  readonly sourceExprId: ValueExprId;
  readonly renderInstance: ReturnType<typeof requireManyInstance>;
  readonly valueExprs: readonly ValueExpr[];
  readonly builder: UnlinkedIRFragments['builder'];
  readonly renderBlockId: string;
  readonly label: string;
}): ValueExprId {
  const sourceExpr = readValueExprOrThrow(
    args.valueExprs,
    args.sourceExprId,
    `RenderInstances2D (${args.renderBlockId}): missing ${args.label} expr ${args.sourceExprId}`,
  );
  const fieldExprId = isFieldExtent(args.sourceExprId, args.valueExprs)
    ? args.sourceExprId
    : args.builder.broadcast(args.sourceExprId, withInstance(sourceExpr.type, args.renderInstance));
  readValueExprOrThrow(
    args.valueExprs,
    fieldExprId,
    `RenderInstances2D (${args.renderBlockId}): missing broadcast ${args.label} expr ${fieldExprId}`,
  );
  return fieldExprId;
}

function resolveShapeOutputs(args: {
  readonly shape: { sourceExprId: ValueExprId };
  readonly renderBlockId: string;
  readonly renderInstance: ReturnType<typeof requireManyInstance>;
  readonly valueExprs: readonly ValueExpr[];
  readonly builder: UnlinkedIRFragments['builder'];
  readonly getFieldSlot: (fieldId: ValueExprId, semantic: FieldSemantic, roleKey: string) => ValueSlot;
}): Pick<StepRender, 'shape' | 'controlPoints'> {
  const shapeFieldExprId = resolveFieldExprId({
    sourceExprId: args.shape.sourceExprId,
    renderInstance: args.renderInstance,
    valueExprs: args.valueExprs,
    builder: args.builder,
    renderBlockId: args.renderBlockId,
    label: 'shape',
  });
  const shapeSlot = args.getFieldSlot(shapeFieldExprId, 'custom', `${args.renderBlockId}:shape`);

  const shapeInfo = resolveShapeRefInfo(args.shape.sourceExprId, args.valueExprs);
  if (!shapeInfo) {
    throw new Error(
      `RenderInstances2D (${args.renderBlockId}) shape source ${String(args.shape.sourceExprId)} must resolve to a shapeRef expression`,
    );
  }

  const controlPoints: StepRender['controlPoints'] = shapeInfo.controlPointField
    ? { k: 'slot', slot: args.getFieldSlot(shapeInfo.controlPointField.id, 'custom', `${args.renderBlockId}:controlPoints`) }
    : undefined;

  return {
    shape: { k: 'slot', slot: shapeSlot },
    ...(controlPoints && { controlPoints }),
  };
}

function buildRenderStepForTarget(args: {
  readonly target: RenderTargetInfo;
  readonly builder: UnlinkedIRFragments['builder'];
  readonly valueExprs: readonly ValueExpr[];
  readonly fieldSlots: Map<string, ValueSlot>;
  readonly fieldExprToRefSlot: Map<number, ValueSlot>;
  readonly materializeSteps: StepMaterialize[];
}): StepRender {
  const { target, builder, valueExprs } = args;
  const controlPointsExpr = readValueExprOrThrow(
    valueExprs,
    target.controlPoints.id,
    `RenderInstances2D (${target.renderBlockId}): missing controlPoints expr ${target.controlPoints.id}`,
  );
  const renderInstance = requireManyInstance(controlPointsExpr.type);

  const getFieldSlot = createFieldSlotAllocator({
    builder,
    valueExprs,
    instanceId: target.instanceId,
    renderBlockId: target.renderBlockId,
    fieldSlots: args.fieldSlots,
    fieldExprToRefSlot: args.fieldExprToRefSlot,
    materializeSteps: args.materializeSteps,
  });

  const controlPointsSlot = getFieldSlot(
    target.controlPoints.id,
    'position',
    `${target.renderBlockId}:controlPoints`,
  );

  const colorFieldExprId = resolveFieldExprId({
    sourceExprId: target.color.id,
    renderInstance,
    valueExprs,
    builder,
    renderBlockId: target.renderBlockId,
    label: 'color',
  });
  const colorSlot = getFieldSlot(colorFieldExprId, 'color', `${target.renderBlockId}:color`);

  const identityScaleExprId = builder.constantWithKey(
    { kind: 'float', value: 1 },
    canonicalType(FLOAT, unitNone()),
    'render.scale.identity.one',
  );
  const scaleSourceExprId = target.scale?.id ?? identityScaleExprId;
  const scaleFieldExprId = resolveFieldExprId({
    sourceExprId: scaleSourceExprId,
    renderInstance,
    valueExprs,
    builder,
    renderBlockId: target.renderBlockId,
    label: 'scale',
  });
  const scaleSlot = getFieldSlot(scaleFieldExprId, 'custom', `scale:${String(scaleFieldExprId)}`);

  if (!target.shape) {
    throw new Error(
      `Render step for instance ${target.instanceId} requires shape, but shape is undefined. ` +
      'Ensure a shape block (Ellipse, Rect, etc.) is wired to the render pipeline.',
    );
  }
  const shapeOutputs = resolveShapeOutputs({
    shape: target.shape,
    renderBlockId: target.renderBlockId,
    renderInstance,
    valueExprs,
    builder,
    getFieldSlot,
  });

  return {
    kind: 'render',
    instanceId: target.instanceId,
    controlPointsSlot,
    colorSlot,
    scale: { k: 'slot', slot: scaleSlot },
    shape: shapeOutputs.shape,
    ...(shapeOutputs.controlPoints && { controlPoints: shapeOutputs.controlPoints }),
  };
}

export function allocateRenderMaterializationPipeline(
  unlinkedIR: UnlinkedIRFragments,
  validated: AcyclicOrLegalGraph
): RenderMaterializationPipelineIR {
  const builder = unlinkedIR.builder;
  const instances = builder.getInstances();
  const valueExprs = builder.getValueExprs();
  const fieldExprToRefSlot = collectFieldExprToRefSlots(unlinkedIR, valueExprs);
  const renderTargets = collectRenderTargets(
    validated.blocks,
    validated.edges,
    unlinkedIR.blockOutputs,
    instances,
    valueExprs,
  );
  const materializeSteps: StepMaterialize[] = [];
  const fieldSlots = new Map<string, ValueSlot>();
  const renderSteps = renderTargets.map((target) =>
    buildRenderStepForTarget({
      target,
      builder,
      valueExprs,
      fieldSlots,
      fieldExprToRefSlot,
      materializeSteps,
    }),
  );
  return { materializeSteps, renderSteps };
}
