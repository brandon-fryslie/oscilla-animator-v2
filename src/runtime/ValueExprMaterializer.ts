/**
 * ValueExpr Materializer - Field Materialization
 *
 * Evaluates ValueExpr nodes to produce Float32Array buffers.
 * Works alongside scalar evaluation to materialize field-extent expressions.
 *
 * Key design principles:
 * - Unified ValueExpr table (no separate scalar/field/event tables)
 * - Materialization is primarily for field-extent expressions
 * - One-cardinality expressions may be evaluated here when writing unified buffers
 * - Buffer reuse via MaterializeScratch (no allocation in hot path)
 */

import type { RuntimeState } from './RuntimeState';
import {
  SHAPE_BANK_HEADER_WORDS,
  SHAPE_BANK_NO_CONTROL_POINT_SLOT,
  allocShapeBankWords,
  createShapeBankHeaderV1,
  writeShapeBankHandleMetadata,
  writeShapeBankHeader,
} from './RuntimeState';
import type { ValueExpr, ValueExprKernel } from '../compiler/ir/value-expr';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { PureFn } from '../compiler/ir/types';
import type { InstanceId } from '../compiler/ir/Indices';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type { MaterializeScratch } from './MaterializeScratch';
import { evaluateValueExprScalar, type ScalarEvalContext } from './ValueExprScalarEvaluator';
import { requireInst } from '../core/canonical-types';
import { payloadStride } from '../core/canonical-types';
import { constValueAsNumber, type ConstValue } from '../core/canonical-types';
import { ShapeClass, TopologyMode } from '../shapes/types';
import type { PathTopologyDef, TopologyDef } from '../shapes/types';
import { applyOpcode } from './OpcodeInterpreter';
import {
  applyPureFn as applySharedPureFn,
  type PureFnExecutionContext,
} from './ScalarKernelLibrary';
import { getProgramTopology } from '../compiler/ir/program-topology';
import { resolveInstanceLaneCount } from './InstanceCountResolver';
import { oklchToEncodedSrgbInto } from '../core/color/oklch';

function isPathTopology(topology: TopologyDef): topology is PathTopologyDef {
  return 'verbs' in topology;
}

const f32BitScratch = new Float32Array(1);
const u32BitScratch = new Uint32Array(f32BitScratch.buffer);

function float32ToUint32Bits(value: number): number {
  f32BitScratch[0] = value;
  return u32BitScratch[0] >>> 0;
}

function resolveShapeControlPointSlot(
  expr: Extract<ValueExpr, { kind: 'shapeRef' }>,
  program: CompiledProgramIR,
  requireControlPointSlot: boolean,
): number {
  if (expr.controlPointField == null) {
    if (requireControlPointSlot) {
      // [LAW:single-enforcer] shapeRef->ShapeBank metadata validation is enforced
      // at this runtime materialization boundary.
      throw new Error(
        'shapeRef path topology requires controlPointField; missing controlPointField on shapeRef expression',
      );
    }
    return SHAPE_BANK_NO_CONTROL_POINT_SLOT;
  }
  const slot = program.runtimeAddressTable.fieldExprToSlot.get(expr.controlPointField as number);
  if (slot === undefined) {
    if (requireControlPointSlot) {
      // [LAW:one-source-of-truth] Runtime address table owns field->slot mapping;
      // missing entries are compiler/runtime contract violations, not fallbacks.
      throw new Error(
        'shapeRef path topology missing runtimeAddressTable fieldExprToSlot entry for controlPointField ' +
          expr.controlPointField,
      );
    }
    return SHAPE_BANK_NO_CONTROL_POINT_SLOT;
  }
  return slot as number;
}

