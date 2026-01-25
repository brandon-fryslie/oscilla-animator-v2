/**
 * ══════════════════════════════════════════════════════════════════════
 * FIELD KERNELS
 * ══════════════════════════════════════════════════════════════════════
 *
 * Field kernels operate on typed array buffers (vec2/vec3/color/float).
 * They are COORD-SPACE AGNOSTIC - blocks define world/local semantics.
 *
 * This module contains all field kernel implementations, extracted from
 * Materializer.ts for better separation of concerns.
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
 * - Define scalar math (→ OpcodeInterpreter)
 * - Define signal kernels (→ SignalEvaluator)
 * - Define coord-space semantics (→ block-level contracts)
 *
 * ──────────────────────────────────────────────────────────────────────
 * REGISTERED KERNELS
 * ──────────────────────────────────────────────────────────────────────
 *
 * ZIP KERNELS (multiple field inputs):
 *   makeVec2, makeVec3, hsvToRgb, jitter2d, attract2d, fieldAngularOffset,
 *   fieldRadiusSqrt, fieldAdd, fieldPolarToCartesian, fieldPulse,
 *   fieldHueFromPhase, fieldJitter2D, fieldGoldenAngle
 *
 * ZIPSIG KERNELS (field + signal inputs):
 *   applyOpacity, hsvToRgb, circleLayout, circleAngle,
 *   polygonVertex, starVertex, lineLayout, gridLayout
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

import type { SignalType } from '../types';

/**
 * Apply field kernel to zip (multiple field inputs)
 */
