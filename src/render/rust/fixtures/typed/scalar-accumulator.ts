/** scalar-accumulator (typed DSL) — LoadScalar as expression. Phase from scalar read. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, exact, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import { type Scope, f32, u32, vec4, sin, cos } from '../../../gpu-ir/typed-dsl';

export const scalarAccumulatorSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: {
    'sys:active': { u32: 64 },
    'sys:phase': { f32: 0 },
  },
  domains: {
    dots: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_quad: quad(0.03) },

  roster: [
    compute('update_phase', exact(1), wg(1), ($: Scope) => [
      $.let('time', $.global('sys:time')),
      $.storeScalar('sys:phase', sin($('time')).mul(3.14159)),
    ]),
    compute('eval_dots', domain('dots'), wg(64), ($: Scope) => [
      $.let('gid',   $.thread.x),
      $.let('phase', $.scalar('sys:phase')),
      $.let('angle', f32($('gid')).mul(0.09817477042468103).add($('phase'))),
      $.storeField('dots:pos_x', $('gid'), cos($('angle')).mul(0.7)),
      $.storeField('dots:pos_y', $('gid'), sin($('angle')).mul(0.7)),
      $.storeField('dots:color_r', $('gid'), sin($('angle')).mul(0.5).add(0.5)),
      $.storeField('dots:color_g', $('gid'), sin($('angle').add(2.094)).mul(0.5).add(0.5)),
      $.storeField('dots:color_b', $('gid'), sin($('angle').add(4.189)).mul(0.5).add(0.5)),
    ]),
    drawPrep('prep_dots', 'sys:active', 6),
    render('draw_dots', ortho(), clearTarget([0.04, 0.04, 0.08, 1]), [
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

export const scalarAccumulatorTyped: PipelineInstallPayload = gpu(scalarAccumulatorSpec);
