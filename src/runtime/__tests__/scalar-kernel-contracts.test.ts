/**
 * ══════════════════════════════════════════════════════════════════════
 * SCALAR KERNEL CONTRACT TESTS
 * ══════════════════════════════════════════════════════════════════════
 *
 * All named scalar kernels (oscillators, easing, shaping, combine,
 * extraction, construction) have been removed. This test file verifies
 * that removed kernels throw as expected.
 */

import { describe, it, expect } from 'vitest';

// Import from shared ScalarKernelLibrary (single source of truth)
import { testApplyScalarKernel } from '../ScalarKernelLibrary';

describe('Scalar Kernel Contract Tests', () => {
  it('removed kernels throw "Unknown scalar kernel"', () => {
    const removedKernels = [
      'oscSin', 'oscCos', 'oscTan',
      'triangle', 'square', 'sawtooth',
      'smoothstep', 'step',
      'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
      'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
      'easeInElastic', 'easeOutElastic', 'easeOutBounce',
      'noise',
      'average', 'last', 'max', 'min',
      'combine_sum', 'combine_average', 'combine_max', 'combine_min', 'combine_last',
      'vec3ExtractX', 'vec3ExtractY', 'vec3ExtractZ',
      'colorExtractR', 'colorExtractG', 'colorExtractB', 'colorExtractA',
      'makeVec2Sig', 'makeVec3Sig', 'makeColorSig',
      'polarToCartesian', 'offsetPosition', 'circleLayout', 'circleAngle',
    ];

    for (const name of removedKernels) {
      expect(() => testApplyScalarKernel(name, [0])).toThrow(/Unknown scalar kernel/);
    }
  });
});
