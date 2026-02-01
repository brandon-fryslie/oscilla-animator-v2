/**
 * ══════════════════════════════════════════════════════════════════════
 * FIELD KERNELS
 * ══════════════════════════════════════════════════════════════════════
 *
 * Field kernels operate on typed array buffers (vec2/vec3/color/float).
 * They are COORD-SPACE AGNOSTIC - blocks define world/local semantics.
 *
 * ──────────────────────────────────────────────────────────────────────
 * LAYER CONTRACT
 * ──────────────────────────────────────────────────────────────────────
 *
 * FIELD KERNELS OPERATE ON:
 * - Typed array buffers (Float32Array, Uint8ClampedArray)
 * - Element-wise operations over N elements
 * - Vec2, vec3, color, and float outputs
 *
 * FIELD KERNELS DO NOT:
 * - Define scalar math (-> OpcodeInterpreter)
 * - Define signal kernels (-> SignalKernelLibrary)
 * - Define coord-space semantics (-> block-level contracts)
 *
 * ──────────────────────────────────────────────────────────────────────
 * REGISTERED KERNELS
 * ──────────────────────────────────────────────────────────────────────
 *
 * ZIP KERNELS (multiple field inputs):
 *   makeVec2, makeVec3, hsvToRgb, vec2ToVec3, fieldSetZ, extractX, extractY
 *
 * ZIPSIG KERNELS (field + signal inputs):
 *   hsvToRgb
 *
 * REMOVED (decomposed to opcodes):
 *   polygonVertex, starVertex - now use opcode sequences in path-blocks.ts
 *   circleLayoutUV, lineLayoutUV, gridLayoutUV - now use opcode sequences in instance-blocks.ts
 *
 * ──────────────────────────────────────────────────────────────────────
 * ARCHITECTURAL RULES
 * ──────────────────────────────────────────────────────────────────────
 *
 * - No scalar-only math here (use OpcodeInterpreter)
 * - Coord space is defined by calling block, not by kernel
 * - Angles are always in RADIANS
 * - Normalized inputs (id01) expect [0,1]
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import type { CanonicalType } from '../types';

/**
 * Apply field kernel to zip (multiple field inputs)
 */
export function applyFieldKernel(
  out: ArrayBufferView,
  inputs: ArrayBufferView[],
  fieldOp: string,
  N: number,
  _type: CanonicalType
): void {
  if (fieldOp === 'makeVec2') {
    // ════════════════════════════════════════════════════════════════
    // makeVec2: Combine two float fields into vec2
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
  } else if (fieldOp === 'makeVec3') {
    // ════════════════════════════════════════════════════════════════
    // makeVec3: Combine two float fields into vec3 with z=0
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 2) {
      throw new Error('makeVec3 requires exactly 2 inputs');
    }
    const outArr = out as Float32Array;
    const xArr = inputs[0] as Float32Array;
    const yArr = inputs[1] as Float32Array;
    for (let i = 0; i < N; i++) {
      outArr[i * 3 + 0] = xArr[i];
      outArr[i * 3 + 1] = yArr[i];
      outArr[i * 3 + 2] = 0.0;
    }
  } else if (fieldOp === 'extractX') {
    // ════════════════════════════════════════════════════════════════
    // extractX: Extract X component from vec2 field
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 1) {
      throw new Error('extractX requires exactly 1 input (vec2)');
    }
    const outArr = out as Float32Array;
    const inArr = inputs[0] as Float32Array;
    for (let i = 0; i < N; i++) {
      outArr[i] = inArr[i * 2 + 0];
    }
  } else if (fieldOp === 'extractY') {
    // ════════════════════════════════════════════════════════════════
    // extractY: Extract Y component from vec2 field
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 1) {
      throw new Error('extractY requires exactly 1 input (vec2)');
    }
    const outArr = out as Float32Array;
    const inArr = inputs[0] as Float32Array;
    for (let i = 0; i < N; i++) {
      outArr[i] = inArr[i * 2 + 1];
    }
  } else if (fieldOp === 'hsvToRgb') {
    // ════════════════════════════════════════════════════════════════
    // hsvToRgb: Convert HSV to RGB color
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
  } else if (fieldOp === 'vec2ToVec3') {
    // ════════════════════════════════════════════════════════════════
    // vec2ToVec3: Convert vec2 to vec3 with z=0
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 1) {
      throw new Error('vec2ToVec3 requires exactly 1 input (vec2)');
    }
    const outArr = out as Float32Array;
    const inArr = inputs[0] as Float32Array;

    for (let i = 0; i < N; i++) {
      outArr[i * 3 + 0] = inArr[i * 2 + 0];
      outArr[i * 3 + 1] = inArr[i * 2 + 1];
      outArr[i * 3 + 2] = 0.0;
    }
  } else if (fieldOp === 'fieldSetZ') {
    // ════════════════════════════════════════════════════════════════
    // fieldSetZ: Set the Z component of a vec3 position field
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 2) {
      throw new Error('fieldSetZ requires exactly 2 inputs (pos, z)');
    }
    const outArr = out as Float32Array;
    const posArr = inputs[0] as Float32Array;
    const zArr = inputs[1] as Float32Array;

    for (let i = 0; i < N; i++) {
      outArr[i * 3 + 0] = posArr[i * 3 + 0]; // X unchanged
      outArr[i * 3 + 1] = posArr[i * 3 + 1]; // Y unchanged
      outArr[i * 3 + 2] = zArr[i];           // Z from input field
    }
  } else {
    throw new Error(`Unknown field kernel: ${fieldOp}`);
  }
}

/**
 * Apply field kernel to zipSig (field + signal inputs)
 */
export function applyFieldKernelZipSig(
  out: ArrayBufferView,
  fieldInput: ArrayBufferView,
  sigValues: number[],
  fieldOp: string,
  N: number,
  _type: CanonicalType
): void {
  if (fieldOp === 'hsvToRgb') {
    // ════════════════════════════════════════════════════════════════
    // hsvToRgb: Convert HSV to RGB (zipSig variant)
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
  } else {
    throw new Error(`Unknown field kernel (zipSig): ${fieldOp}`);
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
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
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
