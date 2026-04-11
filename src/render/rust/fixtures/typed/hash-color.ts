/** hash-color (typed DSL) — 64 instances with hash_u32-derived colors in 8x8 grid. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import { type Scope, f32, u32, vec4, hash_u32 } from '../../../gpu-ir/typed-dsl';

export const hashColorSpec: GpuSpec = {
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    dots: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { quad: quad(0.04) },

  roster: [
    compute('hash_colors', domain('dots'), wg(64), ($: Scope) => [
      $.let('gid', $.thread.x),
      $.let('col', $('gid').mod(u32(8))),
      $.let('row', $('gid').div(u32(8))),
      $.storeField('dots:pos_x', $('gid'), f32($('col')).sub(3.5).mul(0.2)),
      $.storeField('dots:pos_y', $('gid'), f32($('row')).sub(3.5).mul(0.2)),
      $.let('seed', hash_u32($('gid'))),
      $.storeField('dots:color_r', $('gid'), f32($('seed').bitand(u32(255))).div(255.0)),
      $.storeField('dots:color_g', $('gid'), f32($('seed').shr(u32(8)).bitand(u32(255))).div(255.0)),
      $.storeField('dots:color_b', $('gid'), f32($('seed').shr(u32(16)).bitand(u32(255))).div(255.0)),
    ]),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.08, 0.08, 0.1, 1]), [
      draw('dots_fill', domainSource('dots', 'quad'), OPAQUE, {
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

export const hashColorTyped: PipelineInstallPayload = gpu(hashColorSpec);
