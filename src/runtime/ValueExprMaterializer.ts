/**
 * ══════════════════════════════════════════════════════════════════════
 * VALUE EXPRESSION MATERIALIZER
 * ══════════════════════════════════════════════════════════════════════
 *
 * Opcode-first expression evaluator (WI-4).
 *
 * Key changes from legacy Materializer:
 * 1. PureFn dispatch uses OpCode enum, not kernel string lookup
 * 2. Kernel resolution happens at compile time (resolve-kernels.ts)
 * 3. Evaluator receives kernelResolved handles, not kernel names
 *
 * Supported ValueExpr nodes:
 * - const, slotRead, time, external
 * - kernel (map, zip, zipSig, broadcast, reduce, pathDerivative)
 * - intrinsic (property, placement)
 * - extract, construct
 * - state, eventRead
 * - shapeRef
 *
 * NOT supported here (handled by dedicated executors):
 * - event expressions (EventExecutor)
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import type { ValueExpr, ValueExprId } from '../compiler/ir/value-expr';
import type { InstanceId } from '../compiler/ir/Indices';
import type { CompiledProgramIR, SlotMetaEntry } from '../compiler/ir/program';
import type { BasisKind, OpCode, PlacementFieldName, PureFn } from '../compiler/ir/types';
import type { IntrinsicPropertyName } from '../compiler/ir/types';
import { applyOpcode } from './OpcodeInterpreter';
import type { RuntimeState } from './RuntimeState';
import { canonicalField, requireInst, requireManyInstance, unitScalar, FLOAT } from '../core/canonical-types';
import { instanceRef } from '../core/canonical-types';
import { payloadStride } from '../core/canonical-types';
import { fillBufferFromPlacement } from './PlacementKernels';
import type { TopologyId } from '../shapes/types';
import { ShapeCache } from './ShapeCache';
import type { CanonicalType } from '../core/canonical-types';
import { deriveKind } from '../core/canonical-types';

/**
 * Float32Array pool for temporary buffers.
 * Avoids repeated allocation/deallocation during evaluation.
 */
class BufferPool {
  private pool: Float32Array[] = [];

  acquire(size: number): Float32Array {
    const buf = this.pool.pop();
    if (buf && buf.length >= size) {
      return buf.subarray(0, size);
    }
    return new Float32Array(size);
  }

  release(buf: Float32Array): void {
    this.pool.push(buf);
  }

  clear(): void {
    this.pool = [];
  }
}

const globalBufferPool = new BufferPool();

// =============================================================================
// Public API
// =============================================================================

/**
 * Materialize a ValueExpr to a buffer.
 *
 * This is the main entry point for evaluating expressions that produce
 * per-instance values (fields) or scalar values (signals).
 *
 * @param expr - ValueExpr node to evaluate
 * @param program - Compiled program IR
 * @param state - Runtime state
 * @param out - Output buffer to write results
 * @param instanceId - Instance ID for field expressions
 * @param count - Number of elements (lanes) to evaluate
 * @param offset - Byte offset into output buffer (for strided writes)
 *
 * Example usage:
 *   const out = new Float32Array(count * 2); // vec2 field
 *   materializeValueExpr(expr, program, state, out, instanceId, count, 0);
 */
