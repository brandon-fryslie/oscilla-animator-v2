/**
 * ValueExpr Materializer - Field Materialization
 *
 * Evaluates ValueExpr nodes to produce Float32Array buffers.
 * Works alongside signal evaluation to materialize field-extent expressions.
 *
 * Key design principles:
 * - Unified ValueExpr table (no separate field/signal/event tables)
 * - Materialization is for field-extent expressions only
 * - Signals are evaluated via evaluateValueExprScalar() (not materialized)
 * - Buffer reuse via BufferPool (no allocation in hot path)
 */

import type { RuntimeState } from './RuntimeState';
import type { ValueExpr, ValueExprKernel } from '../compiler/ir/value-expr';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { PureFn } from '../compiler/ir/types';
import type { InstanceId } from '../compiler/ir/Indices';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type { BufferPool } from './BufferPool';
import { evaluateValueExprScalar } from './ValueExprScalarEvaluator';
import { requireInst } from '../core/canonical-types';
import { payloadStride } from '../core/canonical-types';
import { getTopology } from '../shapes/registry';
import type { PathTopologyDef } from '../shapes/types';
import { applyOpcode } from './OpcodeInterpreter';

/**
 * Value expression table for materialization.
 *
 * Contains all ValueExpr nodes (signals, fields, events).
 * Materialization traverses this table to compute field outputs.
 */
export interface ValueExprTable {
  readonly nodes: readonly ValueExpr[];
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
 * @param pool - Buffer pool for allocation
 * @returns Float32Array buffer with materialized values
 */
export function materializeValueExpr(
  exprId: ValueExprId,
  table: ValueExprTable,
  instanceId: InstanceId,
  count: number,
  state: RuntimeState,
  program: CompiledProgramIR,
  pool: BufferPool,
  target?: Float32Array,
): Float32Array {
  const expr = table.nodes[exprId];
  if (!expr) {
    throw new Error(`ValueExpr ${exprId} not found in table`);
  }

  const stride = payloadStride(expr.type.payload);
  const requiredLength = count * stride;
  const buf = target ?? (pool.alloc('f32', requiredLength) as Float32Array);
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
      materializeKernel(expr, buf, table, instanceId, count, state, program, pool, stride);
      break;
    }

