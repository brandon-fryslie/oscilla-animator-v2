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
// Render Target Analysis (pure helpers)
// =============================================================================

/**
* Target info collected from render blocks.
* Used to generate materialize -> render chain.
  */
  interface RenderTargetInfo {
  renderBlockId: string;
  instanceId: InstanceId;
  positionXY: { id: ValueExprId; stride: number };
  positionZ?: { id: ValueExprId; stride: number };
  color: { id: ValueExprId; stride: number };
  scale?: { id: ValueExprId; stride: number };
  rotation?: { id: ValueExprId; stride: number };
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
  const matchingEdges = edges.filter(
  (edge) => edge.toBlock === blockIndex && edge.toPort === portId,
  );
  if (matchingEdges.length === 0) return undefined;
  if (matchingEdges.length > 1) {
  throw new Error(
  `RenderInstances2D: input ${portId} on block ${String(blockIndex)} has multiple incoming edges (${matchingEdges.length}); render materialization requires a single resolved writer at this pass boundary`,
  );
  }
  const edge = matchingEdges[0];

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
parameterBaseField?: { id: ValueExprId; stride: number };
}
| undefined {
const resolved = findShapeRefExprId(rootExprId, valueExprs);
if (resolved === undefined) return undefined;

const shapeRefExpr = valueExprs[resolved as number];
if (!shapeRefExpr || shapeRefExpr.kind !== 'shapeRef') return undefined;

// Accommodate Type 2 shapes with parametric control points mapped to the Compute Arena
const paramId = (shapeRefExpr as any).parameterBaseField as ValueExprId | undefined
?? (shapeRefExpr as any).controlPointField as ValueExprId | undefined; // Fallback for transition

if (paramId === undefined) {
return {};
}
const cpExpr = valueExprs[paramId as number];
const stride = cpExpr ? payloadStride(cpExpr.type.payload) : 1;
return {
parameterBaseField: { id: paramId, stride },
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
renderMultipleShapeRefsMessage(
rootExprId,
resolved,
exprId as ValueExprId,
),
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
* SHAPE LOOKUP: Shape is looked up from InstanceDecl.shapeField using the
* instanceId inferred from the mandatory positionXY World Space field.
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
// Transition note: Check 'position' for backwards compatibility, but 'positionXY' is the new contract
const positionXYRef = getInputRef(index, 'positionXY', edges, blockOutputs)
?? getInputRef(index, 'position', edges, blockOutputs);
const positionZRef = getInputRef(index, 'positionZ', edges, blockOutputs);
const colorRef = getInputRef(index, 'color', edges, blockOutputs);
const scaleRef = getInputRef(index, 'scale', edges, blockOutputs);
const rotationRef = getInputRef(index, 'rotation', edges, blockOutputs);

    const positionXY = asExprValueRef(positionXYRef);
    const positionZ = asExprValueRef(positionZRef);
    const color = asExprValueRef(colorRef);
    const scaleExpr = asExprValueRef(scaleRef);
    const rotationExpr = asExprValueRef(rotationRef);

    if (!positionXY || !color) continue;

    // The primary instance placement field dictates the World Space cardinality
    if (!isFieldExtent(positionXY.id, valueExprs)) continue;

    const instanceId = inferFieldInstanceFromExprs(positionXY.id, valueExprs);
    if (!instanceId) continue;

    const instanceDecl = instances.get(instanceId);
    if (!instanceDecl) {
      throw new Error(renderMissingInstanceMessage(instanceId));
    }

    if (!instanceDecl.shapeField) {
      throw new Error(renderMissingShapeFieldMessage(instanceId));
    }

    const scale = scaleExpr ? { id: scaleExpr.id, stride: scaleExpr.stride } : undefined;
    const rotation = rotationExpr ? { id: rotationExpr.id, stride: rotationExpr.stride } : undefined;

    const shapeFieldId = instanceDecl.shapeField;
    const shapeExpr = valueExprs[shapeFieldId as number];
    if (!shapeExpr) {
      throw new Error(renderInvalidShapeFieldReferenceMessage(instanceId, shapeFieldId));
    }

    const shape = { sourceExprId: shapeFieldId };

    targets.push({
      renderBlockId: block.id,
      instanceId,
      positionXY: { id: positionXY.id, stride: positionXY.stride },
      positionZ,
      color: { id: color.id, stride: color.stride },
      scale,
      rotation,
      shape,
    });
}

return targets;
}

// =============================================================================
// Pass 6b Entry Point
// =============================================================================

type FieldSemantic = 'position' | 'radius' | 'opacity' | 'color' | 'custom';

function renderMissingExprMessage(renderBlockId: string, label: string, exprId: ValueExprId): string {
return `RenderInstances2D (${renderBlockId}): missing ${label} expr ${String(exprId)}`;
}

function renderMissingBroadcastExprMessage(renderBlockId: string, label: string, exprId: ValueExprId): string {
return `RenderInstances2D (${renderBlockId}): missing broadcast ${label} expr ${String(exprId)}`;
}

