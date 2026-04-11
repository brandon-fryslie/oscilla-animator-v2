/**
 * instanced-write (typed DSL) — 2048 instances in a breathing double-ring.
 *
 * Identical output to the eval'd v1 fixture. Tests: domain-dispatched compute,
 * per-instance field writes, instanced draw, transform declaration, passthrough fragment.
 */

import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget,
  ALPHA_BLEND, HALF_PI, TAU,
} from '../../../gpu-ir/compile';
import { tri } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec4, sin, cos, lit,
} from '../../../gpu-ir/typed-dsl';

export const instancedWriteSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 2048 } },
  domains: {
    dots: { capacity: 2048, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32', rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: { petal: tri([
    -0.018, -0.004,  0.018, -0.004,  0.018, 0.004,
    -0.018, -0.004,  0.018,  0.004, -0.018, 0.004,
  ]) },

  roster: [
    compute('eval_instances', domain('dots'), wg(256), ($: Scope) => [
      $.let('gid',   $.thread.x),
      $.let('time',  $.global('sys:time')),
      $.let('N',     f32(2048.0)),
      $.let('fi',    f32($('gid'))),
      $.let('rank',  $('fi').div($('N'))),

      // Three concentric rings
      $.let('ring',        f32($('gid').mod(u32(3)))),
      $.let('base_radius', lit(0.25).add($('ring').mul(0.2))),
      $.let('angle',       $('rank').mul(TAU).add($('time').mul(lit(0.8).add($('ring').mul(0.3))))),

      // Breathing radius + per-instance wobble
      $.let('breath', sin($('time').mul(1.8).add($('ring').mul(2.094))).mul(0.06)),
      $.let('wobble', sin($('fi').mul(0.37).add($('time').mul(3.0))).mul(0.04)),
      $.let('radius', $('base_radius').add($('breath')).add($('wobble'))),

      $.storeField('dots:pos_x', $('gid'), cos($('angle')).mul($('radius'))),
      $.storeField('dots:pos_y', $('gid'), sin($('angle')).mul($('radius'))),

      // Scale pulses per instance
      $.storeField('dots:scale', $('gid'),
        lit(0.5).add(lit(0.5).mul(sin($('fi').mul(0.5).add($('time').mul(4.0)))))),

      // Rotation: tangent to ring + gentle oscillation
      $.storeField('dots:rotation', $('gid'),
        $('angle').add(lit(HALF_PI)).add(sin($('fi').mul(0.2).add($('time').mul(2.0))).mul(0.4))),

      // Rainbow hue from angle, brightness modulated by ring
      $.let('hue',    $('angle').mul(0.5).add($('time').mul(0.3)).add($('ring').mul(0.7))),
      $.let('bright', lit(0.6).add(lit(0.2).mul($('ring')))),
      $.storeField('dots:color_r', $('gid'), sin($('hue')).mul(0.5).add(0.5).mul($('bright'))),
      $.storeField('dots:color_g', $('gid'), sin($('hue').add(2.094)).mul(0.5).add(0.5).mul($('bright'))),
      $.storeField('dots:color_b', $('gid'), sin($('hue').add(4.189)).mul(0.5).add(0.5).mul($('bright'))),
      $.storeField('dots:color_a', $('gid'), lit(0.3).add(lit(0.3).mul($('ring')))),
    ]),
    drawPrep('prep_dots', 'sys:active', 6),
    render('draw_dots', ortho(), clearTarget([0.03, 0.02, 0.06, 1]), [
      draw('dots_fill', domainSource('dots', 'petal'), ALPHA_BLEND, {
        transform: { posX: 'pos_x', posY: 'pos_y', rotation: 'rotation', scale: 'scale' },
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('cr',  $.field('dots:color_r', $('iid'))),
          $.let('cg',  $.field('dots:color_g', $('iid'))),
          $.let('cb',  $.field('dots:color_b', $('iid'))),
          $.let('ca',  $.field('dots:color_a', $('iid'))),
          $.returnVertex(
            vec4($('position').x, $('position').y, 0.0, 1.0),
            { color: vec4($('cr'), $('cg'), $('cb'), $('ca')) },
          ),
        ],
      }),
    ]),
  ],
};

export const instancedWriteTyped: PipelineInstallPayload = gpu(instancedWriteSpec);
