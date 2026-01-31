/**
 * ══════════════════════════════════════════════════════════════════════
 * VALUEEXPR MATERIALIZER
 * ══════════════════════════════════════════════════════════════════════
 *
 * Field materialization for the unified ValueExpr table.
 * This materializer handles field-extent ValueExpr nodes (cardinality many,
 * temporality continuous).
 *
 * Migration Status: Shadow mode implementation for incremental ValueExpr adoption.
 * This materializer runs in parallel with legacy Materializer during migration,
 * validating equivalence before cutover.
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
 * PHASE 5B: Complex Field Operations (TODO)
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
import { evaluateValueExprSignal } from './ValueExprSignalEvaluator';
import { applyFieldKernel } from './FieldKernels';
import { applyOpcode } from './OpcodeInterpreter';
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
 * Materialize a ValueExpr field expression into a Float32Array buffer
 *
 * @param veId - ValueExpr ID to materialize
 * @param table - ValueExpr table (program.valueExprs)
 * @param instanceId - Instance to materialize over
 * @param count - Number of elements (instance count)
 * @param state - Runtime state (for caching and cross-evaluator calls)
 * @param program - Compiled program (for cross-evaluator access to signal table)
 * @param pool - Buffer pool for allocation
 * @returns Float32Array with materialized field data
 */
export function materializeValueExpr(
  veId: ValueExprId,
  table: { readonly nodes: readonly ValueExpr[] },
  instanceId: InstanceId,
  count: number,
  state: RuntimeState,
  program: CompiledProgramIR,
  pool: BufferPool
): Float32Array {
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

  // Allocate buffer from pool
  const buffer = pool.alloc('f32', count) as Float32Array;

  // Ensure buffer has correct size for strided data
  if (buffer.length < count * stride) {
    throw new Error(
      `Buffer allocation failed: needed ${count * stride} elements, got ${buffer.length}`
    );
  }

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
  buffer: Float32Array,
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
        fillIntrinsicProperty(expr.intrinsic, buffer, count);
      } else {
        // Placement intrinsics: Phase 5B (WI-3)
        throw new Error('Placement intrinsics not yet implemented in Phase 5A');
      }
      break;
    }

    case 'kernel': {
      fillKernel(expr, buffer, veId, table, instanceId, count, stride, state, program, pool);
      break;
    }

    case 'state': {
      // Read per-lane state values
      const stateStart = expr.stateSlot as number;
      for (let i = 0; i < count * stride; i++) {
        buffer[i] = state.state[stateStart + i] ?? 0;
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
  buffer: Float32Array,
  count: number,
  stride: number
): void {
  switch (cv.kind) {
    case 'float':
    case 'int':
    case 'bool': {
      // Scalar: fill all components with same value
      const value = constValueAsNumber(cv);
      for (let i = 0; i < count * stride; i++) {
        buffer[i] = value;
      }
      break;
    }

    case 'vec2': {
      // Vec2: fill per-lane with [x, y]
      const [x, y] = cv.value;
      for (let i = 0; i < count; i++) {
        buffer[i * 2 + 0] = x;
        buffer[i * 2 + 1] = y;
      }
      break;
    }

    case 'vec3': {
      // Vec3: fill per-lane with [x, y, z]
      const [x, y, z] = cv.value;
      for (let i = 0; i < count; i++) {
        buffer[i * 3 + 0] = x;
        buffer[i * 3 + 1] = y;
        buffer[i * 3 + 2] = z;
      }
      break;
    }

    case 'color': {
      // Color const values are handled in legacy as Uint8ClampedArray
      // For Float32Array, we need to convert RGBA [0,1] to float components
      const [r, g, b, a] = cv.value;
      for (let i = 0; i < count; i++) {
        buffer[i * 4 + 0] = r;
        buffer[i * 4 + 1] = g;
        buffer[i * 4 + 2] = b;
        buffer[i * 4 + 3] = a;
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
  buffer: Float32Array,
  veId: ValueExprId,
  table: { readonly nodes: readonly ValueExpr[] },
  instanceId: InstanceId,
  count: number,
  stride: number,
  state: RuntimeState,
  program: CompiledProgramIR,
  pool: BufferPool
): void {
  switch (expr.kernelKind) {
    case 'broadcast': {
      // Evaluate signal, fill all lanes with result
      const sigValue = evaluateValueExprSignal(expr.signal, table.nodes, state);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < stride; c++) {
          buffer[i * stride + c] = sigValue;
        }
      }
      break;
    }

    case 'map': {
      // Materialize input, apply fn per-lane
      const input = materializeValueExpr(expr.input, table, instanceId, count, state, program, pool);
      applyMap(buffer, input, expr.fn, count, stride);
      break;
    }

    case 'zip': {
      // Materialize all inputs, apply fn per-lane
      const inputs = expr.inputs.map(id =>
        materializeValueExpr(id, table, instanceId, count, state, program, pool)
      );
      applyZip(buffer, inputs, expr.fn, count, stride, instanceId);
      break;
    }

    // Phase 5B kernels (WI-4)
    case 'zipSig':
    case 'pathDerivative':
    case 'reduce':
      throw new Error(`Kernel '${expr.kernelKind}' not yet implemented in Phase 5A`);

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
