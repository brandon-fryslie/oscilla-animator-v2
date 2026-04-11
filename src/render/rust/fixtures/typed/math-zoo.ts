/** math-zoo (typed DSL) — Comprehensive builtins coverage. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec4,
  sin, cos, tan, asin, acos, atan, atan2,
  exp, log, pow, sqrt,
  abs, min, max, clamp, mix, step, smoothstep,
  sign, fract, ceil, floor, round,
} from '../../../gpu-ir/typed-dsl';

export const mathZooSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    dots: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_quad: quad(0.03) },

  roster: [
    compute('eval_math', domain('dots'), wg(64), ($: Scope) => [
      $.let('gid',  $.thread.x),
      $.let('time', $.global('sys:time')),
      $.let('t',    f32($('gid')).div(64.0)),

      // Position in a grid
      $.let('col', $('gid').mod(u32(8))),
      $.let('row', $('gid').div(u32(8))),
      $.storeField('dots:pos_x', $('gid'), f32($('col')).sub(3.5).mul(0.22)),
      $.storeField('dots:pos_y', $('gid'), f32($('row')).sub(3.5).mul(0.22)),

      // Exercise builtins
      $.let('a', tan($('t').mul(0.5)).mul(0.1)),
      $.let('b', exp($('t').mul(0.5).sub(0.25))),
      $.let('c', log($('b').add(1.0))),
      $.let('d', sqrt($('t'))),
      $.let('e', sign(sin($('time').add($('t').mul(6.28))))),
      $.let('f', fract($('t').mul(4.0).add($('time')))),
      $.let('g', ceil($('t').mul(3.0))),
      $.let('h', floor($('t').mul(5.0))),
      $.let('i', round($('t').mul(7.0))),
      $.let('j', pow($('t'), 2.0)),
      $.let('k', atan2(sin($('time')), cos($('time')))),
      $.let('l', min($('t'), 0.5)),
      $.let('m', step(0.5, $('t'))),
      $.let('n', mix(0.2, 0.8, $('t'))),
      $.let('o', asin($('t').mul(0.99))),
      $.let('p', acos($('t').mul(0.99))),
      $.let('q', atan($('t'))),

      // Combine into visible color
      $.storeField('dots:color_r', $('gid'),
        clamp(abs($('a').add($('c')).add($('e')).add($('k'))).mul(0.3), 0.0, 1.0)),
      $.storeField('dots:color_g', $('gid'),
        clamp(abs($('d').add($('f')).add($('j')).add($('n'))).mul(0.5), 0.0, 1.0)),
      $.storeField('dots:color_b', $('gid'),
        clamp(abs($('g').add($('h')).add($('i')).add($('l')).add($('m')).add($('o')).add($('p')).add($('q'))).mul(0.1), 0.0, 1.0)),
    ]),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.05, 0.05, 0.08, 1]), [
      draw('dots_fill', domainSource('dots', 'unit_quad'), OPAQUE, {
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

export const mathZooTyped: PipelineInstallPayload = gpu(mathZooSpec);