export function materializeValueExpr(
  expr: ValueExpr,
  program: CompiledProgramIR,
  state: RuntimeState,
  out: Float32Array,
  instanceId: InstanceId,
  count: number,
  offset: number = 0
): void {
  const shapeCache = ShapeCache.getInstance();

  switch (expr.kind) {
    case 'const': {
      // Fill with constant value
      const value = expr.value;
      const stride = payloadStride(expr.type.payload);
      fillBufferConst(out, value, stride, count, offset);
      break;
    }

    case 'slotRead': {
      // Copy from slot buffer
      const slotMeta = program.slotMeta.get(expr.slot);
      if (!slotMeta) throw new Error(`Slot ${expr.slot} not found in slotMeta`);
      const slotBuf = state.frameCache.values;
      const stride = slotMeta.stride;
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < stride; c++) {
          out[offset + i * stride + c] = slotBuf[expr.slot + c];
        }
      }
      break;
    }

    case 'time': {
      // Time source materialization
      const which = expr.which;
      const stride = payloadStride(expr.type.payload);
      let value: number;
      if (which === 'tMs') {
        value = state.timeState.tMs;
      } else if (which === 'phaseA') {
        value = state.timeState.phaseA;
      } else if (which === 'phaseB') {
        value = state.timeState.phaseB;
      } else if (which === 'dt') {
        value = state.timeState.dt;
      } else if (which === 'progress') {
        value = state.timeState.progress;
      } else if (which === 'energy') {
        value = state.timeState.energy ?? 0;
      } else if (which === 'palette') {
        // Special case: palette is a color (stride=4)
        const palette = state.timeState.palette;
        if (!palette || palette.length !== 4) {
          throw new Error('time.palette requires a color (4 components)');
        }
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < 4; c++) {
            out[offset + i * 4 + c] = palette[c];
          }
        }
        return;
      } else {
        throw new Error(`Unknown time source: ${which}`);
      }
      fillBufferScalar(out, value, stride, count, offset);
      break;
    }

    case 'external': {
      // External channel materialization (mouse, etc.)
      const channel = expr.channel;
      const externalValue = state.externalChannels.get(channel);
      if (externalValue === undefined) {
        throw new Error(`External channel ${channel} not found`);
      }
      const stride = payloadStride(expr.type.payload);
      if (Array.isArray(externalValue)) {
        // Vec2 or color
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < stride; c++) {
            out[offset + i * stride + c] = externalValue[c] ?? 0;
          }
        }
      } else {
        // Scalar
        fillBufferScalar(out, externalValue, stride, count, offset);
      }
      break;
    }

    case 'kernel': {
      const kernelKind = expr.kernelKind;
      if (kernelKind === 'map') {
        applyMap(out, expr.input, expr.fn, count, payloadStride(expr.type.payload), instanceId, program, state);
      } else if (kernelKind === 'zip') {
        applyZip(out, expr.inputs, expr.fn, count, payloadStride(expr.type.payload), instanceId, program, state);
      } else if (kernelKind === 'zipSig') {
        applyZipSig(out, expr.field, expr.signals, expr.fn, count, payloadStride(expr.type.payload), instanceId, program, state);
      } else if (kernelKind === 'broadcast') {
        applyBroadcast(out, expr.signal, count, payloadStride(expr.type.payload), program, state);
      } else if (kernelKind === 'reduce') {
        applyReduce(out, expr.field, expr.op, count, instanceId, program, state);
      } else if (kernelKind === 'pathDerivative') {
        applyPathDerivative(out, expr.field, expr.op, count, instanceId, program, state);
      } else {
        throw new Error(`Unknown kernel kind: ${kernelKind}`);
      }
      break;
    }

    case 'intrinsic': {
      if (expr.intrinsicKind === 'property') {
        fillBufferIntrinsic(out, expr.intrinsic, instanceId, count, payloadStride(expr.type.payload), state);
      } else if (expr.intrinsicKind === 'placement') {
        fillBufferFromPlacement(out, expr.field, expr.basisKind, instanceId, count, state);
      } else {
        throw new Error(`Unknown intrinsic kind: ${(expr as any).intrinsicKind}`);
      }
      break;
    }

    case 'extract': {
      // Extract component from multi-component input
      const inputExpr = program.valueExprs[expr.input as number];
      if (!inputExpr) throw new Error(`Extract input ${expr.input} not found`);
      const inputStride = payloadStride(inputExpr.type.payload);
      const inputBuf = globalBufferPool.acquire(count * inputStride);
      materializeValueExpr(inputExpr, program, state, inputBuf, instanceId, count, 0);
      for (let i = 0; i < count; i++) {
        out[offset + i] = inputBuf[i * inputStride + expr.componentIndex];
      }
      globalBufferPool.release(inputBuf);
      break;
    }

    case 'construct': {
      // Construct multi-component value from scalar components
      const componentExprs = expr.components.map(id => program.valueExprs[id as number]);
      if (componentExprs.some(e => !e)) {
        throw new Error('Construct component not found');
      }
      const stride = payloadStride(expr.type.payload);
      if (componentExprs.length !== stride) {
        throw new Error(`Construct expects ${stride} components, got ${componentExprs.length}`);
      }
      const componentBufs = componentExprs.map(() => globalBufferPool.acquire(count));
      for (let i = 0; i < componentExprs.length; i++) {
        materializeValueExpr(componentExprs[i]!, program, state, componentBufs[i]!, instanceId, count, 0);
      }
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < stride; c++) {
          out[offset + i * stride + c] = componentBufs[c]![i];
        }
      }
      componentBufs.forEach(b => globalBufferPool.release(b));
      break;
    }

    case 'state': {
      // State read (from previous frame)
      const stateSlot = expr.stateSlot;
      const stateBuf = state.stateBuffers.read;
      const stride = payloadStride(expr.type.payload);
      const kind = deriveKind(expr.type);
      if (kind === 'field') {
        // Field state: per-instance values
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < stride; c++) {
            out[offset + i * stride + c] = stateBuf[stateSlot + i * stride + c];
          }
        }
      } else {
        // Signal state: broadcast scalar to all lanes
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < stride; c++) {
            out[offset + i * stride + c] = stateBuf[stateSlot + c];
          }
        }
      }
      break;
    }

    case 'eventRead': {
      // Event read (converts event to signal 0/1)
      const eventSlot = expr.eventSlot;
      const eventState = state.eventState.get(eventSlot);
      const value = eventState ? 1.0 : 0.0;
      fillBufferScalar(out, value, 1, count, offset);
      break;
    }

    case 'shapeRef': {
      // Shape reference (topology + control points)
      const topologyId = expr.topologyId;
      const controlPointField = expr.controlPointField;

      // Evaluate parameter args
      const paramArgs = expr.paramArgs.map(id => {
        const paramExpr = program.valueExprs[id as number];
        if (!paramExpr) throw new Error(`ShapeRef param ${id} not found`);
        // Params are signals (scalars)
        const buf = new Float32Array(1);
        materializeValueExpr(paramExpr, program, state, buf, instanceId, 1, 0);
        return buf[0];
      });

      // Evaluate control points if provided
      let controlPointBuf: Float32Array | undefined;
      if (controlPointField !== undefined) {
        const cpExpr = program.valueExprs[controlPointField as number];
        if (!cpExpr) throw new Error(`ShapeRef controlPointField ${controlPointField} not found`);
        const cpStride = payloadStride(cpExpr.type.payload);
        controlPointBuf = globalBufferPool.acquire(count * cpStride);
        materializeValueExpr(cpExpr, program, state, controlPointBuf, instanceId, count, 0);
      }

      // Generate shape points
      shapeCache.generateShape(
        topologyId,
        paramArgs,
        count,
        out,
        controlPointBuf
      );

      if (controlPointBuf) {
        globalBufferPool.release(controlPointBuf);
      }
      break;
    }

    case 'event':
      throw new Error('Event expressions cannot be materialized (use EventExecutor)');

    default:
      throw new Error(`Unknown ValueExpr kind: ${(expr as any).kind}`);
  }
}

