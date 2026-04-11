/** bitfield-palette (typed DSL) — Bitwise ops (|, <<, >=), UnaryOp(~). */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import { type Scope, f32, u32, vec4, sin, cos } from '../../../gpu-ir/typed-dsl';

export const bitfieldPaletteSpec: GpuSpec = {
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
    compute('eval_bitfield', domain('dots'), wg(64), ($: Scope) => [
      $.let('gid',   $.thread.x),
      $.let('time',  $.global('sys:time')),
      $.let('angle', f32($('gid')).mul(0.09817477042468103).add($('time'))),
      $.storeField('dots:pos_x', $('gid'), cos($('angle')).mul(0.7)),
      $.storeField('dots:pos_y', $('gid'), sin($('angle')).mul(0.7)),

      $.let('lowBits',  $('gid').bitand(u32(7))),
      $.let('shifted',  $('gid').shl(u32(1))),
      $.let('combined', $('lowBits').bitor($('shifted').bitnot())),

      $.storeField('dots:color_r', $('gid'), f32($('combined').bitand(u32(7))).div(7.0)),
      $.storeField('dots:color_g', $('gid'), f32($('gid').shr(u32(3)).bitand(u32(7))).div(7.0)),

      $.if($('gid').ge(u32(32)), [
        $.storeField('dots:color_b', $('gid'), f32(1.0)),
      ], [
        $.storeField('dots:color_b', $('gid'), f32(0.3)),
      ]),
    ]),
    drawPrep('prep_dots', 'sys:active', 6),
    render('draw_dots', ortho(), clearTarget([0.03, 0.03, 0.06, 1]), [
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

export const bitfieldPaletteTyped: PipelineInstallPayload = gpu(bitfieldPaletteSpec);
