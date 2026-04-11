/**
 * simplex-noise (typed DSL) — 10000 dots colored/displaced by noise_simplex_2d.
 * Grid layout, noise-driven displacement and rainbow coloring.
 */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, OPAQUE, TAU,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec2, vec4,
  sin, noise_simplex_2d,
} from '../../../gpu-ir/typed-dsl';

export const simplexNoiseSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 10000 } },
  domains: {
    dots: { capacity: 10000, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { dot: quad(0.012) },

  roster: [
    compute('sim', domain('dots'), wg(256), ($: Scope) => [
      $.let('gid', $.thread.x),
      $.let('time', $.global('sys:time')),

      // Grid layout: 100 x 100
      $.let('col', f32($('gid').mod(u32(100)))),
      $.let('row', f32($('gid').div(u32(100)))),
      $.let('x', $('col').div(50.0).sub(1.0)),
      $.let('y', $('row').div(50.0).sub(1.0)),

      // Noise-driven displacement
      $.let('n', noise_simplex_2d(vec2($('x').mul(3.0).add($('time').mul(0.5)), $('y').mul(3.0)))),
      $.let('n2', noise_simplex_2d(vec2($('y').mul(4.0).sub($('time').mul(0.3)), $('x').mul(4.0)))),

      $.storeField('dots:pos_x', $('gid'), $('x').add($('n').mul(0.08))),
      $.storeField('dots:pos_y', $('gid'), $('y').add($('n2').mul(0.08))),

      // Color from noise — rainbow via hue
      $.let('hue', $('n').mul(0.5).add(0.5)),
      $.storeField('dots:color_r', $('gid'), sin($('hue').mul(TAU)).mul(0.5).add(0.5)),
      $.storeField('dots:color_g', $('gid'), sin($('hue').mul(TAU).add(TAU / 3)).mul(0.5).add(0.5)),
      $.storeField('dots:color_b', $('gid'), sin($('hue').mul(TAU).add(TAU * 2 / 3)).mul(0.5).add(0.5)),
    ]),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.02, 0.02, 0.04, 1]), [
      draw('dots_fill', domainSource('dots', 'dot'), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px', $.field('dots:pos_x', $('iid'))),
          $.let('py', $.field('dots:pos_y', $('iid'))),
          $.let('cr', $.field('dots:color_r', $('iid'))),
          $.let('cg', $.field('dots:color_g', $('iid'))),
          $.let('cb', $.field('dots:color_b', $('iid'))),
          $.returnVertex(
            vec4($('position').x.add($('px')), $('position').y.add($('py')), 0.0, 1.0),
            { color: vec4($('cr'), $('cg'), $('cb'), 1.0) },
          ),
        ],
        fragment: ($: Scope) => [
          $.returnFragment({ color: $('color') }),
        ],
      }),
    ]),
  ],
};

export const simplexNoiseTyped: PipelineInstallPayload = gpu(simplexNoiseSpec);