function renderMultipleShapeRefsMessage(
rootExprId: ValueExprId,
resolvedExprId: ValueExprId,
currentExprId: ValueExprId,
): string {
return (
`RenderInstances2D: shape source ${String(rootExprId)} resolves to multiple shapeRef expressions ` +
`(${String(resolvedExprId)}, ${String(currentExprId)})`
);
}

function renderMissingInstanceMessage(instanceId: InstanceId): string {
return (
`RenderInstances2D: Instance ${instanceId} not found in instances registry. ` +
"This indicates a compiler bug - instanceId was inferred from positionXY field but instance doesn't exist."
);
}

function renderMissingShapeFieldMessage(instanceId: InstanceId): string {
return (
`RenderInstances2D: Instance ${instanceId} does not have a shapeField. ` +
'Ensure the instance was created with a shape (e.g., Array block with Ellipse.shape as element).'
);
}

function renderInvalidShapeFieldReferenceMessage(instanceId: InstanceId, shapeFieldId: ValueExprId): string {
return (
`RenderInstances2D: Shape field ${String(shapeFieldId)} not found in valueExprs. ` +
`Instance ${instanceId} has invalid shapeField reference.`
);
}

function renderMissingShapeInputMessage(instanceId: InstanceId): string {
return (
`Render step for instance ${instanceId} requires shape, but shape is undefined. ` +
'Ensure a shape block (Ellipse, Rect, etc.) is wired to the render pipeline.'
);
}

function renderPositionXYRoleKey(renderBlockId: string): string {
return `${renderBlockId}:positionXY`;
}

function renderPositionZRoleKey(renderBlockId: string): string {
return `${renderBlockId}:positionZ`;
}

function renderColorRoleKey(renderBlockId: string): string {
return `${renderBlockId}:color`;
}

function renderShapeRoleKey(renderBlockId: string): string {
return `${renderBlockId}:shape`;
}

function renderScaleRoleKey(scaleFieldExprId: ValueExprId): string {
return `scale:${String(scaleFieldExprId)}`;
}

function renderRotationRoleKey(rotationFieldExprId: ValueExprId): string {
return `rotation:${String(rotationFieldExprId)}`;
}

function renderParameterBaseRoleKey(renderBlockId: string): string {
return `${renderBlockId}:parameterBase`;
}

function renderCustomSemantic(): FieldSemantic {
return 'custom';
}

function slotRef(slot: ValueSlot): { k: 'slot'; slot: ValueSlot } {
return { k: 'slot', slot };
}

function identityScaleConstValue(): { kind: 'float'; value: number } {
return { kind: 'float', value: 1 };
}

function identityScaleConstKey(): string {
return 'render.scale.identity.one';
}

function readRenderBuilderInstances(
builder: UnlinkedIRFragments['builder'],
): ReadonlyMap<InstanceId, InstanceDecl> {
return builder.getInstances();
}

function readRenderBuilderValueExprs(builder: UnlinkedIRFragments['builder']): readonly ValueExpr[] {
return builder.getValueExprs();
}

function createMaterializeStepsBuffer(): StepMaterialize[] {
return [];
}

function createFieldSlotsBuffer(): Map<string, ValueSlot> {
return new Map<string, ValueSlot>();
}

function listRenderTargets(args: {
readonly blocks: readonly CompilerGraphBlock[];
readonly edges: readonly NormalizedEdge[];
readonly blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>;
readonly instances: ReadonlyMap<InstanceId, InstanceDecl>;
readonly valueExprs: readonly ValueExpr[];
}): RenderTargetInfo[] {
return collectRenderTargets(
args.blocks,
args.edges,
args.blockOutputs,
args.instances,
args.valueExprs,
);
}

