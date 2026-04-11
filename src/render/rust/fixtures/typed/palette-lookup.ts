/**
 * palette-lookup (typed DSL) — IndexAccess on vec4, nested Construct, computed index.
 *
 * 64 dots in an 8x8 grid. Each dot picks a channel from a time-varying palette
 * via computed index, then builds a color from swizzled components.
 */

import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget,
  OPAQUE, TAU,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec4, sin, lit,
} from '../../../gpu-ir/typed-dsl';

export const paletteLookupSpec: GpuSpec = {
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
    compute('eval_palette', domain('dots'), wg(64), ($: Scope) => [
      $.let('gid',  $.thread.x),
      $.let('time', $.global('sys:time')),
      $.let('col',  $('gid').mod(u32(8))),
      $.let('row',  $('gid').div(u32(8))),
      $.storeField('dots:pos_x', $('gid'), f32($('col')).sub(3.5).mul(0.22)),
      $.storeField('dots:pos_y', $('gid'), f32($('row')).sub(3.5).mul(0.22)),

      // Build a palette as nested Construct
      $.let('palette', vec4(
        sin($('time')).mul(0.5).add(0.5),
        sin($('time').add(TAU / 3)).mul(0.5).add(0.5),
        sin($('time').add(TAU * 2 / 3)).mul(0.5).add(0.5),
        1.0,
      )),

      // IndexAccess: pick a channel using computed index
      $.let('channel_idx', $('gid').mod(u32(3))),
      $.let('value', $('palette').at($('channel_idx'))),

      // Nested Construct: build color from swizzled components
      $.let('color', vec4(
        $('palette').x.mul($('value')),
        $('palette').y.mul(lit(1.0).sub($('value'))),
        $('palette').z,
        1.0,
      )),

      $.storeField('dots:color_r', $('gid'), $('color').x),
      $.storeField('dots:color_g', $('gid'), $('color').y),
      $.storeField('dots:color_b', $('gid'), $('color').z),
    ]),

    drawPrep('prep', 'sys:active', 6),

    render('draw', ortho(), clearTarget([0.04, 0.04, 0.07, 1]), [
      draw('dots_fill', domainSource('dots', 'unit_quad'), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px',  $.field('dots:pos_x', $('iid'))),
          $.let('py',  $.field('dots:pos_y', $('iid'))),
          $.let('cr',  $.field('dots:color_r', $('iid'))),
          $.let('cg',  $.field('dots:color_g', $('iid'))),
          $.let('cb',  $.field('dots:color_b', $('iid'))),
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

export const paletteLookupTyped: PipelineInstallPayload = gpu(paletteLookupSpec);
