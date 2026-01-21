/**
 * ══════════════════════════════════════════════════════════════════════
 * FIELD MATERIALIZER
 * ══════════════════════════════════════════════════════════════════════
 *
 * Converts FieldExpr IR nodes into typed array buffers.
 * Pure IR path - no legacy fallbacks.
 *
 * ──────────────────────────────────────────────────────────────────────
 * LAYER CONTRACT
 * ──────────────────────────────────────────────────────────────────────
 *
 * MATERIALIZER RESPONSIBILITIES:
 * 1. IR → buffer orchestration (materialize, fillBuffer)
 * 2. Buffer cache management (frame-stamped caching)
 * 3. Intrinsic field production (index, normalizedIndex, randomId)
 * 4. Layout field production (position, radius from layout spec)
 * 5. Dispatch to field kernel registry
 *
 * MATERIALIZER DOES NOT:
 * - Define scalar math (→ OpcodeInterpreter)
 * - Define signal kernels (→ SignalEvaluator)
 * - Define coord-space semantics (→ block-level contracts)
 * - Multiply by viewport width/height (→ backend renderers)
 *
 * ──────────────────────────────────────────────────────────────────────
 * FIELD KERNEL REGISTRY (applyKernel / applyKernelZipSig)
 * ──────────────────────────────────────────────────────────────────────
 *
 * Field kernels operate on typed array buffers (vec2/color/float).
 * They are COORD-SPACE AGNOSTIC - blocks define world/local semantics.
 *
 * VEC2 CONSTRUCTION:
 *   makeVec2(x, y) → vec2
 *     AGNOSTIC - combines raw values
 *
 * POLAR/CARTESIAN:
 *   fieldPolarToCartesian(cx, cy, r, angle) → vec2
 *     AGNOSTIC - pure geometric transform, angle in RADIANS
 *     Output space matches input space (local if inputs are local, etc.)
 *
 * LAYOUT:
 *   circleLayout(normalizedIndex, radius, phase) → vec2
 *     WORLD-SPACE - centered at (0.5, 0.5), expects index ∈ [0,1]
 *   circleAngle(normalizedIndex, phase) → float (radians)
 *     Expects index ∈ [0,1], outputs RADIANS
 *   polygonVertex(index, sides, radiusX, radiusY) → vec2
 *     LOCAL-SPACE - centered at (0,0), outputs control points
 *
 * EFFECTS:
 *   jitter2d / fieldJitter2D(pos, rand, amtX, amtY) → vec2
 *     AGNOSTIC - offsets in same units as pos
 *   attract2d(pos, targetX, targetY, phase, strength) → vec2
 *     AGNOSTIC - pos/target must be in same space
 *   fieldPulse(id01, phase, base, amp, spread) → float
 *     Expects id01 ∈ [0,1], outputs scalar values
 *
 * FIELD MATH:
 *   fieldAdd(a, b) → float
 *     AGNOSTIC - element-wise addition
 *   fieldAngularOffset(id01, phase, spin) → float (radians)
 *     Expects id01 ∈ [0,1], outputs RADIANS
 *   fieldRadiusSqrt(id01, radius) → float
 *     AGNOSTIC - expects id01 ∈ [0,1], preserves radius units
 *   fieldGoldenAngle(id01) → float (radians)
 *     Expects id01 ∈ [0,1], outputs RADIANS
 *
 * COLOR:
 *   hsvToRgb(h, s, v) → color
 *     h wraps to [0,1], s/v clamped to [0,1]
 *   hsvToRgb(hueField, sat, val) → color (zipSig variant)
 *     hueField per-element, sat/val uniform
 *   fieldHueFromPhase(id01, phase) → float
 *     Expects id01 ∈ [0,1], outputs hue ∈ [0,1]
 *   applyOpacity(color, opacity) → color
 *     opacity clamped to [0,1]
 *
 * ──────────────────────────────────────────────────────────────────────
 * IMPORTANT: COORD-SPACE DISCIPLINE
 * ──────────────────────────────────────────────────────────────────────
 *
 * Most field kernels are COORD-SPACE AGNOSTIC - they perform pure
 * mathematical transformations without knowledge of coordinate systems.
 *
 * Key principles:
 * 1. NO viewport width/height multiplication (→ backend concern)
 * 2. Angles are ALWAYS in RADIANS (not degrees, not cycles)
 * 3. Normalized inputs (id01, normalizedIndex) expect [0,1]
 * 4. Blocks define whether vec2 fields are local-space or world-space
 * 5. Agnostic kernels preserve input space in output
 *
 * Examples:
 * - fieldPolarToCartesian: just computes cx + r*cos(a), cy + r*sin(a)
 *   - If center=(0,0) and r is local units → local output
 *   - If center=(0.5,0.5) and r is world units → world output
 * - jitter2d: adds offsets in the same units as input position
 *   - If pos is local, amounts should be local
 *   - If pos is world, amounts should be world
 * - polygonVertex: explicitly outputs LOCAL-SPACE control points
 * - circleLayout: explicitly outputs WORLD-SPACE positions
 *
 * This design keeps kernels simple, reusable, and backend-independent.
 *
 * ──────────────────────────────────────────────────────────────────────
 * ROADMAP PHASE 6 - ALIGNMENT WITH FUTURE RENDERIR
 * ──────────────────────────────────────────────────────────────────────
 *
 * The Materializer outputs are designed to align with the future
 * DrawPathInstancesOp model (see src/render/future-types.ts).
 *
 * CURRENT STATE:
 * - Control points (polygonVertex) → Field<vec2> in local space
 * - Position fields (circleLayout) → Field<vec2> in world space [0,1]
 * - Size/rotation/scale2 → Field<float> or uniform scalars
 *
 * FUTURE STATE (no changes needed to Materializer):
 * - RenderAssembler will consume these fields and produce DrawPathInstancesOp
 * - PathGeometry.points ← materialize(controlPointsFieldId) [local space]
 * - InstanceTransforms.position ← materialize(positionFieldId) [world space]
 * - InstanceTransforms.size ← materialize(sizeFieldId) or uniform
 * - InstanceTransforms.rotation ← materialize(rotationFieldId) [optional]
 * - InstanceTransforms.scale2 ← materialize(scale2FieldId) [optional]
 *
 * KEY INVARIANTS TO PRESERVE:
 * 1. Control point fields MUST be in LOCAL SPACE (centered at origin)
 *    - polygonVertex already does this correctly
 *    - Future geometry kernels should follow same pattern
 *
 * 2. Position fields MUST be in WORLD SPACE normalized [0,1]
 *    - circleLayout already does this correctly
 *    - Renderer will multiply by viewport dimensions
 *
 * 3. Size is ISOTROPIC SCALE in world units
 *    - scale2 is ANISOTROPIC multiplier on top of size
 *    - Effective scale: S_eff = size * (scale2 ?? vec2(1,1))
 *
 * 4. No viewport scaling in Materializer
 *    - Width/height multiplication is renderer concern
 *    - Keep all field kernels dimension-agnostic
 *
 * This architecture ensures:
 * - Geometry is reusable across layouts (local-space independence)
 * - Instance transforms are composable (position/size/rotation/scale2)
 * - Renderer is simple (apply transforms, draw local geometry)
 * - Backend-independent (same buffers work for Canvas, WebGL, SVG)
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import type {
  FieldExprId,
  SigExprId,
} from '../types';
import type { SignalType } from '../core/canonical-types';
import type {
  FieldExpr,
  InstanceDecl,
  OpCode,
  PureFn,
  SigExpr,
  IntrinsicPropertyName,
} from '../compiler/ir/types';
import type { BufferPool, BufferFormat } from './BufferPool';
import { getBufferFormat } from './BufferPool';
import type { RuntimeState } from './RuntimeState';
import { evaluateSignal } from './SignalEvaluator';
import { applyOpcode } from './OpcodeInterpreter';

/**
 * Materialize a field expression into a typed array
 *
 * @param fieldId - Field expression ID
 * @param instanceId - Instance to materialize over (string)
 * @param fields - Dense array of field expressions
 * @param signals - Dense array of signal expressions (for lazy evaluation)
 * @param instances - Instance declaration map
 * @param state - Runtime state (for signal values)
 * @param pool - Buffer pool for allocation
 * @returns Typed array with materialized field data
 */