function evaluateShapeRefHandle(
  expr: Extract<ValueExpr, { kind: 'shapeRef' }>,
  table: ValueExprTable,
  state: RuntimeState,
  program: CompiledProgramIR,
  scratch: MaterializeScratch | undefined,
  pureFnContext: PureFnExecutionContext,
): number {
  const shapeBank = state.shapeBank;
  if (!shapeBank) {
    throw new Error('RuntimeState.shapeBank is required to evaluate shape handles');
  }
  const topology = getProgramTopology(program, expr.topologyId);
  const isPath = isPathTopology(topology);
  const vertexCount = isPath ? topology.totalControlPoints : 0;
  const indexCount = isPath && topology.closed && vertexCount >= 3
    ? (vertexCount - 2) * 3
    : 0;
  // [LAW:one-source-of-truth] ShapeBank header flags are encoded directly at
  // handle materialization (bit0 = closed path).
  const flags = isPath && topology.closed ? 1 : 0;
  const controlPointSlot = resolveShapeControlPointSlot(expr, program, isPath);
  const controlPointWordPayload = (() => {
    if (!isPath || vertexCount <= 0) {
      return new Uint32Array(0);
    }
    if (expr.controlPointField == null) {
      throw new Error(
        'shapeRef path topology requires controlPointField for shape-bank payload materialization',
      );
    }
    const controlPointExpr = table.nodes[expr.controlPointField];
    if (!controlPointExpr) {
      throw new Error(
        'shapeRef path topology missing controlPointField expression ' + String(expr.controlPointField),
      );
    }
    const controlPointStride = payloadStride(controlPointExpr.type.payload);
    if (controlPointStride < 2) {
      throw new Error(
        'shapeRef controlPointField must materialize vec2 payload (stride>=2), got stride=' +
          String(controlPointStride),
      );
    }
    const cardinality = requireInst(controlPointExpr.type.extent.cardinality, 'cardinality');
    if (cardinality.kind !== 'many') {
      throw new Error('shapeRef controlPointField must be many-cardinality');
    }
    const controlPointInstanceRef = cardinality.instance;
    const controlPointInstanceId = (
      typeof controlPointInstanceRef === 'object'
        ? controlPointInstanceRef.instanceId
        : controlPointInstanceRef
    ) as InstanceId;
    const controlPointInstanceDecl = program.schedule.instances.get(controlPointInstanceId);
    if (!controlPointInstanceDecl) {
      throw new Error(
        'shapeRef controlPointField references missing instance ' + String(controlPointInstanceId),
      );
    }
    const availablePointCount = resolveInstanceLaneCount(controlPointInstanceDecl, program, state, pureFnContext);
    if (availablePointCount < vertexCount) {
      throw new Error(
        'shapeRef controlPointField has fewer lanes than topology requires ' +
          `(topologyId=${String(expr.topologyId)}, needed=${vertexCount}, available=${availablePointCount})`,
      );
    }
    const controlPoints = materializeValueExpr(
      expr.controlPointField,
      table,
      controlPointInstanceId,
      vertexCount,
      state,
      program,
      undefined,
      scratch,
      pureFnContext,
    );
    const words = new Uint32Array(vertexCount * 2);
    for (let point = 0; point < vertexCount; point++) {
      const pointBase = point * controlPointStride;
      words[point * 2] = float32ToUint32Bits(controlPoints[pointBase]);
      words[point * 2 + 1] = float32ToUint32Bits(controlPoints[pointBase + 1]);
    }
    return words;
  })();
  const paramBlockWords = controlPointWordPayload.length;
  const handle = allocShapeBankWords(shapeBank, SHAPE_BANK_HEADER_WORDS + paramBlockWords);
  const paramBlockOffset = paramBlockWords > 0 ? handle + SHAPE_BANK_HEADER_WORDS : 0;
  // [LAW:one-source-of-truth] Handle semantics are anchored in ShapeBank:
  // header stores draw topology dimensions, sidecar stores topology/control-slot metadata.
  // [LAW:one-type-per-behavior] ShapeClass and TopologyMode are named enums,
  // not magic numbers — classification is compiler-owned and propagated here.
  writeShapeBankHeader(
    shapeBank.data,
    handle,
    createShapeBankHeaderV1({
      kind: ShapeClass.Type1Rigid,
      topologyMode: isPath ? TopologyMode.Path : TopologyMode.NonPath,
      flags,
      // [LAW:one-source-of-truth] exception: the legacy indexed draw path
      // still consumes compatibility indexCount from ShapeHeaderV1 until
      // GPU draw-prep/topology lookup owns rendered-element derivation.
      indexCount,
      vertexCount,
      paramBlockOffset,
      paramBlockWords,
    }),
  );
  if (paramBlockWords > 0) {
    shapeBank.data.set(controlPointWordPayload, paramBlockOffset);
  }
  writeShapeBankHandleMetadata(shapeBank, handle, {
    topologyId: expr.topologyId as number,
    controlPointSlot,
  });
  return handle;
}

function reduceScalarBuffer(buffer: ArrayLike<number>, count: number, op: 'min' | 'max' | 'sum' | 'avg'): number {
  if (count <= 0) return 0;
  if (op === 'sum' || op === 'avg') {
    let acc = 0;
    for (let i = 0; i < count; i++) acc += buffer[i] as number;
    return op === 'avg' ? acc / count : acc;
  }
  if (op === 'min') {
    let acc = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i++) {
      const v = buffer[i] as number;
      if (v < acc) acc = v;
    }
    return acc;
  }
  let acc = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const v = buffer[i] as number;
    if (v > acc) acc = v;
  }
  return acc;
}

function materializeReduceScalar(
  expr: Extract<ValueExprKernel, { kernelKind: 'reduce' }>,
  table: ValueExprTable,
  state: RuntimeState,
  program: CompiledProgramIR,
  scratch: MaterializeScratch | undefined,
  pureFnContext: PureFnExecutionContext,
): number {
  const fieldExpr = table.nodes[expr.field];
  if (!fieldExpr) {
    throw new Error(`Reduce field expression ${expr.field} not found`);
  }
  const card = requireInst(fieldExpr.type.extent.cardinality, 'cardinality');
  if (card.kind !== 'many') {
    throw new Error('Reduce input must be many-cardinality');
  }
  const instanceRef = card.instance;
  const reduceInstanceId = (typeof instanceRef === 'object' ? instanceRef.instanceId : instanceRef) as InstanceId;
  const instanceDecl = program.schedule.instances.get(reduceInstanceId);
  const laneCount = instanceDecl
    ? resolveInstanceLaneCount(instanceDecl, program, state, pureFnContext)
    : 0;
  if (laneCount <= 0) {
    return 0;
  }

  const reduceStride = payloadStride(fieldExpr.type.payload);
  if (reduceStride !== 1) {
    throw new Error(`Reduce scalar evaluation supports scalar payload only (stride=${reduceStride})`);
  }

  const fieldValues = materializeValueExpr(
    expr.field,
    table,
    reduceInstanceId,
    laneCount,
    state,
    program,
    undefined,
    scratch,
    pureFnContext,
  );
  return reduceScalarBuffer(fieldValues, laneCount, expr.op);
}

function evaluateScalarForMaterialize(
  exprId: ValueExprId,
  table: ValueExprTable,
  state: RuntimeState,
  program: CompiledProgramIR,
  scratch: MaterializeScratch | undefined,
  pureFnContext: PureFnExecutionContext,
): number {
  const context: ScalarEvalContext = {
    pureFnContext,
    // [LAW:one-source-of-truth] Reduce has exactly one runtime implementation.
    // Scalar evaluation delegates reduce kernels back to the materializer path.
    evaluateReduceKernel: (expr, _valueExprs, runtimeState) =>
      materializeReduceScalar(expr, table, runtimeState, program, scratch, pureFnContext),
    evaluateShapeRef: (expr, _valueExprs, runtimeState) =>
      evaluateShapeRefHandle(expr, table, runtimeState, program, scratch, pureFnContext),
  };
  return evaluateValueExprScalar(exprId, table.nodes, state, context);
}

