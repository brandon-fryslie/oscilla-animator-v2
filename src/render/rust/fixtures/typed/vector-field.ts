/**
 * vector-field (typed DSL) — Vector builtins: normalize, length, distance,
 * dot, cross, reflect. 64 dots in 8x8 grid.
 */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec2, vec3, vec4,
  sin, cos, abs, clamp, length, normalize, distance, dot, cross, reflect,
} from '../../../gpu-ir/typed-dsl';

export const vectorFieldSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    arrows: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_quad: quad(0.025) },

  roster: [
    compute('eval_vectors', domain('arrows'), wg(64), ($: Scope) => [
      $.let('gid', $.thread.x),
      $.let('time', $.global('sys:time')),
      $.let('col', $('gid').mod(u32(8))),
      $.let('row', $('gid').div(u32(8))),
      $.let('cx', f32($('col')).sub(3.5).mul(0.22)),
      $.let('cy', f32($('row')).sub(3.5).mul(0.22)),

      // Build a 2D vector from position
      $.let('v', vec2($('cx').add(sin($('time')).mul(0.1)), $('cy').add(cos($('time')).mul(0.1)))),
      $.let('len', length($('v'))),
      $.let('n', normalize($('v'))),

      // Distance from origin
      $.let('origin', vec2(0.0, 0.0)),
      $.let('dist', distance($('v'), $('origin'))),

      // Dot product with a rotating reference vector
      $.let('ref', vec2(cos($('time')), sin($('time')))),
      $.let('d', dot($('n'), $('ref'))),

      // Cross product (3D, for orientation)
      $.let('v3a', vec3($('n').x, $('n').y, 0.0)),
      $.let('v3b', vec3($('ref').x, $('ref').y, 0.0)),
      $.let('c', cross($('v3a'), $('v3b'))),

      // Reflect v across the reference
      $.let('r', reflect($('v'), $('ref'))),

      $.storeField('arrows:pos_x', $('gid'), $('cx')),
      $.storeField('arrows:pos_y', $('gid'), $('cy')),
      $.storeField('arrows:color_r', $('gid'), clamp($('d').mul(0.5).add(0.5), 0.0, 1.0)),
      $.storeField('arrows:color_g', $('gid'), clamp(f32(1.0).sub($('dist')), 0.0, 1.0)),
      $.storeField('arrows:color_b', $('gid'), clamp(abs($('c').z).add(abs($('r').x).mul(0.2)), 0.0, 1.0)),
    ]),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.04, 0.04, 0.07, 1]), [
      draw('arrows_fill', domainSource('arrows', 'unit_quad'), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px', $.field('arrows:pos_x', $('iid'))),
          $.let('py', $.field('arrows:pos_y', $('iid'))),
          $.let('cr', $.field('arrows:color_r', $('iid'))),
          $.let('cg', $.field('arrows:color_g', $('iid'))),
          $.let('cb', $.field('arrows:color_b', $('iid'))),
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

export const vectorFieldTyped: PipelineInstallPayload = gpu(vectorFieldSpec);
