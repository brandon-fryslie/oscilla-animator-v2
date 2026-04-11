/** for-loop-gradient (typed DSL) — 64 bars with For loop accumulator + custom fragment. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, ALPHA_BLEND,
} from '../../../gpu-ir/compile';
import { tri } from '../../../gpu-ir/shapes';
import { type Scope, f32, u32, vec4, sin, clamp, sub, add, mul } from '../../../gpu-ir/typed-dsl';

export const forLoopGradientSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    bars: { capacity: 64, active: 'sys:active', fields: {
      brightness: 'f32',
      pos_x: 'f32',
      height: 'f32',
    }},
  },
  shapes: {
    bar: tri([
      -0.006, 0.0, 0.006, 0.0, 0.006, 1.0,
      -0.006, 0.0, 0.006, 1.0, -0.006, 1.0,
    ]),
  },

  roster: [
    compute('accumulate', domain('bars'), wg(64), ($: Scope) => [
      $.let('gid',  $.thread.x),
      $.let('time', $.global('sys:time')),
      $.var('acc', 'f32', f32(0.0)),
      $.var('i', 'u32', u32(0)),
      $.for(
        $.let('_noop', u32(0)),
        $('i').lt($('gid').add(u32(1))),
        $.assign($('i'), $('i').add(u32(1))),
        [
          $.assign($('acc'), $('acc').add(
            sin($('time').mul(1.5).add(f32($('i')).mul(0.4))).mul(0.08),
          )),
        ],
      ),
      $.let('b', clamp($('acc').mul(0.5).add(0.5), 0.05, 1.0)),
      $.storeField('bars:brightness', $('gid'), $('b')),
      $.storeField('bars:pos_x', $('gid'), f32($('gid')).div(64.0).mul(1.9).sub(0.95)),
      $.storeField('bars:height', $('gid'), $('b').mul(0.85)),
    ]),
    drawPrep('prep_bars', 'sys:active', 6),
    render('draw_bars', ortho(), clearTarget([0.02, 0.015, 0.04, 1]), [
      draw('bars_fill', domainSource('bars', 'bar'), ALPHA_BLEND, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px', $.field('bars:pos_x', $('iid'))),
          $.let('b',  $.field('bars:brightness', $('iid'))),
          $.let('h',  $.field('bars:height', $('iid'))),
          $.let('y', $('position').y.mul($('h')).sub(0.8)),
          $.returnVertex(
            vec4($('position').x.add($('px')), $('y'), 0.0, 1.0),
            { data: vec4($('b'), $('position').y, 0.0, 0.0) },
          ),
        ],
        fragment: ($: Scope) => [
          $.let('b', $('data').x),
          $.let('v', $('data').y),
          $.let('r',  $('b').mul(sub(0.9, $('v').mul(0.5)))),
          $.let('g',  $('b').mul(add(0.3, $('v').mul(0.7)))),
          $.let('bl', $('b').mul($('v')).mul(0.6)),
          $.let('a',  add(0.7, mul(0.3, $('b')))),
          $.returnFragment({ color: vec4($('r'), $('g'), $('bl'), $('a')) }),
        ],
      }),
    ]),
  ],
};

export const forLoopGradientTyped: PipelineInstallPayload = gpu(forLoopGradientSpec);
