/**
 * ══════════════════════════════════════════════════════════════════════
 * VALUEEXPR MATERIALIZER
 * ══════════════════════════════════════════════════════════════════════
 *
 * Field materialization for the unified ValueExpr table.
 * This materializer handles field-extent ValueExpr nodes (cardinality many,
 * temporality continuous).
 *
 * Migration Status: Production implementation - the only materializer used by runtime.
 *
 * ──────────────────────────────────────────────────────────────────────
 * IMPORTANT: FIELD-EXTENT ONLY
 * ──────────────────────────────────────────────────────────────────────
 *
 * This materializer handles ONLY field-extent expressions:
 * - Cardinality: many (not zero, not one)
 * - Temporality: continuous (not discrete)
 *
 * Signal-extent (cardinality one) → SignalEvaluator
 * Event-extent (temporality discrete) → EventEvaluator
 *
 * Runtime assertions enforce this constraint.
 *
 * ──────────────────────────────────────────────────────────────────────
 * PHASE 5A: Core Field Materialization
 * ──────────────────────────────────────────────────────────────────────
 *
 * Handles basic field operations:
 * - const: Constant values filled per-lane
 * - intrinsic.property: index, normalizedIndex, randomId
 * - kernel.broadcast: Signal → field broadcast
 * - kernel.map: Per-lane unary function application
 * - kernel.zip: Per-lane n-ary function application
 * - state: Per-lane state reads
 *
 * ──────────────────────────────────────────────────────────────────────
 * PHASE 5B: Complex Field Operations
 * ──────────────────────────────────────────────────────────────────────
 *
 * - intrinsic.placement: uv, rank, seed from basis
 * - kernel.zipSig: Field + signals → field
 * - kernel.pathDerivative: Tangent, arcLength
 * - kernel.reduce: Field → signal reduction (bridge to signal evaluator)
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import type { ValueExpr, ValueExprKernel, ValueExprIntrinsic } from '../compiler/ir/value-expr';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { InstanceId } from '../compiler/ir/Indices';
import type { PureFn, IntrinsicPropertyName } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import type { BufferPool } from './BufferPool';
import type { CompiledProgramIR } from '../compiler/ir/program';
import { getBufferFormat } from './BufferPool';
import { evaluateValueExprSignal } from './ValueExprSignalEvaluator';
import { applyFieldKernel, applyFieldKernelZipSig } from './FieldKernels';
import { applyOpcode } from './OpcodeInterpreter';
import { ensurePlacementBasis } from './PlacementBasis';
import {
  constValueAsNumber,
  payloadStride,
  requireManyInstance,
  instanceRef,
  canonicalField,
  FLOAT,
  unitScalar,
} from '../core/canonical-types';

/**
 * Materialize a ValueExpr field expression into a typed array buffer
 *
 * @param veId - ValueExpr ID to materialize
 * @param table - ValueExpr table (program.valueExprs)
 * @param instanceId - Instance to materialize over
 * @param count - Number of elements (instance count)
 * @param state - Runtime state (for caching and cross-evaluator calls)
 * @param program - Compiled program (for cross-evaluator access to signal table)
 * @param pool - Buffer pool for allocation
 * @returns Typed array with materialized field data (Float32Array or Uint8ClampedArray)
 */
export function materializeValueExpr(
  veId: ValueExprId,
  table: { readonly nodes: readonly ValueExpr[] },
  instanceId: InstanceId,
  count: number,
  state: RuntimeState,
  program: CompiledProgramIR,
  pool: BufferPool
): ArrayBufferView {
  // Check cache (keyed by ValueExprId, simple index lookup)
  // Cache structure added in WI-2
  const cached = state.cache.valueExprFieldBuffers?.[veId as number];
  const cachedStamp = state.cache.valueExprFieldStamps?.[veId as number];
  if (cached && cachedStamp === state.cache.frameId) {
    return cached;
  }

  // Get expression from dense array
  const expr = table.nodes[veId as number];
  if (!expr) {
    throw new Error(`ValueExpr ${veId} not found`);
  }

  // Derive stride from payload type (TYPE-SYSTEM-INVARIANTS #12)
  const stride = payloadStride(expr.type.payload);

  // Determine buffer format based on payload type (matches legacy Materializer)
  const format = getBufferFormat(expr.type.payload);

  // Allocate buffer from pool — pool handles stride internally based on format
  const buffer = pool.alloc(format, count);


  // Fill buffer based on expression kind
  fillBuffer(expr, buffer, veId, table, instanceId, count, stride, state, program, pool);

  // Cache result (if cache arrays exist - added in WI-2)
  if (state.cache.valueExprFieldBuffers && state.cache.valueExprFieldStamps) {
    state.cache.valueExprFieldBuffers[veId as number] = buffer;
    state.cache.valueExprFieldStamps[veId as number] = state.cache.frameId;
  }

  return buffer;
}