export function applyFieldKernel(
  out: ArrayBufferView,
  inputs: ArrayBufferView[],
  fieldOp: string,
  N: number,
  _type: SignalType
): void {
  if (fieldOp === 'makeVec2') {
    // ════════════════════════════════════════════════════════════════
    // makeVec2: Combine two float fields into vec2
    // ────────────────────────────────────────────────────────────────
    // Inputs: [x: float, y: float]
    // Output: vec2 (stride 2)
    // Coord-space: AGNOSTIC - operates on raw field values
    // Use case: Control points, tangent vectors, non-position vec2 data
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
    // ────────────────────────────────────────────────────────────────
    // Inputs: [x: float, y: float]
    // Output: vec3 (stride 3, z=0.0 explicit)
    // Coord-space: AGNOSTIC - operates on raw field values
    // Use case: Position fields requiring 3D representation
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
  } else if (fieldOp === 'hsvToRgb') {
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
  } else if (fieldOp === 'jitter2d') {
    // ════════════════════════════════════════════════════════════════
    // jitter2d: Add per-element random jitter to vec2 positions
    // ────────────────────────────────────────────────────────────────
    // Inputs: [pos: vec2, rand: float, amountX: float, amountY: float]
    // Output: vec2 (stride 2)
    // Domain: rand is arbitrary float seed, amounts are in coordinate units
    // Coord-space: AGNOSTIC - offsets are in same units as input pos
    //   If pos is local-space, amounts are local units
    //   If pos is world-space, amounts are world units
    // Use case: Control points, tangent vectors (NOT instance positions)
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
  } else if (fieldOp === 'attract2d') {
    // ════════════════════════════════════════════════════════════════
    // attract2d: Drift positions towards target over time
    // ────────────────────────────────────────────────────────────────
    // Inputs: [pos: vec2, targetX: float, targetY: float, phase: float, strength: float]
    // Output: vec2 (stride 2)
    // Domain: phase typically [0,1] cycle, strength is dimensionless [0,1]
    // Coord-space: AGNOSTIC - operates in same space as input pos/target
    //   If pos is local-space, target should be local-space
    //   If pos is world-space, target should be world-space
    // Behavior: drift = phase * strength, newPos = pos + (target-pos)*drift
    // Use case: Control points, tangent vectors (NOT instance positions)
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
  } else if (fieldOp === 'fieldAngularOffset') {
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
    const phaseArr = inputs[1] as Float32Array;
    const spinArr = inputs[2] as Float32Array;
    const TWO_PI = Math.PI * 2;

    for (let i = 0; i < N; i++) {
      // offset = 2π * phase * spin (id01 not used in offset calc, just for field alignment)
      outArr[i] = TWO_PI * phaseArr[i] * spinArr[i];
    }
  } else if (fieldOp === 'fieldRadiusSqrt') {
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
  } else if (fieldOp === 'fieldAdd') {
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
  } else if (fieldOp === 'fieldPolarToCartesian') {
    // ════════════════════════════════════════════════════════════════
    // fieldPolarToCartesian: Convert polar to cartesian coordinates
    // ────────────────────────────────────────────────────────────────
    // Inputs: [centerX: float, centerY: float, radius: float, angle: float]
    // Output: vec3 (stride 3, z=0.0 explicit)
    // Domain: angle in RADIANS
    // Coord-space: AGNOSTIC - pure geometric transform
    //   Output space matches input center/radius space
    //   If center is local (0,0) and radius is local units → local output
    //   If center is world (0.5,0.5) and radius is world → world output
    // Formula: x = cx + r*cos(angle), y = cy + r*sin(angle)
    // Use case: Instance positions (world-space)
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
      outArr[i * 3 + 0] = cx + r * Math.cos(a);
      outArr[i * 3 + 1] = cy + r * Math.sin(a);
      outArr[i * 3 + 2] = 0.0;
    }
  } else if (fieldOp === 'fieldPulse') {
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
  } else if (fieldOp === 'fieldHueFromPhase') {
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
  } else if (fieldOp === 'fieldJitter2D') {
    // ════════════════════════════════════════════════════════════════
    // fieldJitter2D: Alias for jitter2d (same implementation)
    // ────────────────────────────────────────────────────────────────
    // Inputs: [pos: vec2, rand: float, amountX: float, amountY: float]
    // Output: vec2 (stride 2)
    // Domain: rand is arbitrary float seed, amounts are in coordinate units
    // Coord-space: AGNOSTIC - offsets are in same units as input pos
    // Use case: Control points, tangent vectors (NOT instance positions)
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
  } else if (fieldOp === 'fieldGoldenAngle') {
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
  } else if (fieldOp === 'perElementOpacity') {
    // ════════════════════════════════════════════════════════════════
    // perElementOpacity: Apply per-element opacity to color field
    // ────────────────────────────────────────────────────────────────
    // Inputs: [color: rgba, opacity: float]
    // Output: color (rgba) with per-element alpha
    // Domain: opacity clamped to [0,1]
    // Coord-space: N/A - color values are space-independent
    // ════════════════════════════════════════════════════════════════
    if (inputs.length !== 2) {
      throw new Error('perElementOpacity requires exactly 2 inputs (color, opacity)');
    }
    const outArr = out as Uint8ClampedArray;
    const colorArr = inputs[0] as Uint8ClampedArray;
    const opacityArr = inputs[1] as Float32Array;
    for (let i = 0; i < N; i++) {
      const opacity = Math.max(0, Math.min(1, opacityArr[i]));
      outArr[i * 4 + 0] = colorArr[i * 4 + 0];
      outArr[i * 4 + 1] = colorArr[i * 4 + 1];
      outArr[i * 4 + 2] = colorArr[i * 4 + 2];
      outArr[i * 4 + 3] = Math.round(opacity * 255);
    }
  } else if (fieldOp === 'fieldSetZ') {
    // ════════════════════════════════════════════════════════════════
    // fieldSetZ: Set the Z component of a vec3 position field
    // ────────────────────────────────────────────────────────────────
    // Inputs: [pos: vec3 (stride 3), z: float]
    // Output: vec3 (stride 3) with Z replaced
    // Domain: z is arbitrary float (can be negative for below-plane)
    // Coord-space: WORLD - positions are in normalized [0,1] world space
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
  _type: SignalType
): void {
  if (fieldOp === 'applyOpacity') {
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
  } else if (fieldOp === 'hsvToRgb') {
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
  } else if (fieldOp === 'circleLayout') {
    // ════════════════════════════════════════════════════════════════
    // circleLayout: Arrange elements in a circle
    // ────────────────────────────────────────────────────────────────
    // Field input: normalizedIndex (expects [0,1])
    // Signals: [radius: float, phase: float]
    // Output: vec3 (stride 3, z=0.0 explicit)
    // Domain: normalizedIndex in [0,1], phase in [0,1] for full rotation
    // Coord-space: Produces WORLD-SPACE positions centered at (0.5, 0.5, 0.0)
    //   This is one of the few kernels that outputs explicit world coords
    // Formula: angle = 2π*(index+phase), pos = center + radius*(cos,sin,0)
    // C-14 FIX: Clamp index to [0,1] before use
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
      const t_i = Math.max(0, Math.min(1, indexArr[i])); // C-14 FIX: Clamp input
      const angle = TWO_PI * (t_i + phase);
      outArr[i * 3 + 0] = cx + radius * Math.cos(angle);
      outArr[i * 3 + 1] = cy + radius * Math.sin(angle);
      outArr[i * 3 + 2] = 0.0;
    }
  } else if (fieldOp === 'circleAngle') {
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
  } else if (fieldOp === 'polygonVertex') {
    // ════════════════════════════════════════════════════════════════
    // polygonVertex: Generate regular polygon vertices
    // ────────────────────────────────────────────────────────────────
    // Field input: index (integer vertex index)
    // Signals: [sides: float, radiusX: float, radiusY: float]
    // Output: vec2 (stride 2)
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
      // Start at top (angle = -π/2), go clockwise
      const angle = (indexArr[i] / sides) * TWO_PI - Math.PI / 2;
      outArr[i * 2 + 0] = radiusX * Math.cos(angle);
      outArr[i * 2 + 1] = radiusY * Math.sin(angle);
    }
  } else if (fieldOp === 'starVertex') {
    // ════════════════════════════════════════════════════════════════
    // starVertex: Generate star polygon vertices
    // ────────────────────────────────────────────────────────────────
    // Field input: index (integer vertex index)
    // Signals: [points: float, outerRadius: float, innerRadius: float]
    // Output: vec2 (stride 2)
    // Domain: points >= 3 (rounded), radii are shape units
    // Coord-space: Produces LOCAL-SPACE control points centered at (0,0)
    //   Alternates between outer and inner radius
    // ════════════════════════════════════════════════════════════════
    if (sigValues.length !== 3) {
      throw new Error('starVertex requires 3 signals (points, outerRadius, innerRadius)');
    }
    const outArr = out as Float32Array;
    const indexArr = fieldInput as Float32Array;
    const points = Math.max(3, Math.round(sigValues[0]));
    const outerRadius = sigValues[1];
    const innerRadius = sigValues[2];
    const TWO_PI = Math.PI * 2;

    for (let i = 0; i < N; i++) {
      const idx = indexArr[i];
      // Each point has 2 vertices (outer then inner)
      const isOuter = Math.floor(idx) % 2 === 0;
      const radius = isOuter ? outerRadius : innerRadius;
      // Angle step is 1/(2*points) of full circle per vertex
      const angle = (idx / (points * 2)) * TWO_PI - Math.PI / 2;
      outArr[i * 2 + 0] = radius * Math.cos(angle);
      outArr[i * 2 + 1] = radius * Math.sin(angle);
    }
  } else if (fieldOp === 'lineLayout') {
    // ════════════════════════════════════════════════════════════════
    // lineLayout: Arrange elements along a line
    // ────────────────────────────────────────────────────────────────
    // Field input: t (normalizedIndex in [0,1])
    // Signals: [x0: float, y0: float, x1: float, y1: float]
    // Output: vec3 (stride 3, z=0.0 explicit)
    // Domain: t in [0,1] for interpolation
    // Coord-space: Produces WORLD-SPACE positions in [0,1]
    // Formula: lerp from (x0,y0,0) to (x1,y1,0)
    //   x = (1-t)*x0 + t*x1
    //   y = (1-t)*y0 + t*y1
    //   z = 0.0
    // ════════════════════════════════════════════════════════════════
    if (sigValues.length !== 4) {
      throw new Error('lineLayout requires 4 signals (x0, y0, x1, y1)');
    }
    const outArr = out as Float32Array;
    const tArr = fieldInput as Float32Array;
    const x0 = sigValues[0];
    const y0 = sigValues[1];
    const x1 = sigValues[2];
    const y1 = sigValues[3];

    for (let i = 0; i < N; i++) {
      const t = Math.max(0, Math.min(1, tArr[i])); // Clamp to [0,1]
      outArr[i * 3 + 0] = (1 - t) * x0 + t * x1;
      outArr[i * 3 + 1] = (1 - t) * y0 + t * y1;
      outArr[i * 3 + 2] = 0.0;
    }
  } else if (fieldOp === 'gridLayout') {
    // ════════════════════════════════════════════════════════════════
    // gridLayout: Arrange elements in a grid pattern
    // ────────────────────────────────────────────────────────────────
    // Field input: index (integer index 0..N-1)
    // Signals: [cols: float, rows: float]
    // Output: vec3 (stride 3, z=0.0 explicit)
    // Domain: cols >= 1, rows >= 1
    // Coord-space: Produces WORLD-SPACE positions in [0,1]
    // Formula:
    //   col = floor(index) % cols
    //   row = floor(floor(index) / cols)
    //   x = cols > 1 ? col / (cols - 1) : 0.5
    //   y = rows > 1 ? row / (rows - 1) : 0.5
    //   z = 0.0
    // ════════════════════════════════════════════════════════════════
    if (sigValues.length !== 2) {
      throw new Error('gridLayout requires 2 signals (cols, rows)');
    }
    const outArr = out as Float32Array;
    const indexArr = fieldInput as Float32Array;
    const cols = Math.max(1, Math.round(sigValues[0]));
    const rows = Math.max(1, Math.round(sigValues[1]));

    for (let i = 0; i < N; i++) {
      const idx = Math.max(0, Math.floor(indexArr[i]));
      const col = idx % cols;
      const row = Math.floor(idx / cols) % rows; // Wrap rows to prevent out of bounds

      // Normalize to [0,1] - center single column/row at 0.5
      const x = cols > 1 ? col / (cols - 1) : 0.5;
      const y = rows > 1 ? row / (rows - 1) : 0.5;

      outArr[i * 3 + 0] = x;
      outArr[i * 3 + 1] = y;
      outArr[i * 3 + 2] = 0.0;
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
