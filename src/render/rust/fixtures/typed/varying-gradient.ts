/** varying-gradient (typed DSL) — Per-vertex color as varying, GPU-interpolated. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  exact, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { tri } from '../../../gpu-ir/shapes';
import { type Scope, f32, u32, vec4, sin } from '../../../gpu-ir/typed-dsl';

export const varyingGradientSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    tri: { capacity: 1, active: 'sys:active', fields: { _pad: 'f32' } },
  },
  shapes: { big_triangle: tri([0.0, 0.8, -0.8, -0.6, 0.8, -0.6]) },

  roster: [
    compute('setup', exact(1), wg(1), ($: Scope) => [
      $.storeScalar('sys:active', u32(1)),
    ]),
    drawPrep('prep', 'sys:active', 3),
    render('draw', ortho(), clearTarget([0.05, 0.05, 0.07, 1]), [
      draw('gradient_tri', domainSource('tri', 'big_triangle'), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('vid', $.vertexIndex),
          $.let('phase', f32($('vid')).mul(2.094)),
          $.let('vcolor', vec4(
            sin($('phase')).mul(0.5).add(0.5),
            sin($('phase').add(2.094)).mul(0.5).add(0.5),
            sin($('phase').add(4.189)).mul(0.5).add(0.5),
            1.0,
          )),
          $.returnVertex(vec4($('position').x, $('position').y, 0.0, 1.0), { color: $('vcolor') }),
        ],
        fragment: ($: Scope) => [
          $.returnFragment({ color: $('color') }),
        ],
      }),
    ]),
  ],
};

export const varyingGradientTyped: PipelineInstallPayload = gpu(varyingGradientSpec);
