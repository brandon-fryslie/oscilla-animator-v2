/** sdf-circle (typed DSL) — Anti-aliased SDF circle with fragment derivatives. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  exact, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { tri } from '../../../gpu-ir/shapes';
import {
  type Scope, u32, vec2, vec4, lit,
  length, dpdx, dpdy, fwidth, max, abs, smoothstep,
  add, sub, mul,
} from '../../../gpu-ir/typed-dsl';

export const sdfCircleSpec: GpuSpec = {
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    tri: { capacity: 1, active: 'sys:active', fields: { _pad: 'f32' } },
  },
  shapes: { fullscreen_triangle: tri([-1.0, -1.0, 3.0, -1.0, -1.0, 3.0]) },

  roster: [
    compute('set_active', exact(1), wg(1), ($: Scope) => [
      $.storeScalar('sys:active', u32(1)),
    ]),
    drawPrep('prep', 'sys:active', 3),
    render('draw', ortho(), clearTarget([0.02, 0.02, 0.03, 1.0]), [
      draw('sdf_circle', domainSource('tri', 'fullscreen_triangle'), OPAQUE, {
        vertex: ($: Scope) => [
          $.returnVertex(
            vec4($('position').x, $('position').y, 0.0, 1.0),
            { uv: vec4(
              $('position').x.mul(0.5).add(0.5),
              sub(1.0, $('position').y.mul(0.5).add(0.5)),
              0.0, 0.0,
            ) },
          ),
        ],
        fragment: ($: Scope) => [
          $.let('centered', vec2($('uv').x.sub(0.5), $('uv').y.sub(0.5))),
          $.let('distance_to_edge', length($('centered')).sub(0.3)),
          $.let('grad_x', dpdx($('distance_to_edge'))),
          $.let('grad_y', dpdy($('distance_to_edge'))),
          $.let('width_auto', fwidth($('distance_to_edge'))),
          $.let('width_manual', max(abs($('grad_x')), abs($('grad_y')))),
          $.let('aa_width', max(max($('width_auto'), $('width_manual')), 0.0008)),
          $.let('coverage', sub(1.0, smoothstep($('aa_width').neg(), $('aa_width'), $('distance_to_edge')))),
          $.returnFragment({
            color: vec4(
              add(0.1, mul($('coverage'), 0.85)),
              add(0.2, mul($('coverage'), 0.55)),
              add(0.35, mul($('coverage'), 0.35)),
              1.0,
            ),
          }),
        ],
      }),
    ]),
  ],
};

export const sdfCircleTyped: PipelineInstallPayload = gpu(sdfCircleSpec);
