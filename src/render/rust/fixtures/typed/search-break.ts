/** search-break (typed DSL) — For+If+Break (early exit), Continue, BinaryOp(<=, >). */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import { type Scope, f32, u32, vec4, sin } from '../../../gpu-ir/typed-dsl';

export const searchBreakSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 32 } },
  domains: {
    bars: { capacity: 32, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_quad: quad(0.03) },

  roster: [
    compute('eval_search', domain('bars'), wg(32), ($: Scope) => [
      $.let('gid',  $.thread.x),
      $.let('time', $.global('sys:time')),
      $.storeField('bars:pos_x', $('gid'), f32($('gid')).mul(0.0625).sub(0.96875)),
      $.storeField('bars:pos_y', $('gid'), f32(0.0)),

      $.var('brightness', 'f32', f32(0.1)),

      $.for(
        $.var('i', 'u32', u32(0)),
        $('i').le(u32(15)),
        $.assign($('i'), $('i').add(u32(1))),
        [
          $.let('sample', sin($('time').add(f32($('i')).mul(0.3)).add(f32($('gid')).mul(0.1)))),
          $.if($('sample').le(0.0), [
            $.continue(),
          ]),
          $.if($('sample').gt(0.8), [
            $.assign($('brightness'), f32($('i')).div(15.0)),
            $.break(),
          ]),
        ],
      ),

      $.storeField('bars:color_r', $('gid'), $('brightness')),
      $.storeField('bars:color_g', $('gid'), $('brightness').mul(0.5)),
      $.storeField('bars:color_b', $('gid'), $('brightness').mul(0.2)),
    ]),
    drawPrep('prep_bars', 'sys:active', 6),
    render('draw_bars', ortho(), clearTarget([0.02, 0.02, 0.05, 1]), [
      draw('bars_fill', domainSource('bars', 'unit_quad'), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px', $.field('bars:pos_x', $('iid'))),
          $.let('py', $.field('bars:pos_y', $('iid'))),
          $.let('cr', $.field('bars:color_r', $('iid'))),
          $.let('cg', $.field('bars:color_g', $('iid'))),
          $.let('cb', $.field('bars:color_b', $('iid'))),
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

export const searchBreakTyped: PipelineInstallPayload = gpu(searchBreakSpec);
