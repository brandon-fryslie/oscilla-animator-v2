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
 * - phase: [0, 1) cyclic - Signal kernels (sin/cos/tan) expect this and convert to radians internally
 * - radians: [0, 2π) - Field kernels (polar, circular layout) work directly in radians
 * - normalized: [0, 1] clamped - Easing functions, opacity, normalizedIndex
 * - scalar: Dimensionless float - Arithmetic results, generic numbers
 * - #: Count/index (integer) - Array indices, element counts
 * - ms: Milliseconds - Time values
 */

import type { NumericUnit } from '../core/canonical-types';

/**
 * Kernel input signature - declares expected unit for an input parameter
 */
export interface KernelInputSignature {
  readonly expectedUnit?: NumericUnit;
  readonly description?: string;
}

/**
 * Kernel output signature - declares unit of output value
 */
export interface KernelOutputSignature {
  readonly unit?: NumericUnit;
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
 * Kernel signature registry
 *
 * Maps kernel name to its unit signature.
 * Only kernels with specific unit requirements/outputs are listed.
 * Kernels not listed have no unit constraints (accept/output any unit).
 */
export const KERNEL_SIGNATURES: Readonly<Record<string, KernelSignature>> = {
  // === TRIGONOMETRIC FUNCTIONS (Signal-level) ===
  // These expect PHASE [0,1) and convert to radians internally

  sin: {
    inputs: [{ expectedUnit: 'phase', description: 'Phase [0,1) - converts to radians internally' }],
    output: { unit: 'scalar', description: 'Sine value [-1,1]' },
  },

  cos: {
    inputs: [{ expectedUnit: 'phase', description: 'Phase [0,1) - converts to radians internally' }],
    output: { unit: 'scalar', description: 'Cosine value [-1,1]' },
  },

  tan: {
    inputs: [{ expectedUnit: 'phase', description: 'Phase [0,1) - converts to radians internally' }],
    output: { unit: 'scalar', description: 'Tangent value' },
  },

  // === WAVEFORM FUNCTIONS (Signal-level) ===
  // These also expect phase [0,1)

  triangle: {
    inputs: [{ expectedUnit: 'phase', description: 'Phase [0,1)' }],
    output: { unit: 'scalar', description: 'Triangle wave [-1,1]' },
  },

  square: {
    inputs: [{ expectedUnit: 'phase', description: 'Phase [0,1)' }],
    output: { unit: 'scalar', description: 'Square wave [-1,1]' },
  },

  sawtooth: {
    inputs: [{ expectedUnit: 'phase', description: 'Phase [0,1)' }],
    output: { unit: 'scalar', description: 'Sawtooth wave [-1,1]' },
  },

  // === FIELD-LEVEL POLAR FUNCTIONS ===
  // These work directly in radians (NOT phase)

  circleAngle: {
    inputs: [
      { expectedUnit: 'normalized', description: 'Normalized index [0,1]' },
      { expectedUnit: 'phase', description: 'Phase offset [0,1)' },
    ],
    output: { unit: 'radians', description: 'Angle in radians [0, 2π)' },
  },

  fieldPolarToCartesian: {
    inputs: [
      { expectedUnit: 'scalar', description: 'Center X' },
      { expectedUnit: 'scalar', description: 'Center Y' },
      { expectedUnit: 'scalar', description: 'Radius' },
      { expectedUnit: 'radians', description: 'Angle in radians' },
    ],
    output: { unit: 'scalar', description: 'Cartesian position (vec2)' },
  },

  fieldAngularOffset: {
    inputs: [
      { expectedUnit: 'normalized', description: 'Normalized index [0,1]' },
      { expectedUnit: 'phase', description: 'Phase [0,1)' },
      { expectedUnit: 'scalar', description: 'Spin multiplier' },
    ],
    output: { unit: 'radians', description: 'Angular offset in radians' },
  },

  fieldGoldenAngle: {
    inputs: [
      { expectedUnit: 'normalized', description: 'Normalized index [0,1]' },
    ],
    output: { unit: 'radians', description: 'Golden angle * turns in radians' },
  },

  // === EASING FUNCTIONS ===
  // Input and output are normalized [0,1]

  easeInQuad: {
    inputs: [{ expectedUnit: 'normalized', description: 'Progress [0,1]' }],
    output: { unit: 'normalized', description: 'Eased value [0,1]' },
  },

  easeOutQuad: {
    inputs: [{ expectedUnit: 'normalized', description: 'Progress [0,1]' }],
    output: { unit: 'normalized', description: 'Eased value [0,1]' },
  },

  easeInOutQuad: {
    inputs: [{ expectedUnit: 'normalized', description: 'Progress [0,1]' }],
    output: { unit: 'normalized', description: 'Eased value [0,1]' },
  },

  easeInCubic: {
    inputs: [{ expectedUnit: 'normalized', description: 'Progress [0,1]' }],
    output: { unit: 'normalized', description: 'Eased value [0,1]' },
  },

  easeOutCubic: {
    inputs: [{ expectedUnit: 'normalized', description: 'Progress [0,1]' }],
    output: { unit: 'normalized', description: 'Eased value [0,1]' },
  },

  easeInOutCubic: {
    inputs: [{ expectedUnit: 'normalized', description: 'Progress [0,1]' }],
    output: { unit: 'normalized', description: 'Eased value [0,1]' },
  },

  easeInElastic: {
    inputs: [{ expectedUnit: 'normalized', description: 'Progress [0,1]' }],
    output: { unit: 'normalized', description: 'Eased value [0,1]' },
  },

  easeOutElastic: {
    inputs: [{ expectedUnit: 'normalized', description: 'Progress [0,1]' }],
    output: { unit: 'normalized', description: 'Eased value [0,1]' },
  },

  easeOutBounce: {
    inputs: [{ expectedUnit: 'normalized', description: 'Progress [0,1]' }],
    output: { unit: 'normalized', description: 'Eased value [0,1]' },
  },

  // === FIELD ANIMATION FUNCTIONS ===

  fieldPulse: {
    inputs: [
      { expectedUnit: 'normalized', description: 'Normalized index [0,1]' },
      { expectedUnit: 'phase', description: 'Phase [0,1)' },
      { expectedUnit: 'scalar', description: 'Base value' },
      { expectedUnit: 'scalar', description: 'Amplitude' },
      { expectedUnit: 'scalar', description: 'Spread' },
    ],
    output: { unit: 'scalar', description: 'Pulsed value' },
  },

  fieldHueFromPhase: {
    inputs: [
      { expectedUnit: 'normalized', description: 'Normalized index [0,1]' },
      { expectedUnit: 'phase', description: 'Phase [0,1)' },
    ],
    output: { unit: 'normalized', description: 'Hue [0,1]' },
  },

  circleLayout: {
    inputs: [
      { expectedUnit: 'normalized', description: 'Normalized index [0,1]' },
      { expectedUnit: 'scalar', description: 'Radius' },
      { expectedUnit: 'phase', description: 'Phase offset [0,1)' },
    ],
    output: { unit: 'scalar', description: 'Position (vec2)' },
  },
};

/**
 * Get kernel signature by name.
 * Returns undefined if kernel has no specific unit constraints.
 */
export function getKernelSignature(kernelName: string): KernelSignature | undefined {
  return KERNEL_SIGNATURES[kernelName];
}

/**
 * Check if a kernel has a signature (i.e., has unit constraints).
 */
export function hasKernelSignature(kernelName: string): boolean {
  return kernelName in KERNEL_SIGNATURES;
}