    case 'construct': {
      // WI-4: Construct - combine component fields into composite
      const componentCount = expr.components.length;
      const componentBufs = new Array<Float32Array>(componentCount);
      for (let c = 0; c < componentCount; c++) {
        componentBufs[c] = materializeValueExpr(expr.components[c], table, instanceId, count, state, program, pool);
      }
      // Interleave components into output buffer
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < componentCount; c++) {
          buf[i * stride + c] = componentBufs[c][i];
        }
      }
      break;
    }

    case 'extract': {
      // WI-4: Extract - extract single component from composite
      const inputBuf = materializeValueExpr(expr.input, table, instanceId, count, state, program, pool);
      const inputExpr = table.nodes[expr.input];
      const inputStride = payloadStride(inputExpr.type.payload);
      for (let i = 0; i < count; i++) {
        buf[i] = inputBuf[i * inputStride + expr.componentIndex];
      }
      break;
    }

    case 'hslToRgb': {
      // WI-4: HSL→RGB color space conversion
      const inputBuf = materializeValueExpr(expr.input, table, instanceId, count, state, program, pool);
      hslToRgbConversion(buf, inputBuf, count);
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
    case 'time':
    case 'eventRead': {
      // [LAW:dataflow-not-control-flow] Scalar signal reads materialize by writing
      // their evaluated value through the same buffer path as all other materialize ops.
      const signalValue = evaluateValueExprScalar(exprId, table.nodes, state);
      fillBufferWithSignal(buf, signalValue, count, stride);
      break;
    }

    case 'event':
      throw new Error(`Cannot materialize signal/event expression as field: ${expr.kind}`);

    case 'shapeRef':
      throw new Error(`Shape references are not yet supported in materialize`);

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
  pool: BufferPool,
  stride: number
): void {
  switch (expr.kernelKind) {
    case 'map': {
      // WI-4: Map - apply function to each lane
      const input = materializeValueExpr(expr.input, table, instanceId, count, state, program, pool);
      applyMap(buf, input, expr.fn, count, stride);
      break;
    }

    case 'zip': {
      // WI-4: Zip - combine multiple inputs with a function
      const inputCount = expr.inputs.length;
      const inputs = new Array<Float32Array>(inputCount);
      for (let j = 0; j < inputCount; j++) {
        inputs[j] = materializeValueExpr(expr.inputs[j], table, instanceId, count, state, program, pool);
      }
      applyZip(buf, inputs, expr.fn, count, stride);
      break;
    }

    case 'broadcast': {
      // WI-4: Broadcast - expand signal to field
      // For multi-component signals (vec2, color, etc), evaluate each component separately
      if (expr.signalComponents && expr.signalComponents.length > 1) {
        // Multi-component broadcast: evaluate and interleave components
        const compCount = expr.signalComponents.length;
        const componentValues = new Array<number>(compCount);
        for (let j = 0; j < compCount; j++) {
          componentValues[j] = evaluateValueExprScalar(expr.signalComponents[j], table.nodes, state);
        }
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < componentValues.length; c++) {
            buf[i * stride + c] = componentValues[c];
          }
        }
      } else {
        // Single-component broadcast: fill entire buffer with signal value
        const signalValue = evaluateValueExprScalar(expr.signal, table.nodes, state);
        fillBufferWithSignal(buf, signalValue, count, stride);
      }
      break;
    }

    case 'zipSig': {
      // WI-4: ZipSig - combine field with signals
      const fieldInput = materializeValueExpr(expr.field, table, instanceId, count, state, program, pool);
      const sigCount = expr.signals.length;
      const sigValues = new Array<number>(sigCount);
      for (let j = 0; j < sigCount; j++) {
        sigValues[j] = evaluateValueExprScalar(expr.signals[j], table.nodes, state);
      }
      applyZipSig(buf, fieldInput, sigValues, expr.fn, count, stride, instanceId, program);
      break;
    }

    case 'pathDerivative': {
      // WI-4: PathDerivative - materialize input, compute derivative
      const input = materializeValueExpr(expr.field, table, instanceId, count, state, program, pool) as Float32Array;
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
      const rawCount = sourceDecl ? sourceDecl.count : 0;
      const sourceCount = typeof rawCount === 'number' ? rawCount : 0;

      // Materialize controlPoints with source instance count
      const cpBuf = materializeValueExpr(expr.controlPoints, table, sourceInstId, sourceCount, state, program, pool);
      // Materialize tField with target count (M, the normal count parameter)
      const tBuf = materializeValueExpr(expr.tField, table, instanceId, count, state, program, pool);

      // Look up topology for closed flag
      const topology = getTopology(expr.topologyId) as PathTopologyDef | undefined;
      const closed = topology ? topology.closed : false;

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
      // WI-4: Reduce is handled during signal evaluation, not materialization
      // This case should not be reached during field materialization
      throw new Error('Reduce is signal-extent, not field-extent');
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
  value: any, // ConstValue
  count: number,
  stride: number
): void {
  if (value.kind === 'float') {
    for (let i = 0; i < count * stride; i++) {
      buf[i] = value.value;
    }
  } else if (value.kind === 'vec2') {
    for (let i = 0; i < count; i++) {
      buf[i * 2] = value.value[0];
      buf[i * 2 + 1] = value.value[1];
    }
  } else if (value.kind === 'vec3') {
    for (let i = 0; i < count; i++) {
      buf[i * 3] = value.value[0];
      buf[i * 3 + 1] = value.value[1];
      buf[i * 3 + 2] = value.value[2];
    }
  } else if (value.kind === 'vec4') {
    for (let i = 0; i < count; i++) {
      buf[i * 4] = value.value[0];
      buf[i * 4 + 1] = value.value[1];
      buf[i * 4 + 2] = value.value[2];
      buf[i * 4 + 3] = value.value[3];
    }
  } else if (value.kind === 'color') {
    for (let i = 0; i < count; i++) {
      buf[i * 4] = value.value[0];
      buf[i * 4 + 1] = value.value[1];
      buf[i * 4 + 2] = value.value[2];
      buf[i * 4 + 3] = value.value[3];
    }
  } else if (value.kind === 'int' || value.kind === 'bool') {
    // Scalar types stored as float in the buffer
    const numVal = value.kind === 'bool' ? (value.value ? 1 : 0) : value.value;
    for (let i = 0; i < count * stride; i++) {
      buf[i] = numVal;
    }
  } else {
    throw new Error(`Unsupported const value kind: ${value.kind}`);
  }
}

/**
 * Fill buffer by broadcasting a signal value to all lanes.
 *
 * @param buf - Output buffer
 * @param signalValue - Signal value to broadcast
 * @param count - Number of elements
 * @param stride - Stride per element
 */
