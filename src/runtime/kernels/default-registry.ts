/**
 * ══════════════════════════════════════════════════════════════════════
 * DEFAULT KERNEL REGISTRY
 * ══════════════════════════════════════════════════════════════════════
 *
 * Creates and populates the default kernel registry with fundamental kernels.
 *
 * Registered kernels (Phase C):
 * - noise3: 3D simplex noise (ScalarKernel)
 * - hsvToRgb: HSV to RGBA conversion (LaneKernel, stride 4)
 *
 * Future additions (per kernel audit):
 * - Layout kernels (circleLayout, lineLayout, gridLayout, UV variants) - transitional
 * - 3D layout kernels (if used) - transitional
 *
 * All other operations use opcodes or composite blocks.
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import { KernelRegistry, kernelId } from '../KernelRegistry';
import { noise3 } from './noise3';
import { hsvToRgb } from './hsv-to-rgb';

/**
 * Create and populate the default kernel registry.
 *
 * This is called once at program load time (not per-frame).
 * The returned registry is stored in the compiled program object.
 */
export function createDefaultRegistry(): KernelRegistry {
  const registry = new KernelRegistry();

  // Register noise3 (ScalarKernel: 4 args → scalar)
  registry.registerScalar(
    kernelId('noise3'),
    noise3,
    {
      argCount: 4, // px, py, pz, seed
      purity: 'pure',
      guaranteesFiniteForFiniteInputs: true,
      range: { min: -1, max: 1 }, // Approximate range for simplex noise
    }
  );

  // Register hsvToRgb (LaneKernel: 3 args → 4 components)
  registry.registerLane(
    kernelId('hsvToRgb'),
    hsvToRgb,
    {
      argCount: 3, // h, s, v
      purity: 'pure',
      guaranteesFiniteForFiniteInputs: true,
      outStride: 4, // r, g, b, a
      range: { min: 0, max: 1 }, // All output channels in [0, 1]
    }
  );

  return registry;
}
