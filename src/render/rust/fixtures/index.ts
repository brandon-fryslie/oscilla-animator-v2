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
import { spirographTrace } from './spirograph-trace';

export interface PayloadFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly payload: PipelineInstallPayload;
  /** GPU-IR DSL source that compiles to this payload. Shown in the DSL editor pane. */
  readonly dslSource?: string;
}

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [
  {
    id: 'hello-triangle',
    name: 'Visible Triangle',
    description: 'Minimal vertical slice: compute pass writes time-varying RGB, draw_prep fills indirect buffer, render pass draws a single colored triangle.',
    payload: helloTriangle,
    dslSource: `gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:tri_active': { u32: 1 } },
  domains: {
    tri: { capacity: 1, active: 'sys:tri_active', fields: {
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_triangle: tri([0.0, 0.5, -0.5, -0.5, 0.5, -0.5]) },

  roster: [
    compute('eval_color', exact(1), wg(1), () => {
      const time = $global.time;
      $domains.tri.color_r[0] = sin(time) * 0.5 + 0.5;
      $domains.tri.color_g[0] = sin(time + 2.094) * 0.5 + 0.5;
      $domains.tri.color_b[0] = sin(time + 4.189) * 0.5 + 0.5;
      $domains.tri.$active = u32(1);
    }),
    drawPrep('prep_tri', 'sys:tri_active', 3),
    render('draw', { clear: [0, 0, 0, 1] }, [
      draw('tri_fill', 'tri', 'unit_triangle', {}, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
        },
        fragment: () => {
          const r = $domains.tri.color_r[0];
          const g = $domains.tri.color_g[0];
          const b = $domains.tri.color_b[0];
          return fragment({ color: vec4(r, g, b, 1.0) });
        },
      }),
    ]),
  ],
})`,
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
  {
    id: 'spirograph-trace',
    name: 'Spirograph Trace',
    description: '600 points tracing a Lissajous figure. rank-as-phase, two oscillators at different frequencies, rainbow color, additive-style blending.',
    payload: spirographTrace,
  },
];
