/**
 * Payload Tester Fixtures — Registry
 *
 * [LAW:one-source-of-truth] Each fixture is a complete PipelineInstallPayload
 * in its own file. This index collects them into the ordered fixture array.
 */

import type { PipelineInstallPayload } from '../boundary-contract';
import { helloTriangle } from './hello-triangle';
import { instancedWrite } from './instanced-write';
import { forLoopGradient } from './for-loop-gradient';
import { hashColor } from './hash-color';
import { varyingGradient } from './varying-gradient';
import { textureReadwrite } from './texture-readwrite';
import { sdfCircle } from './sdf-circle';
import { atomicBoids } from './atomic-boids';

export interface PayloadFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly payload: PipelineInstallPayload;
}

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [
  {
    id: 'hello-triangle',
    name: 'Visible Triangle',
    description: 'Minimal vertical slice: compute pass writes time-varying RGB, draw_prep fills indirect buffer, render pass draws a single colored triangle.',
    payload: helloTriangle,
  },
  {
    id: 'instanced-write',
    name: 'Instanced Ring',
    description: 'Gate 1: 64 instances placed in a ring via parallel compute (global_invocation_id). Tests domain dispatch, Cast, and instanced draw_indirect.',
    payload: instancedWrite,
  },
  {
    id: 'for-loop-gradient',
    name: 'Loop Gradient',
    description: 'Gate 2: 32 bars with brightness from a For loop accumulator. Tests Var, Assign, For, control flow.',
    payload: forLoopGradient,
  },
  {
    id: 'hash-color',
    name: 'Hash Colors',
    description: 'Gate 3: 64 instances in 8x8 grid with PCG-hash-derived colors. Tests bitwise XOR, shift, AND, multiply.',
    payload: hashColor,
  },
  {
    id: 'varying-gradient',
    name: 'Gradient Triangle',
    description: 'Gate 5: Per-vertex color passed as varying, GPU-interpolated across triangle face. Tests vertex→fragment data passing.',
    payload: varyingGradient,
  },
  {
    id: 'texture-readwrite',
    name: 'Texture Pattern',
    description: 'Gate 6+7: Compute writes animated gradient to storage texture, render reads via TextureLoad. Tests texture allocation, TextureStore, TextureLoad.',
    payload: textureReadwrite,
  },
  {
    id: 'sdf-circle',
    name: 'SDF Circle',
    description: 'Gate 8: Anti-aliased signed distance circle. Tests fragment-stage dpdx, dpdy, and fwidth derivatives.',
    payload: sdfCircle,
  },
  {
    id: 'atomic-boids',
    name: 'Atomic Boids',
    description: 'Gate 9: 10,000 boids with atomic<u32> grid_cell. Forces MMU to bifurcate standard + atomic fields into separate GPU buffers. Tests AtomicOpField, AtomicLoadField.',
    payload: atomicBoids,
  },
];