/**
 * Value expression table for materialization.
 *
 * Contains all ValueExpr nodes (ones, fields, events).
 * Materialization traverses this table to compute field outputs.
 */
export interface ValueExprTable {
  readonly nodes: readonly ValueExpr[];
}

function laneComponentIndex(lane: number, component: number, stride: number): number {
  return lane * stride + component;
}

function resolveMaterializeBuffer(
  target: Float32Array | undefined,
  length: number,
  scratch: MaterializeScratch | undefined,
): Float32Array {
  if (target) return target;
  if (scratch) return scratch.allocF32(length);
  return new Float32Array(length);
}

/**
 * Materialize a field-extent ValueExpr to a Float32Array buffer.
 *
 * This is the main entry point for field materialization.
 * It dispatches to specialized materializers based on expr.kind.
 *
 * @param exprId - The ValueExpr ID to materialize
 * @param table - The value expression table
 * @param instanceId - The instance context
 * @param count - Number of lanes to materialize
 * @param state - Runtime state
 * @param program - Compiled program
 * @param target - Optional destination buffer
 * @param scratch - Scratch allocator for recursive materialization
 * @returns Float32Array buffer with materialized values
 */
export function materializeValueExpr(
  exprId: ValueExprId,
  table: ValueExprTable,
  instanceId: InstanceId,
  count: number,
  state: RuntimeState,
  program: CompiledProgramIR,
  target?: Float32Array,
  scratch?: MaterializeScratch,
  pureFnContext?: PureFnExecutionContext,
): Float32Array {
  const activePureFnContext =
    pureFnContext !== undefined
      ? pureFnContext
      : { kernelRegistry: program.kernelRegistry };
  const expr = table.nodes[exprId];
  if (!expr) {
    throw new Error(`ValueExpr ${exprId} not found in table`);
  }

  const stride = payloadStride(expr.type.payload);
  const requiredLength = count * stride;
  const buf = resolveMaterializeBuffer(target, requiredLength, scratch);
  if (buf.length < requiredLength) {
    throw new Error(
      `materializeValueExpr target too small: need ${requiredLength}, got ${buf.length} for expr ${exprId}`,
    );
  }

  // Dispatch based on expr.kind
  switch (expr.kind) {
    case 'const': {
      // WI-4: Const - fill buffer with constant value
      fillBufferWithConst(buf, expr.value, count, stride);
      break;
    }

    case 'intrinsic': {
      // WI-4: Intrinsic - materialize instance-bound data
      if (expr.intrinsicKind === 'property') {
        const intrinsic = expr.intrinsic;
        materializeIntrinsic(buf, intrinsic, instanceId, count, state, program);
      } else {
        // Placement intrinsic: uv, rank, seed with basis kind
        materializePlacement(buf, expr.field, expr.basisKind, count, stride);
      }
      break;
    }

    case 'kernel': {
      // WI-4: Kernel - dispatch to kernel-specific materialization
      materializeKernel(
        expr,
        buf,
        table,
        instanceId,
        count,
        state,
        program,
        scratch,
        stride,
        activePureFnContext,
      );
      break;
    }

    case 'construct': {
      // WI-4: Construct - combine component fields into composite
      const componentCount = expr.components.length;
      const componentBufs = new Array<Float32Array>(componentCount);
      for (let c = 0; c < componentCount; c++) {
        componentBufs[c] = materializeValueExpr(
          expr.components[c],
          table,
          instanceId,
          count,
          state,
          program,
          undefined,
          scratch,
          activePureFnContext,
        );
      }
      // Interleave components into output buffer
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < componentCount; c++) {
          buf[laneComponentIndex(i, c, stride)] = componentBufs[c][i];
        }
      }
      break;
    }

    case 'extract': {
      // WI-4: Extract - extract single component from composite
      const inputBuf = materializeValueExpr(
        expr.input,
        table,
        instanceId,
        count,
        state,
        program,
        undefined,
        scratch,
        activePureFnContext,
      );
      const inputExpr = table.nodes[expr.input];
      const inputStride = payloadStride(inputExpr.type.payload);
      for (let i = 0; i < count; i++) {
        buf[i] = inputBuf[laneComponentIndex(i, expr.componentIndex, inputStride)];
      }
      break;
    }

    case 'oklchToRgb': {
      // WI-4: OKLCH→RGB color space conversion
      const inputBuf = materializeValueExpr(
        expr.input,
        table,
        instanceId,
        count,
        state,
        program,
        undefined,
        scratch,
        activePureFnContext,
      );
      oklchToRgbaConversion(buf, inputBuf, count);
      break;
    }

    // REMOVED 2026-02-06: slotRead case - dead code
    // SlotRead expressions are never generated by the compiler.

    case 'state': {
      // State read - copy from persistent state using resolved physical slot
      if (expr.resolvedSlot === undefined) {
        throw new Error(`State expression for key "${expr.stateKey}" has no resolved slot — binding pass may not have run`);
      }
      const stateSlot = expr.resolvedSlot as number;
      // Copy directly via subarray view (no intermediate allocation)
      buf.set(state.state.subarray(stateSlot, stateSlot + count * stride));
      break;
    }

    case 'external':
    case 'eventRead': {
      // [LAW:dataflow-not-control-flow] Scalar reads materialize by writing
      // their evaluated value through the same buffer path as all other materialize ops.
      const oneValue = evaluateScalarForMaterialize(
        exprId,
        table,
        state,
        program,
        scratch,
        activePureFnContext,
      );
      fillBufferWithOne(buf, oneValue, count, stride);
      break;
    }

    case 'time': {
      if (expr.which === 'palette') {
        const palette = state.time?.palette;
        if (!(palette instanceof Float32Array) || palette.length !== 4) {
          throw new Error('time.palette must be Float32Array(4) in RGBA [0..1]');
        }
        for (let lane = 0; lane < count; lane++) {
          const base = lane * stride;
          buf[base + 0] = palette[0];
          buf[base + 1] = palette[1];
          buf[base + 2] = palette[2];
          buf[base + 3] = palette[3];
        }
        break;
      }
      const oneValue = evaluateScalarForMaterialize(
        exprId,
        table,
        state,
        program,
        scratch,
        activePureFnContext,
      );
      fillBufferWithOne(buf, oneValue, count, stride);
      break;
    }

    case 'event':
      throw new Error(`Cannot materialize one/event expression as field: ${expr.kind}`);

    case 'shapeRef': {
      // [LAW:dataflow-not-control-flow] shapeRef flows through the same scalar
      // materialization path as all one-values; variability lives in handle data.
      const handle = evaluateScalarForMaterialize(
        exprId,
        table,
        state,
        program,
        scratch,
        activePureFnContext,
      );
      fillBufferWithOne(buf, handle, count, stride);
      break;
    }

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Cannot materialize expression kind: ${(expr as ValueExpr).kind}`);
    }
  }

  return buf;
}

/**
 * Materialize a kernel expression.
 *
 * Kernels are pure compute operations (map, zip, broadcast, etc.).
 * This dispatcher handles all kernel variants.
 */
function materializeKernel(
  expr: ValueExprKernel,
  buf: Float32Array,
  table: ValueExprTable,
  instanceId: InstanceId,
  count: number,
  state: RuntimeState,
  program: CompiledProgramIR,
  scratch: MaterializeScratch | undefined,
  stride: number,
  pureFnContext: PureFnExecutionContext,
): void {
  switch (expr.kernelKind) {
    case 'map': {
      // WI-4: Map - apply function to each lane
      const input = materializeValueExpr(
        expr.input,
        table,
        instanceId,
        count,
        state,
        program,
        undefined,
        scratch,
        pureFnContext,
      );
      applyMap(buf, input, expr.fn, count, stride, pureFnContext);
      break;
    }

    case 'zip': {
      // WI-4: Zip - combine multiple inputs with a function
      const inputCount = expr.inputs.length;
      const inputs = new Array<Float32Array>(inputCount);
      for (let j = 0; j < inputCount; j++) {
        inputs[j] = materializeValueExpr(
          expr.inputs[j],
          table,
          instanceId,
          count,
          state,
          program,
          undefined,
          scratch,
          pureFnContext,
        );
      }
      applyZip(buf, inputs, expr.fn, count, stride, pureFnContext);
      break;
    }

    case 'broadcast': {
      // WI-4: Broadcast - expand one to many
      // [LAW:single-enforcer] Illegal many-cardinality broadcast sources are rejected
      // during schedule construction; runtime only executes the canonical one→many path.

      // For multi-component one values (vec2, color, etc), evaluate each component separately
      if (expr.oneComponents && expr.oneComponents.length > 1) {
        // Multi-component broadcast: evaluate and interleave components
        const compCount = expr.oneComponents.length;
        const componentValues = new Array<number>(compCount);
        for (let j = 0; j < compCount; j++) {
          componentValues[j] = evaluateScalarForMaterialize(
            expr.oneComponents[j],
            table,
            state,
            program,
            scratch,
            pureFnContext,
          );
        }
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < componentValues.length; c++) {
            buf[laneComponentIndex(i, c, stride)] = componentValues[c];
          }
        }
      } else {
        // Single-component broadcast: fill entire buffer with one-cardinality value
        const oneValue = evaluateScalarForMaterialize(
          expr.one,
          table,
          state,
          program,
          scratch,
          pureFnContext,
        );
        fillBufferWithOne(buf, oneValue, count, stride);
      }
      break;
    }

    case 'zipPromote': {
      // WI-4: ZipPromote - combine field with ones
      const fieldInput = materializeValueExpr(
        expr.field,
        table,
        instanceId,
        count,
        state,
        program,
        undefined,
        scratch,
        pureFnContext,
      );
      const oneCount = expr.ones.length;
      const oneValues = new Array<number>(oneCount);
      for (let j = 0; j < oneCount; j++) {
        oneValues[j] = evaluateScalarForMaterialize(
          expr.ones[j],
          table,
          state,
          program,
          scratch,
          pureFnContext,
        );
      }
      applyZipPromote(buf, fieldInput, oneValues, expr.fn, count, stride, instanceId, program, pureFnContext);
      break;
    }

    case 'pathDerivative': {
      // WI-4: PathDerivative - materialize input, compute derivative
      const input = materializeValueExpr(
        expr.field,
        table,
        instanceId,
        count,
        state,
        program,
        undefined,
        scratch,
        pureFnContext,
      ) as Float32Array;
      // Read topology ID from expression (Phase 1: available but not yet used for dispatch)
      const topologyId = expr.topologyId;
      // Future: Look up topology for bezier dispatch
      // const topology = getTopology(topologyId) as PathTopologyDef;
      // if (topology.hasCubic || topology.hasQuad) { ... }

      if (expr.op === 'tangent') {
        fillBufferTangent(buf, input, count);
      } else if (expr.op === 'arcLength') {
        fillBufferArcLength(buf, input, count);
      } else {
        const _exhaustive: never = expr.op;
        throw new Error(`Unknown pathDerivative op: ${_exhaustive}`);
      }
      break;
    }

    case 'pathSample': {
      // Cross-instance arc-length parameterized path sampling
      // controlPoints: Field<vec2> over source instance (N points)
      // tField: Field<float> over target instance (M elements, 0..1)
      const sourceExpr = table.nodes[expr.controlPoints];
      const sourceInstanceId = requireInst(sourceExpr.type.extent.cardinality, 'cardinality');
      if (sourceInstanceId.kind !== 'many') {
        throw new Error('pathSample: controlPoints must be field (many cardinality)');
      }
      // Resolve source instance count from program schedule
      const sourceInstRef = sourceInstanceId.instance;
      const sourceInstId = (typeof sourceInstRef === 'object' ? sourceInstRef.instanceId : sourceInstRef) as InstanceId;
      const sourceDecl = program.schedule.instances.get(sourceInstId);
      const sourceCount = sourceDecl
        ? resolveInstanceLaneCount(sourceDecl, program, state, pureFnContext)
        : 0;

      // Materialize controlPoints with source instance count
      const cpBuf = materializeValueExpr(
        expr.controlPoints,
        table,
        sourceInstId,
        sourceCount,
        state,
        program,
        undefined,
        scratch,
        pureFnContext,
      );
      // Materialize tField with target count (M, the normal count parameter)
      const tBuf = materializeValueExpr(
        expr.tField,
        table,
        instanceId,
        count,
        state,
        program,
        undefined,
        scratch,
        pureFnContext,
      );

      // Look up topology for closed flag
      const topology = getProgramTopology(program, expr.topologyId);
      if (!isPathTopology(topology)) {
        throw new Error(`pathSample: topology ${String(expr.topologyId)} is not a path topology`);
      }
      const closed = topology.closed;

      if (expr.op === 'position') {
        fillBufferPathSamplePosition(buf, cpBuf, sourceCount, tBuf, count, closed, stride);
      } else if (expr.op === 'tangentAngle') {
        fillBufferPathSampleTangentAngle(buf, cpBuf, sourceCount, tBuf, count, closed);
      } else {
        const _exhaustive: never = expr.op;
        throw new Error(`Unknown pathSample op: ${_exhaustive}`);
      }
      break;
    }

    case 'reduce': {
      // [LAW:one-source-of-truth] Reduce is materialized through the same kernel
      // implementation used by scalar fallback evaluation.
      const reducedValue = materializeReduceScalar(expr, table, state, program, scratch, pureFnContext);
      fillBufferWithOne(buf, reducedValue, count, stride);
      break;
    }

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown kernel kind: ${(_exhaustive as ValueExprKernel).kernelKind}`);
    }
  }
}