// =============================================================================
// Kernel Application Helpers (WI-4)
// =============================================================================

/**
 * Apply map function to buffer (WI-4)
 *
 * Applies fn to each element of the input buffer.
 * Matches legacy Materializer.ts:527-551 behavior for applyMap.
 */
function applyMap(
  out: Float32Array,
  input: ValueExprId,
  fn: PureFn,
  count: number,
  stride: number,
  instanceId: InstanceId,
  program: CompiledProgramIR,
  state: RuntimeState
): void {
  const inputExpr = program.valueExprs[input as number];
  if (!inputExpr) throw new Error(`Map input ${input} not found`);

  const inputBuf = globalBufferPool.acquire(count * stride);
  materializeValueExpr(inputExpr, program, state, inputBuf, instanceId, count, 0);

  if (fn.kind === 'opcode') {
    const op = fn.opcode;
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < stride; c++) {
        const idx = i * stride + c;
        out[idx] = applyOpcode(op, [inputBuf[idx]]);
      }
    }
  } else if (fn.kind === 'kernelResolved') {
    const registry = program.kernelRegistry;
    if (fn.abi === 'scalar') {
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < stride; c++) {
          const idx = i * stride + c;
          out[idx] = registry.callScalar(fn.handle, [inputBuf[idx]]);
        }
      }
    } else {
      // Lane kernel: process each lane as a unit
      for (let i = 0; i < count; i++) {
        const args = Array.from(inputBuf.subarray(i * stride, (i + 1) * stride));
        registry.callLane(fn.handle, out, i * stride, args);
      }
    }
  } else {
    throw new Error(`Map function kind ${fn.kind} not implemented`);
  }

  globalBufferPool.release(inputBuf);
}

