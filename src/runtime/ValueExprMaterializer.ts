/**
 * ValueExpr Materializer - Field Materialization
 *
 * Evaluates ValueExpr nodes to produce Float32Array buffers.
 * Works alongside signal evaluation to materialize field-extent expressions.
 *
 * Key design principles:
 * - Unified ValueExpr table (no separate field/signal/event tables)
 * - Materialization is for field-extent expressions only
 * - Signals are evaluated via evaluateValueExprSignal() (not materialized)
 * - Buffer reuse via BufferPool (no allocation in hot path)
 */

import type { RuntimeState } from './RuntimeState';
import type { ValueExpr, ValueExprKernel } from '../compiler/ir/value-expr';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { PureFn } from '../compiler/ir/types';
import type { InstanceId } from '../compiler/ir/Indices';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type { BufferPool } from './BufferPool';
import { evaluateValueExprSignal } from './ValueExprSignalEvaluator';
import { requireInst } from '../core/canonical-types';
import { payloadStride } from '../core/canonical-types';
import { getTopology } from '../shapes/registry';
import type { PathTopologyDef } from '../shapes/types';

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
  pool: BufferPool
): Float32Array {
  const expr = table.nodes[exprId];
  if (!expr) {
    throw new Error(`ValueExpr ${exprId} not found in table`);
  }

  const stride = payloadStride(expr.type.payload);
  const buf = pool.alloc('f32', count * stride) as Float32Array;

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
      const componentBufs = expr.components.map(compId =>
        materializeValueExpr(compId, table, instanceId, count, state, program, pool)
      );
      // Interleave components into output buffer
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < componentBufs.length; c++) {
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

    case 'slotRead': {
      // WI-4: Slot read - copy from runtime slot
      const slot = expr.slot;
      // Copy from value store (assumes f64 storage for now)
      const sourceData = state.values.f64.slice(slot, slot + count * stride);
      buf.set(sourceData);
      break;
    }

    case 'state': {
      // WI-4: State read - copy from persistent state
      const stateSlot = expr.stateSlot;
      // Copy from state array
      const sourceData = state.state.slice(stateSlot, stateSlot + count * stride);
      buf.set(sourceData);
      break;
    }

    case 'external':
    case 'time':
    case 'eventRead':
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
      const inputs = expr.inputs.map(id => materializeValueExpr(id, table, instanceId, count, state, program, pool));
      applyZip(buf, inputs, expr.fn, count, stride);
      break;
    }

    case 'broadcast': {
      // WI-4: Broadcast - expand signal to field
      const signalValue = evaluateValueExprSignal(expr.signal, table.nodes, state);
      fillBufferWithSignal(buf, signalValue, count, stride);
      break;
    }

    case 'zipSig': {
      // WI-4: ZipSig - combine field with signals
      const fieldInput = materializeValueExpr(expr.field, table, instanceId, count, state, program, pool);
      const sigValues = expr.signals.map(id => evaluateValueExprSignal(id, table.nodes, state));
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
  } else if (value.kind === 'color') {
    for (let i = 0; i < count; i++) {
      buf[i * 4] = value.value[0];
      buf[i * 4 + 1] = value.value[1];
      buf[i * 4 + 2] = value.value[2];
      buf[i * 4 + 3] = value.value[3];
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

/**
 * Apply a map function (unary kernel).
 *
 * @param out - Output buffer
 * @param input - Input buffer
 * @param fn - Function to apply
 * @param count - Number of elements
 * @param stride - Stride per element
 */
function applyMap(
  out: Float32Array,
  input: Float32Array,
  fn: PureFn,
  count: number,
  stride: number
): void {
  // Simplified: assume stride=1 for MVP
  for (let i = 0; i < count; i++) {
    out[i] = evaluatePureFn(fn, [input[i]]);
  }
}

/**
 * Apply a zip function (n-ary kernel).
 *
 * @param out - Output buffer
 * @param inputs - Input buffers
 * @param fn - Function to apply
 * @param count - Number of elements
 * @param stride - Stride per element
 */
function applyZip(
  out: Float32Array,
  inputs: Float32Array[],
  fn: PureFn,
  count: number,
  stride: number
): void {
  for (let i = 0; i < count; i++) {
    const args = inputs.map(buf => buf[i]);
    out[i] = evaluatePureFn(fn, args);
  }
}

/**
 * Apply a zipSig function (field + signals).
 *
 * @param out - Output buffer
 * @param fieldInput - Field input buffer
 * @param sigValues - Signal values
 * @param fn - Function to apply
 * @param count - Number of elements
 * @param stride - Stride per element
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
  for (let i = 0; i < count; i++) {
    const args = [fieldInput[i], ...sigValues];
    out[i] = evaluatePureFn(fn, args);
  }
}

/**
 * Evaluate a pure function with given arguments.
 *
 * @param fn - Function descriptor
 * @param args - Input arguments
 * @returns Result value
 */
function evaluatePureFn(fn: PureFn, args: number[]): number {
  if (fn.kind === 'opcode') {
    // Handle opcodes (add, mul, etc.)
    switch (fn.opcode) {
      case 'add': return args[0] + args[1];
      case 'sub': return args[0] - args[1];
      case 'mul': return args[0] * args[1];
      case 'div': return args[0] / args[1];
      case 'mod': return args[0] % args[1];
      case 'pow': return Math.pow(args[0], args[1]);
      case 'neg': return -args[0];
      case 'abs': return Math.abs(args[0]);
      case 'sin': return Math.sin(args[0]);
      case 'cos': return Math.cos(args[0]);
      case 'tan': return Math.tan(args[0]);
      case 'floor': return Math.floor(args[0]);
      case 'ceil': return Math.ceil(args[0]);
      case 'round': return Math.round(args[0]);
      case 'sqrt': return Math.sqrt(args[0]);
      case 'exp': return Math.exp(args[0]);
      case 'log': return Math.log(args[0]);
      case 'min': return Math.min(args[0], args[1]);
      case 'max': return Math.max(args[0], args[1]);
      case 'clamp': return Math.min(Math.max(args[0], args[1]), args[2]);
      case 'lerp': return args[0] + (args[1] - args[0]) * args[2];
      case 'select': return args[0] ? args[1] : args[2];
      default: throw new Error(`Unknown opcode: ${fn.opcode}`);
    }
  } else if (fn.kind === 'kernel') {
    // Handle kernel functions (named functions)
    throw new Error(`Kernel functions not yet implemented: ${fn.name}`);
  } else if (fn.kind === 'expr') {
    // Handle expression strings
    throw new Error(`Expression evaluation not yet implemented: ${fn.expr}`);
  }
  throw new Error(`Unknown function kind: ${(fn as PureFn).kind}`);
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
      buf[i] = i / (count - 1);
    }
  } else if (intrinsic === 'randomId') {
    // Generate stable random IDs per instance
    for (let i = 0; i < count; i++) {
      buf[i] = Math.random(); // TODO: Use stable hash
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
    const h = input[i * 4];
    const s = input[i * 4 + 1];
    const l = input[i * 4 + 2];
    const a = input[i * 4 + 3];

    const [r, g, b] = hslToRgb(h, s, l);
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a; // Alpha passthrough
  }
}

/**
 * HSL→RGB conversion for a single color.
 *
 * @param h - Hue [0, 1]
 * @param s - Saturation [0, 1]
 * @param l - Lightness [0, 1]
 * @returns RGB [0, 1]
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  // Standard HSL→RGB conversion
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

  return [r + m, g + m, b + m];
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