/**
 * Fill buffer with a constant value (stride-aware).
 *
 * @param buf - Output buffer
 * @param value - Constant value to fill
 * @param count - Number of elements (not components)
 * @param stride - Stride per element
 */
function fillBufferWithConst(
  buf: Float32Array,
  value: ConstValue,
  count: number,
  stride: number
): void {
  if (value.kind === 'float') {
    for (let i = 0; i < count * stride; i++) {
      buf[i] = value.value;
    }
  } else if (value.kind === 'vec2') {
    for (let i = 0; i < count; i++) {
      buf[laneComponentIndex(i, 0, 2)] = value.value[0];
      buf[laneComponentIndex(i, 1, 2)] = value.value[1];
    }
  } else if (value.kind === 'vec3') {
    for (let i = 0; i < count; i++) {
      buf[laneComponentIndex(i, 0, 3)] = value.value[0];
      buf[laneComponentIndex(i, 1, 3)] = value.value[1];
      buf[laneComponentIndex(i, 2, 3)] = value.value[2];
    }
  } else if (value.kind === 'vec4') {
    for (let i = 0; i < count; i++) {
      buf[laneComponentIndex(i, 0, 4)] = value.value[0];
      buf[laneComponentIndex(i, 1, 4)] = value.value[1];
      buf[laneComponentIndex(i, 2, 4)] = value.value[2];
      buf[laneComponentIndex(i, 3, 4)] = value.value[3];
    }
  } else if (value.kind === 'color') {
    for (let i = 0; i < count; i++) {
      buf[laneComponentIndex(i, 0, 4)] = value.value[0];
      buf[laneComponentIndex(i, 1, 4)] = value.value[1];
      buf[laneComponentIndex(i, 2, 4)] = value.value[2];
      buf[laneComponentIndex(i, 3, 4)] = value.value[3];
    }
  } else if (value.kind === 'int' || value.kind === 'bool' || value.kind === 'cameraProjection') {
    // Scalar-like types are encoded as float in the field buffer.
    const numVal = constValueAsNumber(value);
    for (let i = 0; i < count * stride; i++) {
      buf[i] = numVal;
    }
  } else {
    const _exhaustive: never = value;
    const unknownKind = (_exhaustive as { kind?: string }).kind;
    throw new Error(
      `Unsupported const value kind: ${String(unknownKind !== undefined ? unknownKind : 'unknown')}`,
    );
  }
}

