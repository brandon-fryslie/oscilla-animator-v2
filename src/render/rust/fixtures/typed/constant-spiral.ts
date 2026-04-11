/** constant-spiral (typed DSL) — Constants, LiteralI32, Cast(i32), nested expressions. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import { type Scope, f32, i32, vec4, sin, cos, lit } from '../../../gpu-ir/typed-dsl';

export const constantSpiralSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 128 } },
  domains: {
    pts: { capacity: 128, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { dot: quad(0.012) },

  roster: [
    compute('eval_spiral', domain('pts'), wg(64), ($: Scope) => [
      // Constants injected as Let bindings (was constants map in v1)
      $.let('RADIUS', lit(0.7)),
      $.let('TWIST',  lit(12.566370614359172)),
      $.let('ARMS',   lit(3)),

      $.let('gid',  $.thread.x),
      $.let('time', $.global('sys:time')),
      $.let('rank', f32($('gid')).div(128.0)),

      // i32(3) → LiteralI32; i32(gid) → Cast('i32', VarRef)
      $.let('arm',        f32(i32($('gid')).mod(i32(3)))),
      $.let('arm_offset', $('arm').mul(2.094)),
      $.let('t', $('rank').mul($('TWIST')).add($('time')).add($('arm_offset'))),
      $.let('r', $('rank').mul($('RADIUS'))),
      $.storeField('pts:pos_x', $('gid'), cos($('t')).mul($('r'))),
      $.storeField('pts:pos_y', $('gid'), sin($('t')).mul($('r'))),

      // Color from deeply nested chain
      $.storeField('pts:color_r', $('gid'), sin($('rank').mul(6.283).add($('arm_offset'))).mul(0.5).add(0.5)),
      $.storeField('pts:color_g', $('gid'), sin($('rank').mul(6.283).add($('arm_offset')).add(2.094)).mul(0.5).add(0.5)),
      $.storeField('pts:color_b', $('gid'), sin($('rank').mul(6.283).add($('arm_offset')).add(4.189)).mul(0.5).add(0.5)),
    ]),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.02, 0.02, 0.05, 1]), [
      draw('pts_fill', domainSource('pts', 'dot'), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px', $.field('pts:pos_x', $('iid'))),
          $.let('py', $.field('pts:pos_y', $('iid'))),
          $.let('cr', $.field('pts:color_r', $('iid'))),
          $.let('cg', $.field('pts:color_g', $('iid'))),
          $.let('cb', $.field('pts:color_b', $('iid'))),
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

export const constantSpiralTyped: PipelineInstallPayload = gpu(constantSpiralSpec);