function fillBufferWithSignal(
  buf: Float32Array,
  signalValue: number,
  count: number,
  stride: number
): void {
  for (let i = 0; i < count * stride; i++) {
    buf[i] = signalValue;
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

/** Reusable args buffer for applyZipSig (resized as needed) */
const _zipSigArgs: number[] = [];

/**
 * Apply a map function (unary kernel).
 * Zero per-instance allocations — reuses module-level args buffer.
 */
function applyMap(
  out: Float32Array,
  input: Float32Array,
  fn: PureFn,
  count: number,
  stride: number
): void {
  for (let i = 0; i < count; i++) {
    const base = i * stride;
    for (let c = 0; c < stride; c++) {
      _mapArgs[0] = input[base + c];
      out[base + c] = evaluatePureFn(fn, _mapArgs);
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
  stride: number
): void {
  const n = inputs.length;
  _zipArgs.length = n;

  for (let i = 0; i < count; i++) {
    const base = i * stride;
    for (let c = 0; c < stride; c++) {
      for (let j = 0; j < n; j++) {
        _zipArgs[j] = inputs[j][base + c];
      }
      out[base + c] = evaluatePureFn(fn, _zipArgs);
    }
  }
}

/**
 * Apply a zipSig function (field + signals).
 * One allocation per call (args array) — not per instance.
 */
function applyZipSig(
  out: Float32Array,
  fieldInput: Float32Array,
  sigValues: number[],
  fn: PureFn,
  count: number,
  stride: number,
  instanceId: InstanceId,
  program: CompiledProgramIR
): void {
  const argCount = 1 + sigValues.length;
  _zipSigArgs.length = argCount;
  // Copy signal values once (constant across all instances)
  for (let s = 0; s < sigValues.length; s++) {
    _zipSigArgs[1 + s] = sigValues[s];
  }

  for (let i = 0; i < count; i++) {
    const base = i * stride;
    for (let c = 0; c < stride; c++) {
      _zipSigArgs[0] = fieldInput[base + c];
      out[base + c] = evaluatePureFn(fn, _zipSigArgs);
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
function evaluatePureFn(fn: PureFn, args: number[]): number {
  switch (fn.kind) {
    case 'opcode':
      // Delegate to single enforcer for all opcodes
      return applyOpcode(fn.opcode, args);

    case 'kernel':
      throw new Error(`Kernel functions not yet implemented: ${fn.name}`);

    case 'kernelResolved':
      throw new Error(`kernelResolved not yet implemented: ${fn.handle}`);

    case 'expr':
      throw new Error(`Expression evaluation not yet implemented: ${fn.expr}`);

    case 'composed': {
      // Apply each opcode in sequence (same pattern as SignalKernelLibrary)
      let result = args[0];
      for (const op of fn.ops) {
        result = applyOpcode(op, [result]);
      }
      return result;
    }

    default: {
      const _exhaustive: never = fn;
      throw new Error(`Unknown function kind: ${(_exhaustive as PureFn).kind}`);
    }
  }
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
            buf[i * stride] = cols > 1 ? col / (cols - 1) : 0.5;
            buf[i * stride + 1] = rows > 1 ? row / (rows - 1) : 0.5;
          }
          break;
        }
        case 'halton2D': {
          // Halton sequence bases 2 and 3
          for (let i = 0; i < count; i++) {
            buf[i * stride] = halton(i + 1, 2);
            buf[i * stride + 1] = halton(i + 1, 3);
          }
          break;
        }
        case 'spiral': {
          // Fermat spiral
          const goldenAngle = Math.PI * (3 - Math.sqrt(5));
          for (let i = 0; i < count; i++) {
            const r = Math.sqrt(i / count);
            const theta = i * goldenAngle;
            buf[i * stride] = 0.5 + 0.5 * r * Math.cos(theta);
            buf[i * stride + 1] = 0.5 + 0.5 * r * Math.sin(theta);
          }
          break;
        }
        case 'random': {
          // Pseudo-random (deterministic from index)
          for (let i = 0; i < count; i++) {
            buf[i * stride] = pseudoRandom(i * 2);
            buf[i * stride + 1] = pseudoRandom(i * 2 + 1);
          }
          break;
        }
      }
      break;
    }
    case 'rank': {
      // 1D ordering value in [0, 1)
      for (let i = 0; i < count; i++) {
        buf[i * stride] = count > 1 ? i / (count - 1) : 0;
      }
      break;
    }
    case 'seed': {
      // Pseudo-random stable seed per element
      for (let i = 0; i < count; i++) {
        buf[i * stride] = pseudoRandom(i);
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
 * HSL→RGB color space conversion.
 *
 * @param out - Output buffer (RGBA)
 * @param input - Input buffer (HSLA)
 * @param count - Number of colors
 */
function hslToRgbConversion(
  out: Float32Array,
  input: Float32Array,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    const h = input[offset];
    const s = input[offset + 1];
    const l = input[offset + 2];

    // Inline HSL→RGB (no tuple allocation)
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;
    const hSector = h * 6;

    if (hSector < 1) {
      r = c; g = x; b = 0;
    } else if (hSector < 2) {
      r = x; g = c; b = 0;
    } else if (hSector < 3) {
      r = 0; g = c; b = x;
    } else if (hSector < 4) {
      r = 0; g = x; b = c;
    } else if (hSector < 5) {
      r = x; g = 0; b = c;
    } else {
      r = c; g = 0; b = x;
    }

    out[offset] = r + m;
    out[offset + 1] = g + m;
    out[offset + 2] = b + m;
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