function buildRenderStepsFromTargets(args: {
readonly renderTargets: readonly RenderTargetInfo[];
readonly builder: UnlinkedIRFragments['builder'];
readonly valueExprs: readonly ValueExpr[];
readonly fieldSlots: Map<string, ValueSlot>;
readonly fieldExprToRefSlot: Map<number, ValueSlot>;
readonly materializeSteps: StepMaterialize[];
}): StepRender[] {
return args.renderTargets.map((target) =>
buildRenderStepForTarget({
target,
builder: args.builder,
valueExprs: args.valueExprs,
fieldSlots: args.fieldSlots,
fieldExprToRefSlot: args.fieldExprToRefSlot,
materializeSteps: args.materializeSteps,
}),
);
}

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
      renderMissingExprMessage(args.renderBlockId, roleKey, fieldId),
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
renderMissingExprMessage(args.renderBlockId, args.label, args.sourceExprId),
);
const fieldExprId = isFieldExtent(args.sourceExprId, args.valueExprs)
? args.sourceExprId
: args.builder.broadcast(args.sourceExprId, withInstance(sourceExpr.type, args.renderInstance));
readValueExprOrThrow(
args.valueExprs,
fieldExprId,
renderMissingBroadcastExprMessage(args.renderBlockId, args.label, fieldExprId),
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
}): { shapeSlot: { k: 'slot'; slot: ValueSlot }; parameterBaseSlot: ValueSlot | null } {
const shapeFieldExprId = resolveFieldExprId({
sourceExprId: args.shape.sourceExprId,
renderInstance: args.renderInstance,
valueExprs: args.valueExprs,
builder: args.builder,
renderBlockId: args.renderBlockId,
label: 'shape',
});

// Resolves the TopologyBank index
const shapeSlot = args.getFieldSlot(
shapeFieldExprId,
renderCustomSemantic(),
renderShapeRoleKey(args.renderBlockId),
);

const shapeInfo = resolveShapeRefInfo(args.shape.sourceExprId, args.valueExprs);
if (!shapeInfo) {
throw new Error(
`RenderInstances2D (${args.renderBlockId}) shape source ${String(args.shape.sourceExprId)} must resolve to a shapeRef expression`,
);
}

// Resolves the Compute Arena block for Type 2 parametric shapes
const parameterBaseSlot = shapeInfo.parameterBaseField
? args.getFieldSlot(
shapeInfo.parameterBaseField.id,
renderCustomSemantic(),
renderParameterBaseRoleKey(args.renderBlockId),
)
: null;

return {
shapeSlot: slotRef(shapeSlot),
parameterBaseSlot,
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

const positionXYExpr = readValueExprOrThrow(
valueExprs,
target.positionXY.id,
renderMissingExprMessage(target.renderBlockId, 'positionXY', target.positionXY.id),
);
const renderInstance = requireManyInstance(positionXYExpr.type);

const getFieldSlot = createFieldSlotAllocator({
builder,
valueExprs,
instanceId: target.instanceId,
renderBlockId: target.renderBlockId,
fieldSlots: args.fieldSlots,
fieldExprToRefSlot: args.fieldExprToRefSlot,
materializeSteps: args.materializeSteps,
});

const positionXYSlot = getFieldSlot(
target.positionXY.id,
'position',
renderPositionXYRoleKey(target.renderBlockId),
);

let positionZSlot: ValueSlot | null = null;
if (target.positionZ) {
const zFieldExprId = resolveFieldExprId({
sourceExprId: target.positionZ.id,
renderInstance,
valueExprs,
builder,
renderBlockId: target.renderBlockId,
label: 'positionZ',
});
positionZSlot = getFieldSlot(zFieldExprId, 'position', renderPositionZRoleKey(target.renderBlockId));
}

const colorFieldExprId = resolveFieldExprId({
sourceExprId: target.color.id,
renderInstance,
valueExprs,
builder,
renderBlockId: target.renderBlockId,
label: 'color',
});
const colorSlot = getFieldSlot(colorFieldExprId, 'color', renderColorRoleKey(target.renderBlockId));

const identityScaleExprId = builder.constantWithKey(
identityScaleConstValue(),
canonicalType(FLOAT, unitNone()),
identityScaleConstKey(),
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
const scaleSlot = getFieldSlot(
scaleFieldExprId,
renderCustomSemantic(),
renderScaleRoleKey(scaleFieldExprId),
);

let rotationSlot: ValueSlot | null = null;
if (target.rotation) {
const rotationFieldExprId = resolveFieldExprId({
sourceExprId: target.rotation.id,
renderInstance,
valueExprs,
builder,
renderBlockId: target.renderBlockId,
label: 'rotation',
});
rotationSlot = getFieldSlot(
rotationFieldExprId,
renderCustomSemantic(),
renderRotationRoleKey(rotationFieldExprId),
);
}

if (!target.shape) {
throw new Error(renderMissingShapeInputMessage(target.instanceId));
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
positionXYSlot,
positionZSlot,
colorSlot,
scaleSlot,
rotationSlot,
shapeSlot: shapeOutputs.shapeSlot,
parameterBaseSlot: shapeOutputs.parameterBaseSlot,
} as StepRender;
}

export function allocateRenderMaterializationPipeline(
unlinkedIR: UnlinkedIRFragments,
validated: AcyclicOrLegalGraph
): RenderMaterializationPipelineIR {
const builder = unlinkedIR.builder;
const instances = readRenderBuilderInstances(builder);
const valueExprs = readRenderBuilderValueExprs(builder);
const fieldExprToRefSlot = collectFieldExprToRefSlots(unlinkedIR, valueExprs);
const renderTargets = listRenderTargets({
blocks: validated.blocks,
edges: validated.edges,
blockOutputs: unlinkedIR.blockOutputs,
instances,
valueExprs,
});
const materializeSteps = createMaterializeStepsBuffer();
const fieldSlots = createFieldSlotsBuffer();
const renderSteps = buildRenderStepsFromTargets({
renderTargets,
builder,
valueExprs,
fieldSlots,
fieldExprToRefSlot,
materializeSteps,
});
return { materializeSteps, renderSteps };
}