export function materialize(
  fieldId: FieldExprId,
  instanceId: string,
  fields: readonly FieldExpr[],
  signals: readonly SigExpr[],
  instances: ReadonlyMap<string, InstanceDecl>,
  state: RuntimeState,
  pool: BufferPool
): ArrayBufferView {
  // Check cache
  const cacheKey = `${fieldId}:${instanceId}`;
  const cached = state.cache.fieldBuffers.get(cacheKey);
  const cachedStamp = state.cache.fieldStamps.get(cacheKey);
  if (cached && cachedStamp === state.cache.frameId) {
    return cached;
  }

  // Get field expression from dense array
  const expr = fields[fieldId as number];
  if (!expr) {
    throw new Error(`Field expression ${fieldId} not found`);
  }

  // Get instance
  const instance = instances.get(instanceId);
  if (!instance) {
    throw new Error(`Instance ${instanceId} not found`);
  }

  // Resolve count
  if (typeof instance.count !== 'number') {
    throw new Error(`instance.count ${instanceId} is not a number: ${instance.count}`);
  }
  const count = instance.count;

  // Allocate buffer
  const format = getBufferFormat(expr.type.payload);
  const buffer = pool.alloc(format, count);

  // Fill buffer based on expression kind
  fillBuffer(expr, buffer, instance, fields, signals, instances, state, pool);

  // Cache result (with size limit to prevent unbounded growth)
  const MAX_CACHED_FIELDS = 200;
  if (state.cache.fieldBuffers.size >= MAX_CACHED_FIELDS) {
    // Evict oldest entries (those with lowest stamps)
    const entries = [...state.cache.fieldStamps.entries()];
    entries.sort((a, b) => a[1] - b[1]);
    const toEvict = entries.slice(0, Math.floor(MAX_CACHED_FIELDS / 4));
    for (const [key] of toEvict) {
      state.cache.fieldBuffers.delete(key);
      state.cache.fieldStamps.delete(key);
    }
  }
  state.cache.fieldBuffers.set(cacheKey, buffer);
  state.cache.fieldStamps.set(cacheKey, state.cache.frameId);

  return buffer;
}

/**
 * Fill a buffer based on field expression kind
 */