/**
 * Fill buffer by broadcasting a one-cardinality value to all lanes.
 *
 * @param buf - Output buffer
 * @param oneValue - One-cardinality value to broadcast
 * @param count - Number of elements
 * @param stride - Stride per element
 */
function fillBufferWithOne(
  buf: Float32Array,
  oneValue: number,
  count: number,
  stride: number
): void {
  for (let i = 0; i < count * stride; i++) {
    buf[i] = oneValue;
  }
}

// =============================================================================
// Pre-allocated args buffers for kernel hot loops (single-threaded safe)
// These eliminate per-instance-per-component array allocations.
// =============================================================================

/** Reusable single-element args buffer for applyMap */
const _mapArgs: number[] = [0];

/** Reusable args buffer for applyZip (resized as needed) */
const _zipArgs: number[] = [];

/** Reusable args buffer for applyZipPromote (resized as needed) */
const _zipPromoteArgs: number[] = [];

/**
 * Apply a map function (unary kernel).
 * Zero per-instance allocations — reuses module-level args buffer.
 */
function applyMap(
  out: Float32Array,
  input: Float32Array,
  fn: PureFn,
  count: number,
  stride: number,
  pureFnContext: PureFnExecutionContext,
): void {
  for (let i = 0; i < count; i++) {
    const base = i * stride;
    for (let c = 0; c < stride; c++) {
      _mapArgs[0] = input[base + c];
      out[base + c] = evaluatePureFn(fn, _mapArgs, pureFnContext);
    }
  }
}