/**
 * Apply zip function to buffers (WI-4)
 *
 * Combines multiple input buffers element-wise, applying fn.
 * Matches legacy Materializer.ts:553-585 behavior for applyZip.
 */
function applyZip(
  out: Float32Array,
  inputs: readonly ValueExprId[],
  fn: PureFn,
  count: number,
  stride: number,
  instanceId: InstanceId,
  program: CompiledProgramIR,
  state: RuntimeState
): void {
  if (inputs.length === 0) throw new Error('Zip requires at least one input');

  const inputBufs = inputs.map(id => {
    const expr = program.valueExprs[id as number];
    if (!expr) throw new Error(`Zip input ${id} not found`);
    const buf = globalBufferPool.acquire(count * stride);
    materializeValueExpr(expr, program, state, buf, instanceId, count, 0);
    return buf;
  });

  if (fn.kind === 'opcode') {
    const op = fn.opcode;
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < stride; c++) {
        const idx = i * stride + c;
        const values = inputBufs.map(buf => buf[idx]);
        out[idx] = applyOpcode(op, values);
      }
    }
  } else if (fn.kind === 'kernelResolved') {
    const registry = program.kernelRegistry;
    if (fn.abi === 'scalar') {
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < stride; c++) {
          const idx = i * stride + c;
          const values = inputBufs.map(buf => buf[idx]);
          out[idx] = registry.callScalar(fn.handle, values);
        }
      }
    } else {
      // Lane kernel with multiple inputs
      const args: number[] = [];
      for (let i = 0; i < count; i++) {
        args.length = 0;
        for (const buf of inputBufs) {
          args.push(buf[i]); // Each input is stride-1 scalar
        }
        registry.callLane(fn.handle, out, i * stride, args);
      }
    }
  } else {
    throw new Error(`Zip function kind ${fn.kind} not implemented`);
  }

  inputBufs.forEach(b => globalBufferPool.release(b));
}

/**
 * Apply zipSig function to buffers (WI-4)
 *
 * Combines field input with signal values, applying fn per-lane.
 * Matches legacy Materializer.ts:586-613 behavior for applyZipSig.
 */
