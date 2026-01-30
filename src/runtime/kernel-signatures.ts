/**
 * Kernel Signatures
 *
 * Declares unit expectations for kernel functions used in signal and field evaluation.
 * This enables compile-time validation of unit compatibility.
 *
 * IMPORTANT: These signatures are for DOCUMENTATION and VALIDATION only.
 * They do NOT affect runtime behavior. Kernels still operate as they always have.
 *
 * Unit System Semantics:
 * - phase: [0, 1) cyclic - Signal kernels (oscSin/oscCos/oscTan) expect this and convert to radians internally
 * - radians: [0, 2π) - Field kernels (polar, circular layout) work directly in radians
 * - normalized: [0, 1] clamped - Easing functions, opacity, normalizedIndex
 * - scalar: Dimensionless float - Arithmetic results, generic numbers
 * - #: Count/index (integer) - Array indices, element counts
 * - ms: Milliseconds - Time values
 */

import type { UnitType } from '../core/canonical-types';
import { unitPhase01, unitScalar, unitRadians, unitCount } from '../core/canonical-types';

/**
 * Kernel input signature - declares expected unit for an input parameter
 * Updated for #18: uses full UnitType instead of just kind string
 */
export interface KernelInputSignature {
  readonly expectedUnit?: UnitType;
  readonly description?: string;
}

/**
 * Kernel output signature - declares unit of output value
 * Updated for #18: uses full UnitType instead of just kind string
 */
export interface KernelOutputSignature {
  readonly unit?: UnitType;
  readonly description?: string;
}

/**
 * Complete kernel signature - inputs and output with unit annotations
 */
export interface KernelSignature {
  readonly inputs: readonly KernelInputSignature[];
  readonly output: KernelOutputSignature;
}

/**
 * Kernel signature database.
 *
 * Format:
 * - inputs: array of input parameter signatures (in order)
 * - output: output value signature
 *
 * Kernels not listed have no unit constraints (accept/output any unit).
 */
export const KERNEL_SIGNATURES: Readonly<Record<string, KernelSignature>> = {
  // === OSCILLATOR FUNCTIONS (Signal-level) ===
  // These expect PHASE [0,1), auto-wrap internally, output [-1,1]

  oscSin: {
    inputs: [{ expectedUnit: unitPhase01(), description: 'Phase [0,1) - wraps internally' }],
    output: { unit: unitScalar(), description: 'Sine value [-1,1]' },
  },

  oscCos: {
    inputs: [{ expectedUnit: unitPhase01(), description: 'Phase [0,1) - wraps internally' }],
    output: { unit: unitScalar(), description: 'Cosine value [-1,1]' },
  },

  oscTan: {
    inputs: [{ expectedUnit: unitPhase01(), description: 'Phase [0,1) - wraps internally' }],
    output: { unit: unitScalar(), description: 'Tangent value (unbounded)' },
  },


  // === WAVEFORM FUNCTIONS (Signal-level) ===
  // These expect phase [0,1), auto-wrap internally, output [-1,1]

  triangle: {
    inputs: [{ expectedUnit: unitPhase01(), description: 'Phase [0,1) - wraps internally' }],
    output: { unit: unitScalar(), description: 'Triangle wave [-1,1]' },
  },

  square: {
    inputs: [{ expectedUnit: unitPhase01(), description: 'Phase [0,1) - wraps internally' }],
    output: { unit: unitScalar(), description: 'Square wave [-1,1]' },
  },

  sawtooth: {
    inputs: [{ expectedUnit: unitPhase01(), description: 'Phase [0,1) - wraps internally' }],
    output: { unit: unitScalar(), description: 'Sawtooth wave [-1,1]' },
  },

  pulse: {
    inputs: [
      { expectedUnit: unitPhase01(), description: 'Phase [0,1) - wraps internally' },
      { expectedUnit: unitScalar(), description: 'Duty cycle [0,1] - clamped' },
    ],
    output: { unit: unitScalar(), description: 'Pulse wave [-1,1]' },
  },


  // === COORDINATE TRANSFORMS (Field-level) ===

  polarR: {
    inputs: [], // No unit constraints - operates on vec2 positions
    output: { description: 'Radial distance (scalar)' },
  },

  polarTheta: {
    inputs: [], // No unit constraints - operates on vec2 positions
    output: { unit: unitRadians(), description: 'Angle in radians [0, 2π)' },
  },


  // === INDEX/NORMALIZATION ===

  // These provide normalized access to array indices

  normalizedIndex: {
    inputs: [{ expectedUnit: unitCount(), description: 'Element count (integer)' }],
    output: { description: 'Index normalized to [0,1]' },
  },
};