/**
 * Apply a zip function (n-ary kernel).
 * Zero per-instance allocations — reuses module-level args buffer.
 */
function applyZip(
  out: Float32Array,
  inputs: Float32Array[],
  fn: PureFn,
  count: number,
  stride: number,
  pureFnContext: PureFnExecutionContext,
): void {
  const n = inputs.length;
  _zipArgs.length = n;

  for (let i = 0; i < count; i++) {
    const base = i * stride;
    for (let c = 0; c < stride; c++) {
      for (let j = 0; j < n; j++) {
        _zipArgs[j] = inputs[j][base + c];
      }
      out[base + c] = evaluatePureFn(fn, _zipArgs, pureFnContext);
    }
  }
}

/**
 * Apply a zipPromote function (field + ones).
 * One allocation per call (args array) — not per instance.
 */
function applyZipPromote(
  out: Float32Array,
  fieldInput: Float32Array,
  oneValues: number[],
  fn: PureFn,
  count: number,
  stride: number,
  instanceId: InstanceId,
  program: CompiledProgramIR,
  pureFnContext: PureFnExecutionContext,
): void {
  const argCount = 1 + oneValues.length;
  _zipPromoteArgs.length = argCount;
  // Copy one-cardinality values once (constant across all instances)
  for (let s = 0; s < oneValues.length; s++) {
    _zipPromoteArgs[1 + s] = oneValues[s];
  }

  for (let i = 0; i < count; i++) {
    const base = i * stride;
    for (let c = 0; c < stride; c++) {
      _zipPromoteArgs[0] = fieldInput[base + c];
      out[base + c] = evaluatePureFn(fn, _zipPromoteArgs, pureFnContext);
    }
  }
}

/**
 * Evaluate a pure function with given arguments.
 *
 * Delegates to OpcodeInterpreter for all opcode operations.
 * This ensures SINGLE ENFORCER: all scalar math is defined in one place.
 *
 * @param fn - Function descriptor
 * @param args - Input arguments
 * @returns Result value
 */
function evaluatePureFn(fn: PureFn, args: number[], pureFnContext: PureFnExecutionContext): number {
  // [LAW:single-enforcer] All PureFn execution is delegated to the shared
  // scalar kernel library so scalar + field paths cannot diverge.
  return applySharedPureFn(fn, args, pureFnContext);
}

/**
 * Materialize an intrinsic field.
 *
 * @param buf - Output buffer
 * @param intrinsic - Intrinsic name
 * @param instanceId - Instance context
 * @param count - Number of elements
 * @param state - Runtime state
 * @param program - Compiled program
 */
function materializeIntrinsic(
  buf: Float32Array,
  intrinsic: string,
  instanceId: InstanceId,
  count: number,
  state: RuntimeState,
  program: CompiledProgramIR
): void {
  if (intrinsic === 'index') {
    for (let i = 0; i < count; i++) {
      buf[i] = i;
    }
  } else if (intrinsic === 'normalizedIndex') {
    for (let i = 0; i < count; i++) {
      buf[i] = count > 1 ? i / (count - 1) : 0;
    }
  } else if (intrinsic === 'randomId') {
    // Generate stable random IDs per instance using hash function
    // seed=0 for deterministic randomness based on index
    for (let i = 0; i < count; i++) {
      buf[i] = applyOpcode('hash', [i, 0]);
    }
  } else {
    throw new Error(`Unknown intrinsic: ${intrinsic}`);
  }
}

/**
 * Materialize placement basis field (uv, rank, seed).
 *
 * Produces per-element values based on the chosen basis algorithm.
 * - uv: 2D coordinates in [0,1]² (stride=2)
 * - rank: 1D ordering value in [0,1) (stride=1)
 * - seed: pseudo-random value per element (stride=1)
 */
