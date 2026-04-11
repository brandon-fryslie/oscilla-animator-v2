/** spirograph-trace (typed DSL) — 1000 points tracing a hypotrochoid, rainbow color. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, ALPHA_BLEND,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import { type Scope, f32, vec4, sin, cos, mul, add, sub, lit } from '../../../gpu-ir/typed-dsl';

export const spirographTraceSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1000 } },
  domains: {
    pts: { capacity: 1000, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: { f32: 1 }, color_g: { f32: 1 }, color_b: { f32: 1 },
    }},
  },
  shapes: { point_quad: quad(0.005) },

  roster: [
    compute('eval_spirograph', domain('pts'), wg(64), ($: Scope) => [
      $.let('gid',  $.thread.x),
      $.let('time', $.global('sys:time')),
      $.let('rank', f32($('gid')).div(1000.0)),
      $.let('t',    $('rank').mul(50.26548245743669).add($('time'))),
      $.let('inner', mul(1.625, $('t'))),
      $.storeField('pts:pos_x', $('gid'),
        add(mul(0.7222222222222222, cos($('t'))), mul(0.2777777777777778, cos($('inner')))).mul(0.82)),
      $.storeField('pts:pos_y', $('gid'),
        sub(mul(0.7222222222222222, sin($('t'))), mul(0.2777777777777778, sin($('inner')))).mul(0.82)),
      $.let('hue_angle', $('rank').mul(6.283185307179586)),
      $.storeField('pts:color_r', $('gid'), sin($('hue_angle')).mul(0.5).add(0.5)),
      $.storeField('pts:color_g', $('gid'), sin($('hue_angle').add(2.094)).mul(0.5).add(0.5)),
      $.storeField('pts:color_b', $('gid'), sin($('hue_angle').add(4.189)).mul(0.5).add(0.5)),
    ]),
    drawPrep('prep_pts', 'sys:active', 6),
    render('draw_pts', ortho(), clearTarget([0.02, 0.02, 0.04, 1]), [
      draw('pts_fill', domainSource('pts', 'point_quad'), ALPHA_BLEND, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px', $.field('pts:pos_x', $('iid'))),
          $.let('py', $.field('pts:pos_y', $('iid'))),
          $.let('cr', $.field('pts:color_r', $('iid'))),
          $.let('cg', $.field('pts:color_g', $('iid'))),
          $.let('cb', $.field('pts:color_b', $('iid'))),
          $.returnVertex(
            vec4($('position').x.add($('px')), $('position').y.add($('py')), 0.0, 1.0),
            { color: vec4($('cr'), $('cg'), $('cb'), 0.85) },
          ),
        ],
        fragment: ($: Scope) => [
          $.returnFragment({ color: $('color') }),
        ],
      }),
    ]),
  ],
};

export const spirographTraceTyped: PipelineInstallPayload = gpu(spirographTraceSpec);