function applyZipSig(
  out: Float32Array,
  fieldInput: ValueExprId,
  signalInputs: readonly ValueExprId[],
  fn: PureFn,
  count: number,
  stride: number,
  instanceId: InstanceId,
  program: CompiledProgramIR,
  state: RuntimeState
): void {
  const fieldExpr = program.valueExprs[fieldInput as number];
  if (!fieldExpr) throw new Error(`ZipSig field ${fieldInput} not found`);

  const fieldBuf = globalBufferPool.acquire(count * stride);
  materializeValueExpr(fieldExpr, program, state, fieldBuf, instanceId, count, 0);

  // Evaluate signal inputs (scalars)
  const sigValues = signalInputs.map(id => {
    const expr = program.valueExprs[id as number];
    if (!expr) throw new Error(`ZipSig signal ${id} not found`);
    const buf = new Float32Array(1);
    materializeValueExpr(expr, program, state, buf, instanceId, 1, 0);
    return buf[0];
  });

  if (fn.kind === 'opcode') {
    // Per-lane opcode application with field + signals
    const op = fn.opcode;
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < stride; c++) {
        const idx = i * stride + c;
        const values = [fieldBuf[idx], ...sigValues];
        out[idx] = applyOpcode(op, values);
      }
    }
  } else if (fn.kind === 'kernelResolved') {
    const registry = program.kernelRegistry;
    if (fn.abi === 'scalar') {
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < stride; c++) {
          const idx = i * stride + c;
          out[idx] = registry.callScalar(fn.handle, [fieldBuf[idx], ...sigValues]);
        }
      }
    } else {
      // Lane kernel with field + signal inputs
      for (let i = 0; i < count; i++) {
        registry.callLane(fn.handle, out, i * stride, [fieldBuf[i], ...sigValues]);
      }
    }
  } else {
    throw new Error(`ZipSig function kind ${fn.kind} not implemented`);
  }

  globalBufferPool.release(fieldBuf);
}

/**
 * Fill buffer with tangent vectors using central difference (WI-4)
 *
 * Matches legacy Materializer.ts:649-680 behavior for fillBufferTangent.
 *
 * MVP Scope: Polygonal paths (linear approximation).
 * For a closed path with N control points:
 *   tangent[i] = (point[i+1] - point[i-1]) / 2
 *
 * Edge cases:
 * - First point: tangent[0] = point[1] - point[N-1]
 * - Last point: tangent[N-1] = point[0] - point[N-2]
 * - N=1: tangent[0] = (0, 0)
 * - N=2: tangent[i] = point[1-i] - point[i] (straight line)
 */
function fillBufferTangent(
  out: Float32Array,
  posBuf: Float32Array,
  count: number,
  _instanceId: InstanceId
): void {
  if (count === 0) return;
  if (count === 1) {
    out[0] = 0;
    out[1] = 0;
    return;
  }
  if (count === 2) {
    // Straight line: tangent is direction
    out[0] = posBuf[2] - posBuf[0];
    out[1] = posBuf[3] - posBuf[1];
    out[2] = posBuf[0] - posBuf[2];
    out[3] = posBuf[1] - posBuf[3];
    return;
  }

  // General case: central difference
  for (let i = 0; i < count; i++) {
    const prev = (i - 1 + count) % count;
    const next = (i + 1) % count;
    out[i * 2 + 0] = (posBuf[next * 2 + 0] - posBuf[prev * 2 + 0]) / 2;
    out[i * 2 + 1] = (posBuf[next * 2 + 1] - posBuf[prev * 2 + 1]) / 2;
  }
}

/**
 * Fill buffer with arc length values (WI-4)
 *
 * Matches legacy Materializer.ts:682-711 behavior for fillBufferArcLength.
 *
 * MVP Scope: Polygonal paths (linear approximation).
 * Arc length[i] = cumulative distance along path to point i.
 *
 * Arc length is normalized to [0, 1] based on total path length.
 */