function materializePlacement(
  buf: Float32Array,
  field: import('../compiler/ir/types').PlacementFieldName,
  basisKind: import('../compiler/ir/types').BasisKind,
  count: number,
  stride: number
): void {
  switch (field) {
    case 'uv': {
      // Produce vec2 UV coordinates based on basis kind
      switch (basisKind) {
        case 'grid': {
          // Grid-aligned: approximate square grid from count
          const cols = Math.ceil(Math.sqrt(count));
          const rows = Math.ceil(count / cols);
          for (let i = 0; i < count; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            buf[laneComponentIndex(i, 0, stride)] = cols > 1 ? col / (cols - 1) : 0.5;
            buf[laneComponentIndex(i, 1, stride)] = rows > 1 ? row / (rows - 1) : 0.5;
          }
          break;
        }
        case 'halton2D': {
          // Halton sequence bases 2 and 3
          for (let i = 0; i < count; i++) {
            buf[laneComponentIndex(i, 0, stride)] = halton(i + 1, 2);
            buf[laneComponentIndex(i, 1, stride)] = halton(i + 1, 3);
          }
          break;
        }
        case 'spiral': {
          // Fermat spiral
          const goldenAngle = Math.PI * (3 - Math.sqrt(5));
          for (let i = 0; i < count; i++) {
            const r = Math.sqrt(i / count);
            const theta = i * goldenAngle;
            buf[laneComponentIndex(i, 0, stride)] = 0.5 + 0.5 * r * Math.cos(theta);
            buf[laneComponentIndex(i, 1, stride)] = 0.5 + 0.5 * r * Math.sin(theta);
          }
          break;
        }
        case 'random': {
          // Pseudo-random (deterministic from index)
          for (let i = 0; i < count; i++) {
            buf[laneComponentIndex(i, 0, stride)] = pseudoRandom(i * 2);
            buf[laneComponentIndex(i, 1, stride)] = pseudoRandom(i * 2 + 1);
          }
          break;
        }
      }
      break;
    }
    case 'rank': {
      // 1D ordering value in [0, 1)
      for (let i = 0; i < count; i++) {
        buf[laneComponentIndex(i, 0, stride)] = count > 1 ? i / (count - 1) : 0;
      }
      break;
    }
    case 'seed': {
      // Pseudo-random stable seed per element
      for (let i = 0; i < count; i++) {
        buf[laneComponentIndex(i, 0, stride)] = pseudoRandom(i);
      }
      break;
    }
  }
}

/** Halton sequence value for index n in given base. */
function halton(n: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = n;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

/** Simple deterministic pseudo-random from integer seed. */
function pseudoRandom(seed: number): number {
  let x = (seed + 1) * 2654435761;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = (x >>> 16) ^ x;
  return (x & 0x7fffffff) / 0x7fffffff;
}

/**
 * OKLCH→RGBA color space conversion.
 *
 * @param out - Output buffer (RGBA)
 * @param input - Input buffer (OKLCH+A)
 * @param count - Number of colors
 */
function oklchToRgbaConversion(
  out: Float32Array,
  input: Float32Array,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    const h = input[offset];
    const c = input[offset + 1];
    const l = input[offset + 2];
    oklchToEncodedSrgbInto(out, offset, h, c, l);
    out[offset + 3] = input[offset + 3]; // Alpha passthrough
  }
}

// =============================================================================
// Path Derivative Kernels
// =============================================================================

/**
 * Fill buffer with tangent vectors (WI-4)
 *
 * Matches legacy Materializer.ts:665-697 behavior for fillBufferTangent.
 *
 * MVP Scope: Polygonal paths (central difference approximation).
 * For N control points:
 *   tangent[i] = (point[i+1] - point[i-1]) / 2
 * Assumes closed path (wraps around).
 *
 * Edge cases:
 * - Single point (N=1): tangent = (0, 0, 0)
 * - Two points (N=2): tangent = (next - prev) / 2 where prev/next wrap
 *
 * Output: VEC3 (z=0) for 2D paths
 *
 * @param out - Output buffer for tangent vectors (vec3, length N*3)
 * @param input - Input buffer for control points (vec2, length N*2)
 * @param count - Number of points (not components)
 */
function fillBufferTangent(
  out: Float32Array,
  input: Float32Array,
  count: number
): void {
  if (count === 0) return;

  if (count === 1) {
    // Single point: no tangent
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }

  // Central difference for each point
  // For closed path: [P0, P1, ..., PN-1] where PN wraps to P0
  for (let i = 0; i < count; i++) {
    const prevIdx = (i - 1 + count) % count;  // Wrap around for closed path
    const nextIdx = (i + 1) % count;

    const prevX = input[prevIdx * 2];
    const prevY = input[prevIdx * 2 + 1];
    const nextX = input[nextIdx * 2];
    const nextY = input[nextIdx * 2 + 1];

    // Central difference: (next - prev) / 2, z=0
    out[i * 3] = (nextX - prevX) / 2;
    out[i * 3 + 1] = (nextY - prevY) / 2;
    out[i * 3 + 2] = 0;
  }
}

/**
 * Fill buffer with cumulative arc length (WI-4)
 *
 * Matches legacy Materializer.ts:698-725 behavior for fillBufferArcLength.
 *
 * MVP Scope: Polygonal paths (Euclidean distance between consecutive points).
 * For N control points:
 *   arcLength[0] = 0
 *   arcLength[i] = arcLength[i-1] + ||point[i] - point[i-1]||
 *
 * Edge cases:
 * - Single point (N=1): arcLength = [0]
 * - Returns monotonically increasing values
 *
 * @param out - Output buffer for arc lengths (float, length N)
 * @param input - Input buffer for control points (vec2, length N*2)
 * @param count - Number of points
 */
function fillBufferArcLength(
  out: Float32Array,
  input: Float32Array,
  count: number
): void {
  if (count === 0) return;

  out[0] = 0;

  if (count === 1) return;

  let totalDistance = 0;

  // Sum segment distances from point 0 to point i
  for (let i = 1; i < count; i++) {
    const prevX = input[(i - 1) * 2];
    const prevY = input[(i - 1) * 2 + 1];
    const currX = input[i * 2];
    const currY = input[i * 2 + 1];

    const dx = currX - prevX;
    const dy = currY - prevY;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    totalDistance += segmentLength;

    out[i] = totalDistance;
  }
}

// =============================================================================
// Path Sample Kernels (Cross-Instance Arc-Length Parameterized Sampling)
// =============================================================================

/**
 * Build cumulative arc-length table from control points (vec2).
 *
 * @param cpBuf - Control points buffer (vec2, stride=2, length N*2)
 * @param N - Number of control points
 * @param closed - Whether path is closed (adds segment from last→first)
 * @returns { table: cumulative arc lengths per segment end, totalLength }
 */
