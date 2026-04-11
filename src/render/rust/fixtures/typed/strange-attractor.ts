/** strange-attractor (typed DSL) — 4000-point Clifford attractor with slow rotation and twinkling. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, ALPHA_BLEND, TAU,
} from '../../../gpu-ir/compile';
import {
  type Scope, f32, u32, vec4, sin, cos, fract,
} from '../../../gpu-ir/typed-dsl';

const N = 4000;
const TAU_OVER_3 = TAU / 3;

export const strangeAttractorSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: N } },
  domains: {
    pts: { capacity: N, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      next_x: 'f32', next_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: {
    segment: {
      topology: 'line-list',
      vertexLayout: {
        stride: 8,
        attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
      },
      vertexData: [0.0, 0.0, 1.0, 0.0],
    },
  },

  roster: [
    compute('iterate_attractor', domain('pts'), wg(256), ($: Scope) => [
      $.let('gid',  $.thread.x),
      $.let('time', $.global('sys:time')),
      $.let('rank', f32($('gid')).div(N)),

      // Clifford attractor constants
      $.let('A', f32(-1.4)),
      $.let('B', f32(1.6)),
      $.let('C', f32(1.0)),
      $.let('D', f32(0.7)),

      // Fixed seed — NO time dependency in attractor math
      $.var('x', 'f32', sin($('rank').mul(137.5).add(0.1))),
      $.var('y', 'f32', cos($('rank').mul(97.3).add(0.2))),

      // Burn-in: 200 iterations
      $.var('i', 'u32', u32(0)),
      $.for(
        $.let('_noop', u32(0)),
        $('i').lt(u32(200)),
        $.assign($('i'), $('i').add(u32(1))),
        [
          $.let('xn', sin($('A').mul($('y'))).add($('C').mul(cos($('A').mul($('x')))))),
          $.let('yn', sin($('B').mul($('x'))).add($('D').mul(cos($('B').mul($('y')))))),
          $.assign($('x'), $('xn')),
          $.assign($('y'), $('yn')),
        ],
      ),

      // Store positions (unscaled — rotation applied in vertex shader)
      $.storeField('pts:pos_x', $('gid'), $('x')),
      $.storeField('pts:pos_y', $('gid'), $('y')),

      // One more iteration for next position (line endpoint)
      $.let('nx', sin($('A').mul($('y'))).add($('C').mul(cos($('A').mul($('x')))))),
      $.let('ny', sin($('B').mul($('x'))).add($('D').mul(cos($('B').mul($('y')))))),
      $.storeField('pts:next_x', $('gid'), $('nx')),
      $.storeField('pts:next_y', $('gid'), $('ny')),

      // Lifecycle twinkle: staggered per-point fade
      $.let('life', fract($('rank').mul(5).add($('time').mul(0.0003)))),
      $.let('fade', f32(1).sub($('life').mul($('life')))),

      // Color: rainbow along rank, very slow hue rotation
      $.let('hue', $('rank').add($('time').mul(0.00002))),
      $.storeField('pts:color_r', $('gid'), sin($('hue').mul(TAU)).mul(0.4).add(0.5).mul($('fade'))),
      $.storeField('pts:color_g', $('gid'), sin($('hue').mul(TAU).add(TAU_OVER_3)).mul(0.4).add(0.5).mul($('fade'))),
      $.storeField('pts:color_b', $('gid'), sin($('hue').mul(TAU).add(TAU_OVER_3 * 2)).mul(0.4).add(0.5).mul($('fade'))),
      $.storeField('pts:color_a', $('gid'), $('fade').mul(0.25)),
    ]),
    drawPrep('prep', 'sys:active', 2),
    render('draw', ortho(), clearTarget([0.008, 0.005, 0.018, 1]), [
      draw('pts_fill', domainSource('pts', 'segment'), ALPHA_BLEND, {
        vertex: ($: Scope) => [
          $.let('iid',  $.instance.index),
          $.let('time', $.global('sys:time')),
          $.let('t', $('position').x),
          $.let('x0', $.field('pts:pos_x', $('iid'))),
          $.let('y0', $.field('pts:pos_y', $('iid'))),
          $.let('x1', $.field('pts:next_x', $('iid'))),
          $.let('y1', $.field('pts:next_y', $('iid'))),
          // Interpolate between current and next position, scale to fit
          $.let('ax', $('x0').mul(f32(1).sub($('t'))).add($('x1').mul($('t'))).mul(0.45)),
          $.let('ay', $('y0').mul(f32(1).sub($('t'))).add($('y1').mul($('t'))).mul(0.45)),
          // Slow global rotation
          $.let('angle', $('time').mul(0.00005)),
          $.let('c', cos($('angle'))),
          $.let('s', sin($('angle'))),
          $.let('px', $('ax').mul($('c')).sub($('ay').mul($('s')))),
          $.let('py', $('ax').mul($('s')).add($('ay').mul($('c')))),
          $.let('cr', $.field('pts:color_r', $('iid'))),
          $.let('cg', $.field('pts:color_g', $('iid'))),
          $.let('cb', $.field('pts:color_b', $('iid'))),
          $.let('ca', $.field('pts:color_a', $('iid'))),
          $.returnVertex(
            vec4($('px'), $('py'), 0.0, 1.0),
            { color: vec4($('cr'), $('cg'), $('cb'), $('ca')) },
          ),
        ],
        fragment: ($: Scope) => [
          $.returnFragment({ color: $('color') }),
        ],
      }),
    ]),
  ],
};

export const strangeAttractorTyped: PipelineInstallPayload = gpu(strangeAttractorSpec);