function fillBufferArcLength(
  out: Float32Array,
  posBuf: Float32Array,
  count: number,
  _instanceId: InstanceId
): void {
  if (count === 0) return;
  if (count === 1) {
    out[0] = 0;
    return;
  }

  // Compute cumulative distances
  const distances: number[] = [0];
  let totalLength = 0;
  for (let i = 1; i < count; i++) {
    const dx = posBuf[i * 2 + 0] - posBuf[(i - 1) * 2 + 0];
    const dy = posBuf[i * 2 + 1] - posBuf[(i - 1) * 2 + 1];
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    totalLength += segmentLength;
    distances.push(totalLength);
  }

  // Close the loop (distance from last to first)
  const dx = posBuf[0] - posBuf[(count - 1) * 2 + 0];
  const dy = posBuf[1] - posBuf[(count - 1) * 2 + 1];
  totalLength += Math.sqrt(dx * dx + dy * dy);

  // Normalize to [0, 1]
  if (totalLength === 0) {
    out.fill(0);
  } else {
    for (let i = 0; i < count; i++) {
      out[i] = distances[i] / totalLength;
    }
  }
}

/**
 * Apply path derivative kernel (tangent or arcLength) (WI-4)
 *
 * Matches legacy Materializer.ts:615-647 behavior for field kernels.
 */
function applyPathDerivative(
  out: Float32Array,
  fieldInput: ValueExprId,
  op: 'tangent' | 'arcLength',
  count: number,
  instanceId: InstanceId,
  program: CompiledProgramIR,
  state: RuntimeState
): void {
  const fieldExpr = program.valueExprs[fieldInput as number];
  if (!fieldExpr) throw new Error(`PathDerivative field ${fieldInput} not found`);

  // Input is a vec2 position field
  const posBuf = globalBufferPool.acquire(count * 2);
  materializeValueExpr(fieldExpr, program, state, posBuf, instanceId, count, 0);

  if (op === 'tangent') {
    fillBufferTangent(out, posBuf, count, instanceId);
  } else if (op === 'arcLength') {
    fillBufferArcLength(out, posBuf, count, instanceId);
  } else {
    throw new Error(`Unknown path derivative op: ${op}`);
  }

  globalBufferPool.release(posBuf);
}

/**
 * Apply broadcast kernel (WI-4)
 *
 * Broadcasts a signal (scalar) to all lanes of a field.
 * Matches legacy Materializer.ts broadcast semantics.
 */
function applyBroadcast(
  out: Float32Array,
  signal: ValueExprId,
  count: number,
  stride: number,
  program: CompiledProgramIR,
  state: RuntimeState
): void {
  const signalExpr = program.valueExprs[signal as number];
  if (!signalExpr) throw new Error(`Broadcast signal ${signal} not found`);

  // Evaluate signal (scalar)
  const buf = new Float32Array(stride);
  materializeValueExpr(signalExpr, program, state, buf, '' as InstanceId, 1, 0);

  // Broadcast to all lanes
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < stride; c++) {
      out[i * stride + c] = buf[c];
    }
  }
}

/**
 * Apply reduce kernel (WI-4)
 *
 * Reduces a field to a signal using the specified operation.
 * Matches legacy Materializer.ts reduce semantics.
 */
function applyReduce(
  out: Float32Array,
  field: ValueExprId,
  op: 'min' | 'max' | 'sum' | 'avg',
  count: number,
  instanceId: InstanceId,
  program: CompiledProgramIR,
  state: RuntimeState
): void {
  const fieldExpr = program.valueExprs[field as number];
  if (!fieldExpr) throw new Error(`Reduce field ${field} not found`);

  const stride = payloadStride(fieldExpr.type.payload);
  const fieldBuf = globalBufferPool.acquire(count * stride);
  materializeValueExpr(fieldExpr, program, state, fieldBuf, instanceId, count, 0);

  // Reduce per component
  for (let c = 0; c < stride; c++) {
    let acc: number;
    if (op === 'min') {
      acc = Infinity;
      for (let i = 0; i < count; i++) {
        acc = Math.min(acc, fieldBuf[i * stride + c]);
      }
    } else if (op === 'max') {
      acc = -Infinity;
      for (let i = 0; i < count; i++) {
        acc = Math.max(acc, fieldBuf[i * stride + c]);
      }
    } else if (op === 'sum' || op === 'avg') {
      acc = 0;
      for (let i = 0; i < count; i++) {
        acc += fieldBuf[i * stride + c];
      }
      if (op === 'avg') {
        acc /= count;
      }
    } else {
      throw new Error(`Unknown reduce op: ${op}`);
    }
    out[c] = acc;
  }

  globalBufferPool.release(fieldBuf);
}

