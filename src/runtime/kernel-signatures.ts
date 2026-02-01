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
 * - phase: [0, 1) cyclic
 * - radians: [0, 2π)
 * - normalized: [0, 1] clamped
 * - scalar: Dimensionless float
 * - #: Count/index (integer)
 * - ms: Milliseconds
 */

import type { UnitType } from '../core/canonical-types';
import { unitCount } from '../core/canonical-types';

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
 *
 * Note: Oscillator, waveform, and coordinate transform signatures have been
 * removed along with their kernel implementations.
 */
export const KERNEL_SIGNATURES: Readonly<Record<string, KernelSignature>> = {
  // === INDEX/NORMALIZATION ===

  normalizedIndex: {
    inputs: [{ expectedUnit: unitCount(), description: 'Element count (integer)' }],
    output: { description: 'Index normalized to [0,1]' },
  },
};