/**
 * Fill buffer based on ValueExpr kind dispatch
 */
function fillBuffer(
  expr: ValueExpr,
  buffer: ArrayBufferView,
  veId: ValueExprId,
  table: { readonly nodes: readonly ValueExpr[] },
  instanceId: InstanceId,
  count: number,
  stride: number,
  state: RuntimeState,
  program: CompiledProgramIR,
  pool: BufferPool
): void {
  switch (expr.kind) {
    case 'const': {
      // Fill all lanes with constant value
      fillConst(expr.value, buffer, count, stride);
      break;
    }

    case 'intrinsic': {
      if (expr.intrinsicKind === 'property') {
        // Property intrinsics: index, normalizedIndex, randomId
        // These always output Float32Array
        fillIntrinsicProperty(expr.intrinsic, buffer as Float32Array, count);
      } else {
        // Placement intrinsics: Phase 5B (WI-3)
        fillIntrinsicPlacement(expr, buffer as Float32Array, count, state);
      }
      break;
    }

    case 'kernel': {
      fillKernel(expr, buffer, veId, table, instanceId, count, stride, state, program, pool);
      break;
    }

    case 'state': {
      // Read per-lane state values (always Float32Array)
      const stateStart = expr.stateSlot as number;
      const buf = buffer as Float32Array;
      for (let i = 0; i < count * stride; i++) {
        buf[i] = state.state[stateStart + i] ?? 0;
      }
      break;
    }

    case 'extract': {
      // Extract a single scalar component from a multi-component field.
      // Input is a field with stride > 1 (vec2, vec3, color).
      // Output is a scalar field (stride 1).
      const inputExpr = table.nodes[expr.input as unknown as number];
      if (!inputExpr) throw new Error(`extract: input ValueExpr ${expr.input} not found`);
      const inputStride = payloadStride(inputExpr.type.payload);
      const inputBuf = materializeValueExpr(
        expr.input, table, instanceId, count, state, program, pool
      ) as Float32Array;
      const out = buffer as Float32Array;
      const ci = expr.componentIndex;
      if (ci < 0 || ci >= inputStride) {
        throw new Error(`extract: componentIndex ${ci} out of range for stride ${inputStride}`);
      }
      for (let i = 0; i < count; i++) {
        out[i] = inputBuf[i * inputStride + ci];
      }
      break;
    }

    case 'construct': {
      // Construct a multi-component field from scalar component fields.
      // Each component is a scalar field (stride 1).
      // Output is a field with stride = components.length (vec2, vec3, color).
      const out = buffer as Float32Array;
      const componentBufs: Float32Array[] = [];
      for (const compId of expr.components) {
        const compBuf = materializeValueExpr(
          compId, table, instanceId, count, state, program, pool
        ) as Float32Array;
        componentBufs.push(compBuf);
      }
      const outStride = stride;
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < componentBufs.length && c < outStride; c++) {
          out[i * outStride + c] = componentBufs[c][i];
        }
      }
      break;
    }

    // Signal-extent kinds should not appear in field materialization
    case 'slotRead':
    case 'time':
    case 'external':
    case 'shapeRef':
    case 'eventRead':
    case 'event':
      throw new Error(
        `Cannot materialize ${expr.kind} as field-extent. ` +
        `This is a signal/event-extent expression.`
      );

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown ValueExpr kind: ${(_exhaustive as ValueExpr).kind}`);
    }
  }
}

/**
 * Fill buffer with constant value (all lanes)
 *
 * Matches legacy Materializer.ts:288-330 behavior.
 */
function fillConst(
  cv: import('../core/canonical-types').ConstValue,
  buffer: ArrayBufferView,
  count: number,
  stride: number
): void {
  switch (cv.kind) {
    case 'float':
    case 'int':
    case 'bool': {
      // Scalar: fill all components with same value
      const buf = buffer as Float32Array;
      const value = constValueAsNumber(cv);
      for (let i = 0; i < count * stride; i++) {
        buf[i] = value;
      }
      break;
    }

    case 'vec2': {
      // Vec2: fill per-lane with [x, y]
      const buf = buffer as Float32Array;
      const [x, y] = cv.value;
      for (let i = 0; i < count; i++) {
        buf[i * 2 + 0] = x;
        buf[i * 2 + 1] = y;
      }
      break;
    }

    case 'vec3': {
      // Vec3: fill per-lane with [x, y, z]
      const buf = buffer as Float32Array;
      const [x, y, z] = cv.value;
      for (let i = 0; i < count; i++) {
        buf[i * 3 + 0] = x;
        buf[i * 3 + 1] = y;
        buf[i * 3 + 2] = z;
      }
      break;
    }

    case 'color': {
      // Color RGBA tuple - convert [0,1] float to [0,255] clamped integer
      // Matches legacy Materializer.ts:295-302
      const rgba = buffer as Uint8ClampedArray;
      const [r, g, b, a] = cv.value;
      for (let i = 0; i < count; i++) {
        rgba[i * 4 + 0] = Math.round(r * 255);
        rgba[i * 4 + 1] = Math.round(g * 255);
        rgba[i * 4 + 2] = Math.round(b * 255);
        rgba[i * 4 + 3] = Math.round(a * 255);
      }
      break;
    }

    case 'cameraProjection': {
      // CameraProjection is not a field type, should not reach here
      throw new Error('Cannot materialize cameraProjection constant as field');
    }

    default: {
      const _exhaustive: never = cv;
      throw new Error(`Unknown ConstValue kind: ${(_exhaustive as import('../core/canonical-types').ConstValue).kind}`);
    }
  }
}

/**
 * Fill buffer from intrinsic property
 *
 * Matches legacy Materializer.ts:461-504 behavior exactly.
 * Factored to allow reuse between legacy and ValueExpr materializers.
 */
function fillIntrinsicProperty(
  intrinsic: IntrinsicPropertyName,
  buffer: Float32Array,
  count: number
): void {
  switch (intrinsic) {
    case 'index': {
      // Element index (0, 1, 2, ..., N-1)
      for (let i = 0; i < count; i++) {
        buffer[i] = i;
      }
      break;
    }

    case 'normalizedIndex': {
      // Normalized index (0.0 to 1.0)
      // C-7 FIX: Single element should be centered at 0.5, not 0
      for (let i = 0; i < count; i++) {
        buffer[i] = count > 1 ? i / (count - 1) : 0.5;
      }
      break;
    }

    case 'randomId': {
      // Deterministic per-element random (0.0 to 1.0)
      for (let i = 0; i < count; i++) {
        buffer[i] = pseudoRandom(i);
      }
      break;
    }

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = intrinsic;
      throw new Error(`Unknown intrinsic: ${_exhaustive}`);
    }
  }
}

/**
 * Fill buffer from placement intrinsic (WI-3)
 *
 * Produces placement field buffers (uv/rank/seed) using PlacementBasis system.
 * Matches legacy Materializer.ts:419-447 behavior for intrinsic placement field.
 */
function fillIntrinsicPlacement(
  expr: Extract<ValueExprIntrinsic, { intrinsicKind: 'placement' }>,
  buffer: Float32Array,
  count: number,
  state: RuntimeState
): void {
  // Get or create placement basis for this instance
  const instanceIdFromType = requireManyInstance(expr.type).instanceId;
  const basis = ensurePlacementBasis(
    state.continuity.placementBasis,
    instanceIdFromType,
    count,
    expr.basisKind
  );

  // Copy data from basis buffers based on field type
  switch (expr.field) {
    case 'uv': {
      // Copy uv coordinates (stride 2)
      const src = basis.uv.subarray(0, count * 2);
      buffer.set(src);
      break;
    }

    case 'rank': {
      // Copy rank values (stride 1)
      const src = basis.rank.subarray(0, count);
      buffer.set(src);
      break;
    }

    case 'seed': {
      // Copy seed values (stride 1)
      const src = basis.seed.subarray(0, count);
      buffer.set(src);
      break;
    }

    default: {
      const _exhaustive: never = expr.field;
      throw new Error(`Unknown placement field: ${_exhaustive}`);
    }
  }
}

/**
 * Pseudo-random generator for deterministic per-element randomness.
 * Uses sine-based hash for smooth, deterministic results.
 *
 * MUST match legacy Materializer.ts:510-513 exactly.
 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Fill buffer using kernel operations
 */
function fillKernel(
  expr: ValueExprKernel,
  buffer: ArrayBufferView,
  veId: ValueExprId,
  table: { readonly nodes: readonly ValueExpr[] },
  instanceId: InstanceId,
  count: number,
  stride: number,
  state: RuntimeState,
  program: CompiledProgramIR,
  pool: BufferPool
): void {
  // Most kernel operations output Float32Array
  const buf = buffer as Float32Array;

  switch (expr.kernelKind) {
    case 'broadcast': {
      // Evaluate signal, fill all lanes with result
      const sigValue = evaluateValueExprSignal(expr.signal, table.nodes, state);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < stride; c++) {
          buf[i * stride + c] = sigValue;
        }
      }
      break;
    }

    case 'map': {
      // Materialize input, apply fn per-lane
      const input = materializeValueExpr(expr.input, table, instanceId, count, state, program, pool) as Float32Array;
      applyMap(buf, input, expr.fn, count, stride);
      break;
    }

    case 'zip': {
      // Materialize all inputs, apply fn per-lane
      const inputs = expr.inputs.map(id =>
        materializeValueExpr(id, table, instanceId, count, state, program, pool) as Float32Array
      );
      applyZip(buf, inputs, expr.fn, count, stride, instanceId);
      break;
    }

    case 'zipSig': {
      // WI-4: ZipSig - materialize field input, evaluate signal inputs, apply fn per-lane
      const fieldInput = materializeValueExpr(expr.field, table, instanceId, count, state, program, pool) as Float32Array;
      const sigValues = expr.signals.map(id => evaluateValueExprSignal(id, table.nodes, state));
      applyZipSig(buf, fieldInput, sigValues, expr.fn, count, stride, instanceId);
      break;
    }

    case 'pathDerivative': {
      // WI-4: PathDerivative - materialize input, compute derivative
      const input = materializeValueExpr(expr.field, table, instanceId, count, state, program, pool) as Float32Array;
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
 * Apply map function to buffer
 *
 * Matches legacy Materializer.ts:521-550 behavior.
 */
function applyMap(
  out: Float32Array,
  input: Float32Array,
  fn: PureFn,
  count: number,
  stride: number
): void {
  if (fn.kind === 'opcode') {
    // Per-lane opcode application
    const op = fn.opcode;
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < stride; c++) {
        const idx = i * stride + c;
        out[idx] = applyOpcode(op, [input[idx]]);
      }
    }
  } else if (fn.kind === 'kernel') {
    // Kernels are not allowed in map (use zip or zipSig)
    throw new Error(
      `Map only supports opcodes, not kernels. ` +
      `Kernel '${fn.name}' should use zip or zipSig instead.`
    );
  } else {
    throw new Error(`Map function kind ${fn.kind} not implemented`);
  }
}

/**
 * Apply zip function to buffers
 *
 * Matches legacy Materializer.ts:553-580 behavior.
 */
function applyZip(
  out: Float32Array,
  inputs: Float32Array[],
  fn: PureFn,
  count: number,
  stride: number,
  instanceId: InstanceId
): void {
  if (fn.kind === 'opcode') {
    // Per-lane opcode application
    const op = fn.opcode;
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < stride; c++) {
        const idx = i * stride + c;
        const values = inputs.map(buf => buf[idx]);
        out[idx] = applyOpcode(op, values);
      }
    }
  } else if (fn.kind === 'kernel') {
    // Field kernels operate on entire buffers
    // Cast to ArrayBufferView for applyFieldKernel signature
    const inputViews = inputs.map(buf => buf as ArrayBufferView);

    // Create a dummy CanonicalType for applyFieldKernel
    // The type is only used for validation, not for runtime behavior
    // We construct it with proper axis structure per TYPE-SYSTEM-INVARIANTS
    const dummyInstance = instanceRef('_dummy', instanceId as any as string);
    const dummyType = canonicalField(FLOAT, unitScalar(), dummyInstance);

    applyFieldKernel(out, inputViews, fn.name, count, dummyType);
  } else {
    throw new Error(`Zip function kind ${fn.kind} not implemented`);
  }
}

/**
 * Apply zipSig function to buffers (WI-4)
 *
 * Combines field input with signal values, applying fn per-lane.
 * Matches legacy Materializer.ts:586-613 behavior for applyZipSig.
 */
function applyZipSig(
  out: Float32Array,
  fieldInput: Float32Array,
  sigValues: number[],
  fn: PureFn,
  count: number,
  stride: number,
  instanceId: InstanceId
): void {
  if (fn.kind === 'opcode') {
    // Per-lane opcode application with field + signals
    const op = fn.opcode;
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < stride; c++) {
        const idx = i * stride + c;
        const values = [fieldInput[idx], ...sigValues];
        out[idx] = applyOpcode(op, values);
      }
    }
  } else if (fn.kind === 'kernel') {
    // Field kernel with signal inputs
    const dummyInstance = instanceRef('_dummy', instanceId as any as string);
    const dummyType = canonicalField(FLOAT, unitScalar(), dummyInstance);

    applyFieldKernelZipSig(out, fieldInput, sigValues, fn.name, count, dummyType);
  } else {
    throw new Error(`ZipSig function kind ${fn.kind} not implemented`);
  }
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
 * - Single point (N=1): tangent = (0, 0, 0)
 * - Two points (N=2): tangent computed with wrapping
 * - Assumes closed path (wraps at boundaries)
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
