/**
 * ══════════════════════════════════════════════════════════════════════
 * SIGNAL KERNEL CONTRACT TESTS
 * ══════════════════════════════════════════════════════════════════════
 *
 * All named signal kernels (oscillators, easing, shaping, combine,
 * extraction, construction) have been removed. This test file verifies
 * that removed kernels throw as expected.
 */

import { describe, it, expect } from 'vitest';

// Import from shared SignalKernelLibrary (single source of truth)
import { testApplySignalKernel } from '../SignalKernelLibrary';

describe('Signal Kernel Contract Tests', () => {
  it('removed kernels throw "Unknown signal kernel"', () => {
    const removedKernels = [
      'oscSin', 'oscCos', 'oscTan',
      'triangle', 'square', 'sawtooth',
      'smoothstep', 'step',
      'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
      'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
      'easeInElastic', 'easeOutElastic', 'easeOutBounce',
      'noise',
      'combine_sum', 'combine_average', 'combine_max', 'combine_min', 'combine_last',
      'vec3ExtractX', 'vec3ExtractY', 'vec3ExtractZ',
      'colorExtractR', 'colorExtractG', 'colorExtractB', 'colorExtractA',
      'makeVec2Sig', 'makeVec3Sig', 'makeColorSig',
      'polarToCartesian', 'offsetPosition', 'circleLayout', 'circleAngle',
    ];

    for (const name of removedKernels) {
      expect(() => testApplySignalKernel(name, [0])).toThrow(/Unknown signal kernel/);
    }
  });
});
