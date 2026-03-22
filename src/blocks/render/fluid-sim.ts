/**
 * FluidSim Block
 *
 * Eulerian fluid dynamics via DispatchKernel instructions and Texture2D resources.
 *
 * Emits a sequence of compute kernel dispatches (Advect, Jacobi pressure solve,
 * Divergence, Gradient subtraction) operating on Texture2D velocity/pressure fields.
 *
 * FORBIDDEN: NO 1D array flattened fluid simulations.
 * Must use Texture2D for 120fps hardware filtering.
 *
 * [LAW:one-source-of-truth] The block's lower() is the single authority for
 * fluid sim resource declarations and kernel dispatch ordering.
 */

import { registerBlock } from '../registry';
import { unitNone, canonicalScalar, FLOAT, VEC2 } from '../../core/canonical-types';
import { inferType } from '../../core/inference-types';
import { defaultSourceConst } from '../../types';
import type { MemoryResourceIR, Texture2DFormat } from '../../compiler/ir/program';
import type { DispatchKernelInstruction } from '../../compiler/ir/naga-emitter/ScheduleNagaLowering';

/** Default grid resolution for the fluid simulation. */
const DEFAULT_GRID_SIZE = 256;

/** Default Jacobi iteration count for pressure solve. */
const DEFAULT_JACOBI_ITERATIONS = 20;

/** Texture format for velocity (2-component: vx, vy). */
const VELOCITY_FORMAT: Texture2DFormat = 'rg32float';

/** Texture format for pressure/divergence (1-component scalar). */
const SCALAR_FORMAT: Texture2DFormat = 'r32float';

/**
 * Build the Texture2D memory resources for the fluid simulation.
 *
 * [LAW:one-source-of-truth] Resource IDs defined here are the symbolic
 * identifiers consumed by DispatchKernel arguments.
 */
function buildFluidResources(
  blockId: string,
  gridSize: number,
): readonly MemoryResourceIR[] {
  const prefix = `fluid:${blockId}`;
  const base = {
    cardinality: gridSize * gridSize,
    packing: 'soa' as const,
    updateClass: 'FrameTime' as const,
    resourceKind: 'texture2d' as const,
    textureWidth: gridSize,
    textureHeight: gridSize,
  };
  // [LAW:one-source-of-truth] Canonical type for texture resources.
  // The CanonicalType here is metadata for the manifest; actual GPU format is textureFormat.
  const vec2Type = canonicalScalar(VEC2, unitNone());
  const scalarType = canonicalScalar(FLOAT, unitNone());

  return [
    { ...base, id: `${prefix}:velocity`, type: vec2Type, textureFormat: VELOCITY_FORMAT, label: 'Fluid Velocity Field' },
    { ...base, id: `${prefix}:velocity_temp`, type: vec2Type, textureFormat: VELOCITY_FORMAT, label: 'Fluid Velocity Temp' },
    { ...base, id: `${prefix}:pressure`, type: scalarType, textureFormat: SCALAR_FORMAT, label: 'Fluid Pressure Field' },
    { ...base, id: `${prefix}:pressure_temp`, type: scalarType, textureFormat: SCALAR_FORMAT, label: 'Fluid Pressure Temp' },
    { ...base, id: `${prefix}:divergence`, type: scalarType, textureFormat: SCALAR_FORMAT, label: 'Fluid Divergence Field' },
  ];
}

/**
 * Build the ordered DispatchKernel instructions for one fluid simulation step.
 *
 * The sequence implements a standard Eulerian incompressible fluid solver:
 *   1. Advect velocity through itself (semi-Lagrangian)
 *   2. Compute divergence of advected velocity
 *   3. Jacobi iteration to solve pressure Poisson equation
 *   4. Gradient subtraction to make velocity divergence-free
 *
 * FORBIDDEN: DispatchKernel must NEVER generate inline WGSL — it triggers
 * pre-compiled pipelines only.
 */
function buildFluidDispatchInstructions(
  blockId: string,
  jacobiIterations: number,
): readonly DispatchKernelInstruction[] {
  const prefix = `fluid:${blockId}`;
  const instructions: DispatchKernelInstruction[] = [];

  // Step 1: Advect velocity
  instructions.push({
    op: 'DispatchKernel',
    kernelId: 'fluid_advect',
    arguments: {
      velocity_in: `${prefix}:velocity`,
      velocity_out: `${prefix}:velocity_temp`,
    },
  });

  // Step 2: Compute divergence of advected velocity
  instructions.push({
    op: 'DispatchKernel',
    kernelId: 'fluid_divergence',
    arguments: {
      velocity_in: `${prefix}:velocity_temp`,
      divergence_out: `${prefix}:divergence`,
    },
  });

  // Step 3: Jacobi pressure solve (ping-pong between pressure/pressure_temp)
  for (let i = 0; i < jacobiIterations; i++) {
    const readField = i % 2 === 0 ? `${prefix}:pressure` : `${prefix}:pressure_temp`;
    const writeField = i % 2 === 0 ? `${prefix}:pressure_temp` : `${prefix}:pressure`;
    instructions.push({
      op: 'DispatchKernel',
      kernelId: 'fluid_jacobi',
      arguments: {
        pressure_in: readField,
        divergence_in: `${prefix}:divergence`,
        pressure_out: writeField,
      },
    });
  }

  // After Jacobi iterations, pressure result is in:
  //   even iterations → pressure_temp; odd iterations → pressure
  const finalPressure = jacobiIterations % 2 === 0
    ? `${prefix}:pressure`
    : `${prefix}:pressure_temp`;

  // Step 4: Gradient subtraction (project velocity to be divergence-free)
  instructions.push({
    op: 'DispatchKernel',
    kernelId: 'fluid_gradient_subtract',
    arguments: {
      velocity_in: `${prefix}:velocity_temp`,
      pressure_in: finalPressure,
      velocity_out: `${prefix}:velocity`,
    },
  });

  return instructions;
}

export function register(): void {
  registerBlock({
    type: 'FluidSim',
    label: 'Fluid Simulation',
    category: 'render',
    description: 'Eulerian fluid dynamics via GPU compute kernels operating on Texture2D fields.',
    form: 'primitive',
    capability: 'render',
    loweringPurity: 'impure',
    inputs: {
      gridSize: {
        label: 'Grid Size',
        type: inferType(FLOAT, unitNone()),
        defaultValue: DEFAULT_GRID_SIZE,
        defaultSource: defaultSourceConst(DEFAULT_GRID_SIZE),
        uiHint: { kind: 'slider', min: 64, max: 1024, step: 64 },
      },
      jacobiIterations: {
        label: 'Jacobi Iterations',
        type: inferType(FLOAT, unitNone()),
        defaultValue: DEFAULT_JACOBI_ITERATIONS,
        defaultSource: defaultSourceConst(DEFAULT_JACOBI_ITERATIONS),
        uiHint: { kind: 'slider', min: 1, max: 80, step: 1 },
      },
    },
    outputs: {},
    lower: ({ ctx }) => {
      // [LAW:dataflow-not-control-flow] Grid size and iteration count are
      // compile-time constants — variability is in the resource dimensions
      // and instruction count, not in whether operations execute.
      const gridSize = DEFAULT_GRID_SIZE;
      const jacobiIterations = DEFAULT_JACOBI_ITERATIONS;

      const memoryResources = buildFluidResources(ctx.instanceId, gridSize);
      const dispatchInstructions = buildFluidDispatchInstructions(
        ctx.instanceId,
        jacobiIterations,
      );

      return {
        outputsById: {},
        effects: {
          memoryResources,
          dispatchInstructions,
        },
      };
    },
  });
}
