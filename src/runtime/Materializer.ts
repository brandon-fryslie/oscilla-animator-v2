/**
 * Field Materializer
 *
 * Converts FieldExpr IR nodes into typed array buffers.
 * Pure IR path - no legacy fallbacks.
 */

import type {
  DomainId,
  FieldExprId,
  SigExprId,
} from '../types';
import type { SignalType } from '../core/canonical-types';
import type {
  FieldExpr,
  DomainDef,
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
 * @param domainId - Domain to materialize over
 * @param fields - Dense array of field expressions
 * @param signals - Dense array of signal expressions (for lazy evaluation)
 * @param domains - Domain definition map
 * @param state - Runtime state (for signal values)
 * @param pool - Buffer pool for allocation
 * @returns Typed array with materialized field data
 */
export function materialize(
  fieldId: FieldExprId,
  domainId: DomainId,
  fields: readonly FieldExpr[],
  signals: readonly SigExpr[],
  domains: ReadonlyMap<DomainId, DomainDef>,
  state: RuntimeState,
  pool: BufferPool
): ArrayBufferView {
  // Check cache
  const cacheKey = `${fieldId}:${domainId}`;
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

  // Get domain
  const domain = domains.get(domainId);
  if (!domain) {
    throw new Error(`Domain ${domainId} not found`);
  }

  // Allocate buffer
  const format = getBufferFormat(expr.type.payload);
  const buffer = pool.alloc(format, domain.count);

  // Fill buffer based on expression kind
  fillBuffer(expr, buffer, domain, fields, signals, domains, state, pool);

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
  domain: DomainDef,
  fields: readonly FieldExpr[],
  signals: readonly SigExpr[],
  domains: ReadonlyMap<DomainId, DomainDef>,
  state: RuntimeState,
  pool: BufferPool
): void {
  const N = domain.count;

  switch (expr.kind) {
    case 'const': {
      // Fill with constant value
      const arr = buffer as Float32Array | Uint8ClampedArray;
      const value = typeof expr.value === 'number' ? expr.value : 0;

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
      // Fill from domain source
      fillBufferSource(expr.sourceId, buffer, domain);
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
        domain.id,
        fields,
        signals,
        domains,
        state,
        pool
      );
      applyMap(buffer, input, expr.fn, N, expr.type);
      break;
    }

    case 'zip': {
      // Zip: get inputs, apply function
      const inputs = expr.inputs.map((id) =>
        materialize(id, domain.id, fields, signals, domains, state, pool)
      );
      applyZip(buffer, inputs, expr.fn, N, expr.type);
      break;
    }

    case 'zipSig': {
      // ZipSig: combine field with signals
      const fieldInput = materialize(
        expr.field,
        domain.id,
        fields,
        signals,
        domains,
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
      applyMapIndexed(buffer, expr.fn, sigValues, N, domain, expr.type);
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
 * Fill buffer from domain source
 */
function fillBufferSource(
  sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex',
  buffer: ArrayBufferView,
  domain: DomainDef
): void {
  const N = domain.count;

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
      // Position source depends on domain kind
      if (domain.kind === 'grid') {
        const rows = (domain.params.rows as number) || 1;
        const cols = (domain.params.cols as number) || 1;
        const arr = buffer as Float32Array;
        for (let i = 0; i < N; i++) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          arr[i * 2 + 0] = cols > 1 ? col / (cols - 1) : 0.5;
          arr[i * 2 + 1] = rows > 1 ? row / (rows - 1) : 0.5;
        }
      } else {
        // For non-grid domains, default to (0, 0)
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
      const arr = buffer as Float32Array;
      for (let i = 0; i < N; i++) {
        const elementId = domain.elementIds[i] || String(i);
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
  domain: DomainDef,
  type: SignalType
): void {
  const outArr = out as Float32Array;

  if (fn.kind === 'kernel') {
    // Named kernel functions
    if (fn.name === 'gridPos') {
      // Generate grid positions
      const rows = (domain.params.rows as number) || 1;
      const cols = (domain.params.cols as number) || 1;
      for (let i = 0; i < N; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        outArr[i * 2 + 0] = cols > 1 ? col / (cols - 1) : 0.5;
        outArr[i * 2 + 1] = rows > 1 ? row / (rows - 1) : 0.5;
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