export function buildArcLengthTable(
  cpBuf: Float32Array,
  N: number,
  closed: boolean
): { table: Float32Array; totalLength: number } {
  const segCount = closed ? N : N - 1;
  if (segCount <= 0) return { table: new Float32Array(0), totalLength: 0 };

  const table = new Float32Array(segCount);
  let cumulative = 0;

  for (let s = 0; s < segCount; s++) {
    const i0 = s;
    const i1 = (s + 1) % N;
    const dx = cpBuf[i1 * 2] - cpBuf[i0 * 2];
    const dy = cpBuf[i1 * 2 + 1] - cpBuf[i0 * 2 + 1];
    cumulative += Math.sqrt(dx * dx + dy * dy);
    table[s] = cumulative;
  }

  return { table, totalLength: cumulative };
}

/**
 * Binary search to find segment index and fractional position for a target distance.
 *
 * @param table - Cumulative arc-length table
 * @param targetDist - Target distance along path
 * @returns { segIndex, frac } where frac is 0..1 within the segment
 */
export function findSegment(
  table: Float32Array,
  targetDist: number
): { segIndex: number; frac: number } {
  const segCount = table.length;
  if (segCount === 0) return { segIndex: 0, frac: 0 };

  // Binary search for first table[i] >= targetDist
  let lo = 0;
  let hi = segCount - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (table[mid] < targetDist) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const segIndex = lo;
  const segEnd = table[segIndex];
  const segStart = segIndex > 0 ? table[segIndex - 1] : 0;
  const segLen = segEnd - segStart;
  const frac = segLen > 0 ? (targetDist - segStart) / segLen : 0;

  return { segIndex, frac };
}

/**
 * Fill buffer with path-sampled positions.
 *
 * For each target lane i:
 *   t = tBuf[i] (0..1)
 *   targetDist = t * totalLength
 *   binary search → segment + frac
 *   LERP between segment endpoints → vec2 (z=0 for vec3)
 *
 * @param out - Output buffer (vec2 or vec3 depending on stride)
 * @param cpBuf - Control points (vec2, N*2)
 * @param N - Number of control points
 * @param tBuf - T values (float, M*1)
 * @param M - Number of target lanes
 * @param closed - Whether path is closed
 * @param outStride - Output stride (2 for vec2, 3 for vec3)
 */
function fillBufferPathSamplePosition(
  out: Float32Array,
  cpBuf: Float32Array,
  N: number,
  tBuf: Float32Array,
  M: number,
  closed: boolean,
  outStride: number
): void {
  // Degenerate: no control points → all zeros
  if (N === 0) {
    out.fill(0);
    return;
  }

  // Single point → all outputs at that point
  if (N === 1) {
    const px = cpBuf[0];
    const py = cpBuf[1];
    for (let i = 0; i < M; i++) {
      out[i * outStride] = px;
      out[i * outStride + 1] = py;
      if (outStride >= 3) out[i * outStride + 2] = 0;
    }
    return;
  }

  const { table, totalLength } = buildArcLengthTable(cpBuf, N, closed);

  if (totalLength === 0) {
    // Zero-length path → all outputs at first point
    const px = cpBuf[0];
    const py = cpBuf[1];
    for (let i = 0; i < M; i++) {
      out[i * outStride] = px;
      out[i * outStride + 1] = py;
      if (outStride >= 3) out[i * outStride + 2] = 0;
    }
    return;
  }

  for (let i = 0; i < M; i++) {
    const t = tBuf[i];
    const targetDist = t * totalLength;
    const { segIndex, frac } = findSegment(table, targetDist);

    const i0 = segIndex;
    const i1 = (segIndex + 1) % N;

    const x0 = cpBuf[i0 * 2];
    const y0 = cpBuf[i0 * 2 + 1];
    const x1 = cpBuf[i1 * 2];
    const y1 = cpBuf[i1 * 2 + 1];

    out[i * outStride] = x0 + (x1 - x0) * frac;
    out[i * outStride + 1] = y0 + (y1 - y0) * frac;
    if (outStride >= 3) out[i * outStride + 2] = 0;
  }
}

/**
 * Fill buffer with path-sampled tangent angles.
 *
 * For each target lane i:
 *   t = tBuf[i] → find segment via arc-length table
 *   angle = atan2(dy, dx) of that segment
 *
 * @param out - Output buffer (float, M)
 * @param cpBuf - Control points (vec2, N*2)
 * @param N - Number of control points
 * @param tBuf - T values (float, M)
 * @param M - Number of target lanes
 * @param closed - Whether path is closed
 */
function fillBufferPathSampleTangentAngle(
  out: Float32Array,
  cpBuf: Float32Array,
  N: number,
  tBuf: Float32Array,
  M: number,
  closed: boolean
): void {
  // Degenerate cases
  if (N <= 1) {
    out.fill(0);
    return;
  }

  const { table, totalLength } = buildArcLengthTable(cpBuf, N, closed);

  if (totalLength === 0) {
    out.fill(0);
    return;
  }

  for (let i = 0; i < M; i++) {
    const t = tBuf[i];
    const targetDist = t * totalLength;
    const { segIndex } = findSegment(table, targetDist);

    const i0 = segIndex;
    const i1 = (segIndex + 1) % N;

    const dx = cpBuf[i1 * 2] - cpBuf[i0 * 2];
    const dy = cpBuf[i1 * 2 + 1] - cpBuf[i0 * 2 + 1];

    // Zero-length segment → angle 0
    out[i] = (dx === 0 && dy === 0) ? 0 : Math.atan2(dy, dx);
  }
}
