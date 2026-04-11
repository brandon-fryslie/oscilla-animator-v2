/** conditional-ring (typed DSL) — If, Var, Assign, LiteralBool, comparison/logical ops. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import { type Scope, f32, u32, vec4, sin, cos, litBool } from '../../../gpu-ir/typed-dsl';

export const conditionalRingSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    dots: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: { f32: 1 }, color_g: { f32: 1 }, color_b: { f32: 1 },
    }},
  },
  shapes: { unit_quad: quad(0.03) },

  roster: [
    compute('eval_conditional', domain('dots'), wg(64), ($: Scope) => [
      $.let('gid',   $.thread.x),
      $.let('time',  $.global('sys:time')),
      $.let('angle', f32($('gid')).mul(0.09817477042468103).add($('time'))),
      $.storeField('dots:pos_x', $('gid'), cos($('angle')).mul(0.7)),
      $.storeField('dots:pos_y', $('gid'), sin($('angle')).mul(0.7)),

      $.var('highlight', 'bool', litBool(true)),
      $.let('isEven',    $('gid').mod(u32(2)).eq(u32(0))),
      $.let('isNotFirst', $('gid').ne(u32(0))),
      $.let('isEdge',    $('isNotFirst').not().or($('gid').eq(u32(63)))),

      $.if($('isEdge'), [
        $.assign($('highlight'), litBool(false)),
      ]),

      $.if($('highlight').and($('isEven')), [
        $.storeField('dots:color_r', $('gid'), f32(0.2)),
        $.storeField('dots:color_g', $('gid'), f32(0.5)),
        $.storeField('dots:color_b', $('gid'), f32(1.0)),
      ], [
        $.storeField('dots:color_r', $('gid'), f32(1.0)),
        $.storeField('dots:color_g', $('gid'), f32(0.3)),
        $.storeField('dots:color_b', $('gid'), f32(0.2)),
      ]),
    ]),
    drawPrep('prep_dots', 'sys:active', 6),
    render('draw_dots', ortho(), clearTarget([0.05, 0.05, 0.07, 1]), [
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

export const conditionalRingTyped: PipelineInstallPayload = gpu(conditionalRingSpec);