function fillBuffer(
  expr: FieldExpr,
  buffer: ArrayBufferView,
  instance: InstanceDecl,
  fields: readonly FieldExpr[],
  signals: readonly SigExpr[],
  instances: ReadonlyMap<string, InstanceDecl>,
  state: RuntimeState,
  pool: BufferPool
): void {
  if (typeof instance.count !== 'number') {
    throw new Error(`instance.count ${instance.id} is not a number: ${instance.count}`);
  }
  const count = instance.count;
  const N = count;

  switch (expr.kind) {
    case 'const': {
      // Fill with constant value
      const arr = buffer as Float32Array | Uint8ClampedArray;
      if (typeof expr.value !== 'number') {
        throw new Error(`instance.count ${expr.kind} ${expr.type} is not a number: ${expr.value}`);
      }
      const value = expr.value;

      if (expr.type.payload === 'color') {
        // Color: broadcast to RGBA
        const rgba = buffer as Uint8ClampedArray;
        for (let i = 0; i < N; i++) {
          rgba[i * 4 + 0] = 255; // R
          rgba[i * 4 + 1] = 255; // G
          rgba[i * 4 + 2] = 255; // B
          rgba[i * 4 + 3] = 255; // A
        }
      } else if (expr.type.payload === 'vec2') {
        // Vec2: broadcast to (value, value)
        const vec = buffer as Float32Array;
        for (let i = 0; i < N; i++) {
          vec[i * 2 + 0] = value;
          vec[i * 2 + 1] = value;
        }
      } else {
        // Scalar: broadcast single value
        for (let i = 0; i < N; i++) {
          arr[i] = value;
        }
      }
      break;
    }

    case 'intrinsic': {
      // Fill from intrinsic property (new system - properly typed)
      fillBufferIntrinsic(expr.intrinsic, buffer, instance);
      break;
    }

    case 'broadcast': {
      // Broadcast signal value to all elements
      const sigValue = evaluateSignal(expr.signal, signals, state);
      const arr = buffer as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i] = sigValue;
      }
      break;
    }

    case 'map': {
      // Map: get input, apply function
      const input = materialize(
        expr.input,
        instance.id,
        fields,
        signals,
        instances,
        state,
        pool
      );
      applyMap(buffer, input, expr.fn, N, expr.type);
      break;
    }

    case 'zip': {
      // Zip: get inputs, apply function
      const inputs = expr.inputs.map((id) =>
        materialize(id, instance.id, fields, signals, instances, state, pool)
      );
      applyZip(buffer, inputs, expr.fn, N, expr.type);
      break;
    }

    case 'zipSig': {
      // ZipSig: combine field with signals
      const fieldInput = materialize(
        expr.field,
        instance.id,
        fields,
        signals,
        instances,
        state,
        pool
      );
      const sigValues = expr.signals.map((id) => evaluateSignal(id, signals, state));
      applyZipSig(buffer, fieldInput, sigValues, expr.fn, N, expr.type);
      break;
    }

    case 'array': {
      // Array field expression: Stage 2 of three-stage architecture
      // This represents the identity field of the instance
      // For now, we'll fill with the index as a placeholder
      // TODO: Support actual element values when blocks provide them
      const arr = buffer as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i] = i;
      }
      break;
    }

    case 'layout': {
      // Layout field expression: Stage 3 of three-stage architecture
      // Applies layout specification to compute positions
      const layout = expr.layoutSpec;
      const arr = buffer as Float32Array;

      if (layout.kind === 'grid') {
        const rows = layout.rows || 1;
        const cols = layout.cols || 1;
        for (let i = 0; i < N; i++) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          arr[i * 2 + 0] = cols > 1 ? col / (cols - 1) : 0.5;
          arr[i * 2 + 1] = rows > 1 ? row / (rows - 1) : 0.5;
        }
      } else if (layout.kind === 'circular') {
        const radius = layout.radius || 0.3;
        const cx = 0.5;
        const cy = 0.5;
        const TWO_PI = Math.PI * 2;
        for (let i = 0; i < N; i++) {
          const angle = TWO_PI * (i / N);
          arr[i * 2 + 0] = cx + radius * Math.cos(angle);
          arr[i * 2 + 1] = cy + radius * Math.sin(angle);
        }
      } else if (layout.kind === 'linear') {
        const spacing = layout.spacing || 0.01;
        for (let i = 0; i < N; i++) {
          arr[i * 2 + 0] = 0.5;
          arr[i * 2 + 1] = i * spacing;
        }
      } else if (layout.kind === 'unordered') {
        // Unordered: no specific layout, default to (0.5, 0.5)
        for (let i = 0; i < N; i++) {
          arr[i * 2 + 0] = 0.5;
          arr[i * 2 + 1] = 0.5;
        }
      } else {
        // Default: center all elements
        for (let i = 0; i < N; i++) {
          arr[i * 2 + 0] = 0.5;
          arr[i * 2 + 1] = 0.5;
        }
      }
      break;
    }

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown field expr kind: ${(_exhaustive as FieldExpr).kind}`);
    }
  }
}

/**
 * Apply a pure function to values
 */
function applyPureFn(
  fn: { kind: 'opcode'; opcode: string } | { kind: 'expr'; expr: string } | { kind: 'kernel'; name: string },
  values: number[]
): number {
  if (fn.kind === 'opcode') {
    return applyOpcode(fn.opcode, values);
  }
  throw new Error(`PureFn kind ${fn.kind} not implemented in field evaluation`);
}

/**
 * Fill buffer from intrinsic property (new system with exhaustive checks).
 * Intrinsics are per-element properties automatically available for any instance.
 */
function fillBufferIntrinsic(
  intrinsic: IntrinsicPropertyName,
  buffer: ArrayBufferView,
  instance: InstanceDecl
): void {
  const count = typeof instance.count === 'number' ? instance.count : 0;
  const N = count;

  switch (intrinsic) {
    case 'index': {
      // Element index (0, 1, 2, ..., N-1)
      const arr = buffer as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i] = i;
      }
      break;
    }

    case 'normalizedIndex': {
      // Normalized index (0.0 to 1.0)
      const arr = buffer as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i] = N > 1 ? i / (N - 1) : 0;
      }
      break;
    }

    case 'randomId': {
      // Deterministic per-element random (0.0 to 1.0)
      const arr = buffer as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i] = pseudoRandom(i);
      }
      break;
    }

    case 'position': {
      // Layout-based position (vec2)
      fillLayoutPosition(buffer, instance);
      break;
    }

    case 'radius': {
      // Layout-based radius (float)
      fillLayoutRadius(buffer, instance);
      break;
    }

    default: {
      // TypeScript exhaustiveness check: if all cases are handled, this never executes
      const _exhaustive: never = intrinsic;
      throw new Error(`Unknown intrinsic: ${_exhaustive}`);
    }
  }
}

/**
 * Pseudo-random generator for deterministic per-element randomness.
 * Uses sine-based hash for smooth, deterministic results.
 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Fill buffer with layout-based positions (vec2).
 * Applies the instance's layout specification to compute positions.
 */
function fillLayoutPosition(buffer: ArrayBufferView, instance: InstanceDecl): void {
  const count = typeof instance.count === 'number' ? instance.count : 0;
  const N = count;
  const layout = instance.layout;
  const arr = buffer as Float32Array;

  if (layout.kind === 'grid') {
    const rows = layout.rows || 1;
    const cols = layout.cols || 1;
    for (let i = 0; i < N; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      arr[i * 2 + 0] = cols > 1 ? col / (cols - 1) : 0.5;
      arr[i * 2 + 1] = rows > 1 ? row / (rows - 1) : 0.5;
    }
  } else if (layout.kind === 'circular') {
    const radius = layout.radius || 0.3;
    const cx = 0.5;
    const cy = 0.5;
    const TWO_PI = Math.PI * 2;
    for (let i = 0; i < N; i++) {
      const angle = TWO_PI * (i / N);
      arr[i * 2 + 0] = cx + radius * Math.cos(angle);
      arr[i * 2 + 1] = cy + radius * Math.sin(angle);
    }
  } else if (layout.kind === 'linear') {
    const spacing = layout.spacing || 0.01;
    for (let i = 0; i < N; i++) {
      arr[i * 2 + 0] = 0.5;
      arr[i * 2 + 1] = i * spacing;
    }
  } else {
    // Default: unordered or unknown layouts default to (0.5, 0.5)
    for (let i = 0; i < N; i++) {
      arr[i * 2 + 0] = 0.5;
      arr[i * 2 + 1] = 0.5;
    }
  }
}

/**
 * Fill buffer with layout-based radius (float).
 * For circular layouts, uses the layout radius; for others, uses a default.
 */
function fillLayoutRadius(buffer: ArrayBufferView, instance: InstanceDecl): void {
  const count = typeof instance.count === 'number' ? instance.count : 0;
  const N = count;
  const layout = instance.layout;
  const arr = buffer as Float32Array;

  let radius = 0.02; // Default radius for grid/linear layouts
  if (layout.kind === 'circular') {
    radius = layout.radius || 0.3;
  }

  for (let i = 0; i < N; i++) {
    arr[i] = radius;
  }
}

/**
 * Apply map function to buffer
 */
/**
 * Apply map function to buffer
 *
 * LAYER CONTRACT: Map only supports opcodes for scalar math.
 * Kernels are not allowed in map context - use zip or zipSig for field kernels.
 */
function applyMap(
  out: ArrayBufferView,
  input: ArrayBufferView,
  fn: PureFn,
  N: number,
  type: SignalType
): void {
  const outArr = out as Float32Array;
  const inArr = input as Float32Array;

  if (fn.kind === 'opcode') {
    const op = fn.opcode;
    for (let i = 0; i < N; i++) {
      outArr[i] = applyOpcode(op, [inArr[i]]);
    }
  } else if (fn.kind === 'kernel') {
    // Map is not the place for kernels - they belong in zip/zipSig
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
 */
function applyZip(
  out: ArrayBufferView,
  inputs: ArrayBufferView[],
  fn: PureFn,
  N: number,
  type: SignalType
): void {
  if (fn.kind === 'opcode') {
    const outArr = out as Float32Array;
    const inArrs = inputs.map((buf) => buf as Float32Array);
    const op = fn.opcode;
    for (let i = 0; i < N; i++) {
      const values = inArrs.map((arr) => arr[i]);
      outArr[i] = applyOpcode(op, values);
    }
  } else if (fn.kind === 'kernel') {
    // Handle kernel functions
    applyKernel(out, inputs, fn.name, N, type);
  } else {
    throw new Error(`Zip function kind ${fn.kind} not implemented`);
  }
}

/**
 * Apply zipSig function
 */
function applyZipSig(
  out: ArrayBufferView,
  fieldInput: ArrayBufferView,
  sigValues: number[],
  fn: PureFn,
  N: number,
  type: SignalType
): void {
  const outArr = out as Float32Array;
  const inArr = fieldInput as Float32Array;

  if (fn.kind === 'opcode') {
    const op = fn.opcode;
    for (let i = 0; i < N; i++) {
      const values = [inArr[i], ...sigValues];
      outArr[i] = applyOpcode(op, values);
    }
  } else if (fn.kind === 'kernel') {
    applyKernelZipSig(out, fieldInput, sigValues, fn.name, N, type);
  } else {
    throw new Error(`ZipSig function kind ${fn.kind} not implemented`);
  }
}

/**
 * Apply kernel function to zip
 */
function applyKernel(
  out: ArrayBufferView,
  inputs: ArrayBufferView[],
  kernelName: string,
  N: number,
  type: SignalType
): void {
  if (kernelName === 'makeVec2') {
    // ════════════════════════════════════════════════════════════════
    // makeVec2: Combine two float fields into vec2
    // ────────────────────────────────────────────────────────────────
    // Inputs: [x: float, y: float]
    // Output: vec2
    // Coord-space: AGNOSTIC - operates on raw field values
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 2) {
      throw new Error('makeVec2 requires exactly 2 inputs');
    }
    const outArr = out as Float32Array;
    const xArr = inputs[0] as Float32Array;
    const yArr = inputs[1] as Float32Array;
    for (let i = 0; i < N; i++) {
      outArr[i * 2 + 0] = xArr[i];
      outArr[i * 2 + 1] = yArr[i];
    }
  } else if (kernelName === 'hsvToRgb') {
    // ════════════════════════════════════════════════════════════════
    // hsvToRgb: Convert HSV to RGB color
    // ────────────────────────────────────────────────────────────────
    // Inputs: [h: float, s: float, v: float]
    // Output: color (rgba)
    // Domain: h wraps to [0,1], s and v clamped to [0,1]
    // Coord-space: N/A - color values are space-independent
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 3) {
      throw new Error('hsvToRgb requires exactly 3 inputs (h, s, v)');
    }
    const outArr = out as Uint8ClampedArray;
    const hArr = inputs[0] as Float32Array;
    const sArr = inputs[1] as Float32Array;
    const vArr = inputs[2] as Float32Array;
    for (let i = 0; i < N; i++) {
      const [r, g, b] = hsvToRgb(hArr[i], sArr[i], vArr[i]);
      outArr[i * 4 + 0] = r;
      outArr[i * 4 + 1] = g;
      outArr[i * 4 + 2] = b;
      outArr[i * 4 + 3] = 255; // Full opacity
    }
  } else if (kernelName === 'jitter2d') {
    // ════════════════════════════════════════════════════════════════
    // jitter2d: Add per-element random jitter to vec2 positions
    // ────────────────────────────────────────────────────────────────
    // Inputs: [pos: vec2, rand: float, amountX: float, amountY: float]
    // Output: vec2
    // Domain: rand is arbitrary float seed, amounts are in coordinate units
    // Coord-space: AGNOSTIC - offsets are in same units as input pos
    //   If pos is local-space, amounts are local units
    //   If pos is world-space, amounts are world units
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 4) {
      throw new Error('jitter2d requires exactly 4 inputs (pos, rand, amountX, amountY)');
    }
    const outArr = out as Float32Array;
    const posArr = inputs[0] as Float32Array;
    const randArr = inputs[1] as Float32Array;
    const amountXArr = inputs[2] as Float32Array;
    const amountYArr = inputs[3] as Float32Array;

    for (let i = 0; i < N; i++) {
      const rand = randArr[i];
      // Derive two independent random values from the single rand seed
      // Using trigonometric hash for visual quality
      const randX = Math.sin(rand * 12.9898 + 78.233) * 43758.5453;
      const randY = Math.sin(rand * 93.9898 + 67.345) * 24571.2341;
      // Normalize to -1..1 range
      const offsetX = ((randX - Math.floor(randX)) * 2 - 1) * amountXArr[i];
      const offsetY = ((randY - Math.floor(randY)) * 2 - 1) * amountYArr[i];

      outArr[i * 2 + 0] = posArr[i * 2 + 0] + offsetX;
      outArr[i * 2 + 1] = posArr[i * 2 + 1] + offsetY;
    }
  } else if (kernelName === 'attract2d') {
    // ════════════════════════════════════════════════════════════════
    // attract2d: Drift positions towards target over time
    // ────────────────────────────────────────────────────────────────
    // Inputs: [pos: vec2, targetX: float, targetY: float, phase: float, strength: float]
    // Output: vec2
    // Domain: phase typically [0,1] cycle, strength is dimensionless [0,1]
    // Coord-space: AGNOSTIC - operates in same space as input pos/target
    //   If pos is local-space, target should be local-space
    //   If pos is world-space, target should be world-space
    // Behavior: drift = phase * strength, newPos = pos + (target-pos)*drift
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 5) {
      throw new Error('attract2d requires 5 inputs (pos, targetX, targetY, phase, strength)');
    }
    const outArr = out as Float32Array;
    const posArr = inputs[0] as Float32Array;
    const targetXArr = inputs[1] as Float32Array;
    const targetYArr = inputs[2] as Float32Array;
    const phaseArr = inputs[3] as Float32Array;
    const strengthArr = inputs[4] as Float32Array;

    for (let i = 0; i < N; i++) {
      const x = posArr[i * 2 + 0];
      const y = posArr[i * 2 + 1];
      const tx = targetXArr[i];
      const ty = targetYArr[i];
      const phase = phaseArr[i];
      const strength = strengthArr[i];

      // Direction towards target
      const dx = tx - x;
      const dy = ty - y;

      // Drift increases with phase (time accumulation within cycle)
      // As phase goes 0→1, particles drift more towards target
      const drift = phase * strength;

      outArr[i * 2 + 0] = x + dx * drift;
      outArr[i * 2 + 1] = y + dy * drift;
    }
  } else if (kernelName === 'fieldAngularOffset') {
    // ════════════════════════════════════════════════════════════════
    // fieldAngularOffset: Compute angular offset for rotation
    // ────────────────────────────────────────────────────────────────
    // Inputs: [id01: float, phase: float, spin: float]
    // Output: float (radians)
    // Domain: id01 in [0,1], phase typically [0,1], spin is cycles/phase
    // Coord-space: N/A - outputs angle in RADIANS
    // Formula: offset = 2π * phase * spin
    // Note: id01 is provided for field alignment but not used in calc
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 3) {
      throw new Error('fieldAngularOffset requires 3 inputs (id01, phase, spin)');
    }
    const outArr = out as Float32Array;
    const id01Arr = inputs[0] as Float32Array;
    const phaseArr = inputs[1] as Float32Array;
    const spinArr = inputs[2] as Float32Array;
    const TWO_PI = Math.PI * 2;

    for (let i = 0; i < N; i++) {
      // offset = 2π * phase * spin (id01 not used in offset calc, just for field alignment)
      outArr[i] = TWO_PI * phaseArr[i] * spinArr[i];
    }
  } else if (kernelName === 'fieldRadiusSqrt') {
    // ════════════════════════════════════════════════════════════════
    // fieldRadiusSqrt: Scale radius by sqrt(id) for uniform area distribution
    // ────────────────────────────────────────────────────────────────
    // Inputs: [id01: float, radius: float]
    // Output: float
    // Domain: id01 expects [0,1] normalized index
    // Coord-space: AGNOSTIC - radius units preserved in output
    // Formula: effective_radius = radius * sqrt(id01)
    // Use case: Distribute particles uniformly by area in a circle
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 2) {
      throw new Error('fieldRadiusSqrt requires 2 inputs (id01, radius)');
    }
    const outArr = out as Float32Array;
    const id01Arr = inputs[0] as Float32Array;
    const radiusArr = inputs[1] as Float32Array;

    for (let i = 0; i < N; i++) {
      outArr[i] = radiusArr[i] * Math.sqrt(id01Arr[i]);
    }
  } else if (kernelName === 'fieldAdd') {
    // ════════════════════════════════════════════════════════════════
    // fieldAdd: Element-wise addition of two float fields
    // ────────────────────────────────────────────────────────────────
    // Inputs: [a: float, b: float]
    // Output: float
    // Coord-space: AGNOSTIC - operates on raw field values
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 2) {
      throw new Error('fieldAdd requires 2 inputs (a, b)');
    }
    const outArr = out as Float32Array;
    const aArr = inputs[0] as Float32Array;
    const bArr = inputs[1] as Float32Array;

    for (let i = 0; i < N; i++) {
      outArr[i] = aArr[i] + bArr[i];
    }
  } else if (kernelName === 'fieldPolarToCartesian') {
    // ════════════════════════════════════════════════════════════════
    // fieldPolarToCartesian: Convert polar to cartesian coordinates
    // ────────────────────────────────────────────────────────────────
    // Inputs: [centerX: float, centerY: float, radius: float, angle: float]
    // Output: vec2
    // Domain: angle in RADIANS
    // Coord-space: AGNOSTIC - pure geometric transform
    //   Output space matches input center/radius space
    //   If center is local (0,0) and radius is local units → local output
    //   If center is world (0.5,0.5) and radius is world → world output
    // Formula: x = cx + r*cos(angle), y = cy + r*sin(angle)
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 4) {
      throw new Error('fieldPolarToCartesian requires 4 inputs (centerX, centerY, radius, angle)');
    }
    const outArr = out as Float32Array;
    const cxArr = inputs[0] as Float32Array;
    const cyArr = inputs[1] as Float32Array;
    const radiusArr = inputs[2] as Float32Array;
    const angleArr = inputs[3] as Float32Array;

    for (let i = 0; i < N; i++) {
      const cx = cxArr[i];
      const cy = cyArr[i];
      const r = radiusArr[i];
      const a = angleArr[i];
      outArr[i * 2 + 0] = cx + r * Math.cos(a);
      outArr[i * 2 + 1] = cy + r * Math.sin(a);
    }
  } else if (kernelName === 'fieldPulse') {
    // ════════════════════════════════════════════════════════════════
    // fieldPulse: Pulsing animation with per-element phase offset
    // ────────────────────────────────────────────────────────────────
    // Inputs: [id01: float, phase: float, base: float, amplitude: float, spread: float]
    // Output: float
    // Domain: id01 expects [0,1], phase typically [0,1] cycle
    // Coord-space: AGNOSTIC - operates on scalar values
    // Formula: value = base + amplitude * sin(2π * (phase + id01 * spread))
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 5) {
      throw new Error('fieldPulse requires 5 inputs (id01, phase, base, amplitude, spread)');
    }
    const outArr = out as Float32Array;
    const id01Arr = inputs[0] as Float32Array;
    const phaseArr = inputs[1] as Float32Array;
    const baseArr = inputs[2] as Float32Array;
    const ampArr = inputs[3] as Float32Array;
    const spreadArr = inputs[4] as Float32Array;
    const TWO_PI = Math.PI * 2;

    for (let i = 0; i < N; i++) {
      const effectivePhase = phaseArr[i] + id01Arr[i] * spreadArr[i];
      outArr[i] = baseArr[i] + ampArr[i] * Math.sin(TWO_PI * effectivePhase);
    }
  } else if (kernelName === 'fieldHueFromPhase') {
    // ════════════════════════════════════════════════════════════════
    // fieldHueFromPhase: Compute hue value from phase and index
    // ────────────────────────────────────────────────────────────────
    // Inputs: [id01: float, phase: float]
    // Output: float (hue in [0,1])
    // Domain: id01 expects [0,1], phase typically [0,1]
    // Coord-space: N/A - color values are space-independent
    // Formula: hue = fract(id01 + phase)
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 2) {
      throw new Error('fieldHueFromPhase requires 2 inputs (id01, phase)');
    }
    const outArr = out as Float32Array;
    const id01Arr = inputs[0] as Float32Array;
    const phaseArr = inputs[1] as Float32Array;

    for (let i = 0; i < N; i++) {
      const hue = id01Arr[i] + phaseArr[i];
      outArr[i] = hue - Math.floor(hue); // fract (mod 1.0)
    }
  } else if (kernelName === 'fieldJitter2D') {
    // ════════════════════════════════════════════════════════════════
    // fieldJitter2D: Alias for jitter2d (same implementation)
    // ────────────────────────────────────────────────────────────────
    // Inputs: [pos: vec2, rand: float, amountX: float, amountY: float]
    // Output: vec2
    // Domain: rand is arbitrary float seed, amounts are in coordinate units
    // Coord-space: AGNOSTIC - offsets are in same units as input pos
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 4) {
      throw new Error('fieldJitter2D requires 4 inputs (pos, rand, amountX, amountY)');
    }
    const outArr = out as Float32Array;
    const posArr = inputs[0] as Float32Array;
    const randArr = inputs[1] as Float32Array;
    const amountXArr = inputs[2] as Float32Array;
    const amountYArr = inputs[3] as Float32Array;

    for (let i = 0; i < N; i++) {
      const rand = randArr[i];
      const randX = Math.sin(rand * 12.9898 + 78.233) * 43758.5453;
      const randY = Math.sin(rand * 93.9898 + 67.345) * 24571.2341;
      const offsetX = ((randX - Math.floor(randX)) * 2 - 1) * amountXArr[i];
      const offsetY = ((randY - Math.floor(randY)) * 2 - 1) * amountYArr[i];

      outArr[i * 2 + 0] = posArr[i * 2 + 0] + offsetX;
      outArr[i * 2 + 1] = posArr[i * 2 + 1] + offsetY;
    }
  } else if (kernelName === 'fieldGoldenAngle') {
    // ════════════════════════════════════════════════════════════════
    // fieldGoldenAngle: Compute golden angle spiral angles
    // ────────────────────────────────────────────────────────────────
    // Inputs: [id01: float]
    // Output: float (radians)
    // Domain: id01 expects [0,1] normalized index
    // Coord-space: N/A - outputs angle in RADIANS
    // Formula: angle = id01 * turns * goldenAngle
    //   where goldenAngle ≈ 2.39996 rad (π * (3 - √5))
    // Note: turns=50 is currently baked in (TODO: make configurable)
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 1) {
      throw new Error('fieldGoldenAngle requires exactly 1 input (id01)');
    }
    const outArr = out as Float32Array;
    const id01Arr = inputs[0] as Float32Array;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996
    const turns = 50;

    for (let i = 0; i < N; i++) {
      outArr[i] = id01Arr[i] * turns * goldenAngle;
    }
  } else {
    throw new Error(`Unknown kernel function: ${kernelName}`);
  }
}

/**
 * Apply kernel function to zipSig
 */
function applyKernelZipSig(
  out: ArrayBufferView,
  fieldInput: ArrayBufferView,
  sigValues: number[],
  kernelName: string,
  N: number,
  type: SignalType
): void {
  if (kernelName === 'applyOpacity') {
    // ════════════════════════════════════════════════════════════════
    // applyOpacity: Apply uniform opacity to color field
    // ────────────────────────────────────────────────────────────────
    // Field input: color (rgba)
    // Signals: [opacity: float]
    // Output: color (rgba)
    // Domain: opacity clamped to [0,1]
    // Coord-space: N/A - color values are space-independent
    // ════════════════════════════════════════════════════════════════
    if (sigValues.length !== 1) {
      throw new Error('applyOpacity requires exactly 1 signal (opacity)');
    }
    const outArr = out as Uint8ClampedArray;
    const inArr = fieldInput as Uint8ClampedArray;
    const opacity = Math.max(0, Math.min(1, sigValues[0]));
    const alpha = Math.round(opacity * 255);
    for (let i = 0; i < N; i++) {
      outArr[i * 4 + 0] = inArr[i * 4 + 0];
      outArr[i * 4 + 1] = inArr[i * 4 + 1];
      outArr[i * 4 + 2] = inArr[i * 4 + 2];
      outArr[i * 4 + 3] = alpha;
    }
  } else if (kernelName === 'hsvToRgb') {
    // ════════════════════════════════════════════════════════════════
    // hsvToRgb: Convert HSV to RGB (zipSig variant)
    // ────────────────────────────────────────────────────────────────
    // Field input: hue (float per element)
    // Signals: [sat: float, val: float] (uniform across all elements)
    // Output: color (rgba)
    // Domain: hue wraps to [0,1], sat/val are [0,1]
    // Coord-space: N/A - color values are space-independent
    // ════════════════════════════════════════════════════════════════
    if (sigValues.length !== 2) {
      throw new Error('hsvToRgb zipSig requires 2 signals (sat, val)');
    }
    const outArr = out as Uint8ClampedArray;
    const hueArr = fieldInput as Float32Array;
    const sat = sigValues[0];
    const val = sigValues[1];

    for (let i = 0; i < N; i++) {
      const [r, g, b] = hsvToRgb(hueArr[i], sat, val);
      outArr[i * 4 + 0] = r;
      outArr[i * 4 + 1] = g;
      outArr[i * 4 + 2] = b;
      outArr[i * 4 + 3] = 255; // Full opacity
    }
  } else if (kernelName === 'circleLayout') {
    // ════════════════════════════════════════════════════════════════
    // circleLayout: Arrange elements in a circle
    // ────────────────────────────────────────────────────────────────
    // Field input: normalizedIndex (expects [0,1])
    // Signals: [radius: float, phase: float]
    // Output: vec2
    // Domain: normalizedIndex in [0,1], phase in [0,1] for full rotation
    // Coord-space: Produces WORLD-SPACE positions centered at (0.5, 0.5)
    //   This is one of the few kernels that outputs explicit world coords
    // Formula: angle = 2π*(index+phase), pos = center + radius*(cos,sin)
    // ════════════════════════════════════════════════════════════════
    if (sigValues.length !== 2) {
      throw new Error('circleLayout requires 2 signals (radius, phase)');
    }
    const outArr = out as Float32Array;
    const indexArr = fieldInput as Float32Array;
    const radius = sigValues[0];
    const phase = sigValues[1];
    const TWO_PI = Math.PI * 2;
    const cx = 0.5; // Center in normalized coords
    const cy = 0.5;

    for (let i = 0; i < N; i++) {
      const angle = TWO_PI * (indexArr[i] + phase);
      outArr[i * 2 + 0] = cx + radius * Math.cos(angle);
      outArr[i * 2 + 1] = cy + radius * Math.sin(angle);
    }
  } else if (kernelName === 'circleAngle') {
    // ════════════════════════════════════════════════════════════════
    // circleAngle: Compute angle for circular arrangement
    // ────────────────────────────────────────────────────────────────
    // Field input: normalizedIndex (expects [0,1])
    // Signals: [phase: float]
    // Output: float (radians)
    // Domain: normalizedIndex in [0,1], phase in [0,1] for full rotation
    // Coord-space: N/A - outputs angle in RADIANS
    // Formula: angle = 2π * (index + phase)
    // ════════════════════════════════════════════════════════════════
    if (sigValues.length !== 1) {
      throw new Error('circleAngle requires 1 signal (phase)');
    }
    const outArr = out as Float32Array;
    const indexArr = fieldInput as Float32Array;
    const phase = sigValues[0];
    const TWO_PI = Math.PI * 2;

    for (let i = 0; i < N; i++) {
      outArr[i] = TWO_PI * (indexArr[i] + phase);
    }
  } else if (kernelName === 'polygonVertex') {
    // ════════════════════════════════════════════════════════════════
    // polygonVertex: Generate regular polygon vertices
    // ────────────────────────────────────────────────────────────────
    // Field input: index (integer vertex index)
    // Signals: [sides: float, radiusX: float, radiusY: float]
    // Output: vec2
    // Domain: sides >= 3 (rounded), radiusX/radiusY are shape units
    // Coord-space: Produces LOCAL-SPACE control points centered at (0,0)
    //   This is geometry definition, not instance placement
    // Formula: angle = (index/sides)*2π - π/2 (start at top, go clockwise)
    //   vertex = (radiusX*cos(angle), radiusY*sin(angle))
    // ════════════════════════════════════════════════════════════════
    if (sigValues.length !== 3) {
      throw new Error('polygonVertex requires 3 signals (sides, radiusX, radiusY)');
    }
    const outArr = out as Float32Array;
    const indexArr = fieldInput as Float32Array;
    const sides = Math.max(3, Math.round(sigValues[0])); // Ensure at least 3 sides
    const radiusX = sigValues[1];
    const radiusY = sigValues[2];
    const TWO_PI = Math.PI * 2;

    for (let i = 0; i < N; i++) {
      const index = Math.round(indexArr[i]);
      // Angle for this vertex: starts at -90 degrees (top) and goes clockwise
      const angle = (index / sides) * TWO_PI - Math.PI / 2;
      outArr[i * 2 + 0] = radiusX * Math.cos(angle);
      outArr[i * 2 + 1] = radiusY * Math.sin(angle);
    }
  } else {
    throw new Error(`Unknown zipSig kernel function: ${kernelName}`);
  }
}

/**
 * Convert HSV to RGB
 * 
 * @param h - Hue in [0,1], wraps outside this range
 * @param s - Saturation in [0,1], clamped
 * @param v - Value/brightness in [0,1], clamped
 * @returns [r, g, b] in [0, 255]
 * 
 * Coord-space: N/A - color values are space-independent
 */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  // Wrap hue to [0, 1]
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  v = Math.max(0, Math.min(1, v));

  const c = v * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = v - c;

  let r1, g1, b1;
  const h6 = h * 6;
  if (h6 < 1) {
    [r1, g1, b1] = [c, x, 0];
  } else if (h6 < 2) {
    [r1, g1, b1] = [x, c, 0];
  } else if (h6 < 3) {
    [r1, g1, b1] = [0, c, x];
  } else if (h6 < 4) {
    [r1, g1, b1] = [0, x, c];
  } else if (h6 < 5) {
    [r1, g1, b1] = [x, 0, c];
  } else {
    [r1, g1, b1] = [c, 0, x];
  }

  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

/**
 * Hash string to float in [0, 1]
 */
function hashToFloat01(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  const t = (h * 12.9898 + 78.233) * 43758.5453;
  return t - Math.floor(t);
}
