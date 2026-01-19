/**
 * Field Materializer
 *
 * Converts FieldExpr IR nodes into typed array buffers.
 * Pure IR path - no legacy fallbacks.
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

  // Cache result
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

    case 'source': {
      // Fill from instance source
      // Use intrinsic property if available (new-style), otherwise fall back to sourceId
      const sourceKey = (expr as any).intrinsic ?? expr.sourceId;
      fillBufferSource(sourceKey, buffer, instance);
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

    case 'mapIndexed': {
      // MapIndexed: generate from index + signals
      const sigValues = expr.signals?.map((id) => evaluateSignal(id, signals, state)) ?? [];
      applyMapIndexed(buffer, expr.fn, sigValues, N, instance, expr.type);
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
 * Fill buffer from instance source
 */
function fillBufferSource(
  sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex',
  buffer: ArrayBufferView,
  instance: InstanceDecl
): void {
  const count = typeof instance.count === 'number' ? instance.count : 0;
  const N = count;

  switch (sourceId) {
    case 'index': {
      const arr = buffer as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i] = i;
      }
      break;
    }

    case 'normalizedIndex': {
      const arr = buffer as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i] = N > 1 ? i / (N - 1) : 0;
      }
      break;
    }

    case 'pos0': {
      // Position source depends on instance layout
      const layout = instance.layout;

      if (layout.kind === 'grid') {
        const rows = layout.rows || 1;
        const cols = layout.cols || 1;
        const arr = buffer as Float32Array;
        for (let i = 0; i < N; i++) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          arr[i * 2 + 0] = cols > 1 ? col / (cols - 1) : 0.5;
          arr[i * 2 + 1] = rows > 1 ? row / (rows - 1) : 0.5;
        }
      } else {
        // For non-grid layouts, default to (0, 0)
        // TODO: Implement other layouts (circular, linear, etc.)
        const arr = buffer as Float32Array;
        for (let i = 0; i < N; i++) {
          arr[i * 2 + 0] = 0;
          arr[i * 2 + 1] = 0;
        }
      }
      break;
    }

    case 'idRand': {
      // Deterministic random from element ID
      // For now, use index-based seeding
      // TODO: Support explicit element IDs if instance provides them
      const arr = buffer as Float32Array;
      for (let i = 0; i < N; i++) {
        const elementId = `${instance.id}:${i}`;
        arr[i] = hashToFloat01(elementId);
      }
      break;
    }

    default: {
      const _exhaustive: never = sourceId;
      throw new Error(`Unknown source ID: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Apply map function to buffer
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
    // Handle single-input kernel functions
    switch (fn.name) {
      case 'sqrt':
        for (let i = 0; i < N; i++) {
          outArr[i] = Math.sqrt(inArr[i]);
        }
        break;
      case 'floor':
        for (let i = 0; i < N; i++) {
          outArr[i] = Math.floor(inArr[i]);
        }
        break;
      case 'ceil':
        for (let i = 0; i < N; i++) {
          outArr[i] = Math.ceil(inArr[i]);
        }
        break;
      case 'round':
        for (let i = 0; i < N; i++) {
          outArr[i] = Math.round(inArr[i]);
        }
        break;
      case 'fieldGoldenAngle': {
        // Golden angle ≈ 2.39996... radians (137.508°)
        // Formula: angle = id01 * turns * goldenAngle
        // Default turns = 50 (baked in for now)
        const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996
        const turns = 50;
        for (let i = 0; i < N; i++) {
          outArr[i] = inArr[i] * turns * goldenAngle;
        }
        break;
      }
      default:
        throw new Error(`Unknown map kernel: ${fn.name}`);
    }
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
 * Apply mapIndexed function
 */
function applyMapIndexed(
  out: ArrayBufferView,
  fn: PureFn,
  sigValues: number[],
  N: number,
  instance: InstanceDecl,
  type: SignalType
): void {
  const outArr = out as Float32Array;

  if (fn.kind === 'kernel') {
    // Named kernel functions
    if (fn.name === 'gridPos') {
      // Generate grid positions
      const layout = instance.layout;
      if (layout.kind === 'grid') {
        const rows = layout.rows || 1;
        const cols = layout.cols || 1;
        for (let i = 0; i < N; i++) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          outArr[i * 2 + 0] = cols > 1 ? col / (cols - 1) : 0.5;
          outArr[i * 2 + 1] = rows > 1 ? row / (rows - 1) : 0.5;
        }
      } else {
        // Default to (0.5, 0.5) for non-grid layouts
        for (let i = 0; i < N; i++) {
          outArr[i * 2 + 0] = 0.5;
          outArr[i * 2 + 1] = 0.5;
        }
      }
    } else {
      throw new Error(`Unknown kernel function: ${fn.name}`);
    }
  } else {
    throw new Error(`MapIndexed function kind ${fn.kind} not implemented`);
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
    // Combine two float fields into vec2
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
    // Convert HSV to RGB
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
    // Add per-element random jitter to vec2 positions
    // Inputs: [pos(vec2), rand(float), amountX(float), amountY(float)]
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
    // Flies circling a light - drift towards target over TIME
    // Phase accumulates drift. Each cycle, flies migrate more towards target.
    // Inputs: [pos(vec2), targetX(float), targetY(float), phase(float), strength(float)]
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
    // Angular offset: offset = 2π * phase * spin
    // Inputs: [id01, phase, spin]
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
    // Square root radius: effective_radius = radius * sqrt(id01)
    // Inputs: [id01, radius]
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
    // Add two fields
    // Inputs: [a, b]
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
    // Polar to Cartesian: (centerX, centerY, radius, angle) -> vec2
    // Inputs: [centerX, centerY, radius, angle]
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
    // Pulsing animation: value = base + amplitude * sin(2π * (phase + id01 * spread))
    // Inputs: [id01, phase, base, amplitude, spread]
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
    // Hue from phase: hue = (id01 + phase) mod 1.0
    // Inputs: [id01, phase]
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
    // Alias for jitter2d
    // Inputs: [pos(vec2), rand(float), amountX(float), amountY(float)]
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
    // Apply opacity to color field
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
    // HSV to RGB: field input is hue, sigValues are [sat, val]
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
    // Circle layout: normalized index -> vec2 position on circle
    // Input field: normalizedIndex (0-1)
    // Signals: [radius, phase]
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
    // Circle angle: normalized index -> angle in radians
    // Input field: normalizedIndex (0-1)
    // Signals: [phase]
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
  } else {
    throw new Error(`Unknown zipSig kernel function: ${kernelName}`);
  }
}

/**
 * Convert HSV to RGB
 * H, S, V in [0, 1]
 * Returns [r, g, b] in [0, 255]
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