// =============================================================================
// Buffer Fill Helpers
// =============================================================================

/**
 * Fill buffer with a constant value.
 * Handles scalar (stride=1), vec2 (stride=2), vec3 (stride=3), color (stride=4).
 */
function fillBufferConst(
  out: Float32Array,
  value: import('../core/canonical-types').ConstValue,
  stride: number,
  count: number,
  offset: number
): void {
  if (value.kind === 'float' || value.kind === 'int') {
    const v = value.value;
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < stride; c++) {
        out[offset + i * stride + c] = v;
      }
    }
  } else if (value.kind === 'bool') {
    const v = value.value ? 1 : 0;
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < stride; c++) {
        out[offset + i * stride + c] = v;
      }
    }
  } else if (value.kind === 'vec2') {
    const [x, y] = value.value;
    for (let i = 0; i < count; i++) {
      out[offset + i * 2 + 0] = x;
      out[offset + i * 2 + 1] = y;
    }
  } else if (value.kind === 'vec3') {
    const [x, y, z] = value.value;
    for (let i = 0; i < count; i++) {
      out[offset + i * 3 + 0] = x;
      out[offset + i * 3 + 1] = y;
      out[offset + i * 3 + 2] = z;
    }
  } else if (value.kind === 'color') {
    const [r, g, b, a] = value.value;
    for (let i = 0; i < count; i++) {
      out[offset + i * 4 + 0] = r;
      out[offset + i * 4 + 1] = g;
      out[offset + i * 4 + 2] = b;
      out[offset + i * 4 + 3] = a;
    }
  } else {
    throw new Error(`Unsupported ConstValue kind: ${(value as any).kind}`);
  }
}

/**
 * Fill buffer by broadcasting a scalar value.
 */
function fillBufferScalar(
  out: Float32Array,
  value: number,
  stride: number,
  count: number,
  offset: number
): void {
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < stride; c++) {
      out[offset + i * stride + c] = value;
    }
  }
}

/**
 * Fill buffer with intrinsic property values.
 */
function fillBufferIntrinsic(
  out: Float32Array,
  intrinsic: IntrinsicPropertyName,
  instanceId: InstanceId,
  count: number,
  stride: number,
  state: RuntimeState
): void {
  const instanceData = state.instances.get(instanceId);
  if (!instanceData) {
    throw new Error(`Instance ${instanceId} not found`);
  }

  switch (intrinsic) {
    case 'index': {
      // Index intrinsic: 0, 1, 2, ...
      for (let i = 0; i < count; i++) {
        out[i] = i;
      }
      break;
    }

    case 'id01': {
      // Normalized index: 0, 1/(N-1), 2/(N-1), ..., 1
      if (count === 1) {
        out[0] = 0;
      } else {
        for (let i = 0; i < count; i++) {
          out[i] = i / (count - 1);
        }
      }
      break;
    }

    case 'randomId': {
      // Random ID: stable random value per element
      const elementIds = instanceData.elementIds;
      for (let i = 0; i < count; i++) {
        const elementId = elementIds[i] ?? 0;
        // Simple hash: ((elementId * 12345) % 65536) / 65536
        const hash = ((elementId * 12345) % 65536) / 65536;
        out[i] = hash;
      }
      break;
    }

    default:
      throw new Error(`Unknown intrinsic: ${intrinsic}`);
  }
}
