/** aurora-field (typed DSL) — 76800 soft glowing petals with curl dynamics and rotation. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, ALPHA_BLEND, TAU,
} from '../../../gpu-ir/compile';
import { tri } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, vec4, sin, cos, sqrt, max, atan2, fract,
} from '../../../gpu-ir/typed-dsl';

const N = 76800;
const G = 1.32471795724; // R2 quasi-random base
const TAU_OVER_3 = TAU / 3;

export const auroraFieldSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: N } },
  domains: {
    petals: { capacity: N, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32', rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: { petal: tri([
    -0.048, -0.012,  0.048, -0.012,  0.048, 0.012,
    -0.048, -0.012,  0.048,  0.012, -0.048, 0.012,
  ]) },

  roster: [
    compute('sim_aurora', domain('petals'), wg(256), ($: Scope) => [
      $.let('gid',  $.thread.x),
      $.let('time', $.global('sys:time')),
      $.let('rank', f32($('gid')).div(N)),

      // R2 quasi-random placement — zero moire, full coverage, [-1, 1] range
      $.let('x0', fract(f32(0.5).add(f32(1.0 / G).mul(f32($('gid'))))).mul(2).sub(1)),
      $.let('y0', fract(f32(0.5).add(f32(1.0 / (G * G)).mul(f32($('gid'))))).mul(2).sub(1)),

      // Per-instance phase offsets
      $.let('phase_a', $('time').mul(0.57).add($('rank').mul(TAU))),
      $.let('phase_b', $('time').mul(0.41).add($('rank').mul(TAU * 2 / 3))),
      $.let('sin_a', sin($('phase_a'))),
      $.let('cos_a', cos($('phase_a'))),
      $.let('sin_b', sin($('phase_b'))),
      $.let('cos_b', cos($('phase_b'))),

      // Radial breathing
      $.let('r',    sqrt(max($('x0').mul($('x0')).add($('y0').mul($('y0'))), 0.0001))),
      $.let('bend', $('r').mul(4).add($('sin_b').mul(1.2))),
      $.let('veil', cos($('bend')).mul(0.05).add(0.94)),
      $.let('plume', sin(
        $('bend').add($('x0').add($('y0')).mul(3)).add($('cos_a').mul(0.4)),
      ).mul(0.05).add(0.93)),

      // Curl distortion
      $.let('curl_x', sin(
        $('y0').mul(6).add($('sin_a').mul(1.4)).add(cos($('x0').mul(4).sub($('sin_b'))).mul(0.6)),
      ).mul(0.12)),
      $.let('curl_y', cos(
        $('x0').mul(5.5).sub($('sin_b').mul(1.1)).add(sin($('y0').mul(4.5).add($('cos_a'))).mul(0.5)),
      ).mul(0.14)),
      $.let('drift', sin(
        $('x0').add($('y0')).mul(5).sub($('cos_b').mul(0.9)),
      ).mul(0.05)),
      $.let('orbit_x', sin(
        $('x0').sub($('y0')).mul(3.5).add($('sin_a').mul(1.7)),
      ).mul(0.036)),
      $.let('orbit_y', cos(
        $('x0').add($('y0')).mul(3).sub($('cos_b').mul(1.5)),
      ).mul(0.040)),

      $.let('fx', $('x0').mul($('veil')).add($('curl_x')).add($('drift')).add($('orbit_x'))),
      $.let('fy', $('y0').mul($('plume')).add($('curl_y')).add($('orbit_y'))),
      $.storeField('petals:pos_x', $('gid'), $('fx')),
      $.storeField('petals:pos_y', $('gid'), $('fy')),

      // Per-instance scale: ripple + radial modulation
      $.let('ripple', sin($('rank').mul(96).add($('phase_a').mul(4.2))).mul(0.5).add(0.5)),
      $.let('radial', cos($('r').mul(8).sub($('phase_b').mul(2.8))).mul(0.55).add(0.45)),
      $.storeField('petals:scale', $('gid'), $('ripple').mul($('radial')).mul(0.85).add(0.25)),

      // Rotation: align petals along curl flow
      $.storeField('petals:rotation', $('gid'),
        atan2(
          $('curl_y').add($('orbit_y')),
          $('curl_x').add($('drift')).add($('orbit_x')),
        ).add(sin($('rank').mul(200).add($('time').mul(2))).mul(0.3))),

      // Hue from final y-position — creates horizontal rainbow bands
      $.let('hue', $('fy').mul(1.2).add($('time').mul(0.08))),
      $.let('brightness', $('ripple').mul($('radial')).mul(0.35).add(0.65)),
      $.storeField('petals:color_r', $('gid'),
        sin($('hue').mul(TAU)).mul(0.5).add(0.5).mul($('brightness'))),
      $.storeField('petals:color_g', $('gid'),
        sin($('hue').mul(TAU).add(TAU_OVER_3)).mul(0.5).add(0.5).mul($('brightness'))),
      $.storeField('petals:color_b', $('gid'),
        sin($('hue').mul(TAU).add(TAU_OVER_3 * 2)).mul(0.5).add(0.5).mul($('brightness'))),
      $.storeField('petals:color_a', $('gid'),
        sin($('rank').mul(37).add($('time').mul(1.3))).mul(0.55).add(0.35)),
    ]),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.012, 0.006, 0.03, 1]), [
      draw('petals_fill', domainSource('petals', 'petal'), ALPHA_BLEND, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px',  $.field('petals:pos_x', $('iid'))),
          $.let('py',  $.field('petals:pos_y', $('iid'))),
          $.let('sc',  $.field('petals:scale', $('iid'))),
          $.let('rot', $.field('petals:rotation', $('iid'))),
          $.let('cr',  $.field('petals:color_r', $('iid'))),
          $.let('cg',  $.field('petals:color_g', $('iid'))),
          $.let('cb',  $.field('petals:color_b', $('iid'))),
          $.let('ca',  $.field('petals:color_a', $('iid'))),
          $.let('c', cos($('rot'))),
          $.let('s', sin($('rot'))),
          $.let('lx', $('position').x.mul($('sc'))),
          $.let('ly', $('position').y.mul($('sc'))),
          $.let('rx', $('lx').mul($('c')).sub($('ly').mul($('s')))),
          $.let('ry', $('lx').mul($('s')).add($('ly').mul($('c')))),
          $.returnVertex(
            vec4($('rx').add($('px')), $('ry').add($('py')), 0.0, 1.0),
            { color: vec4($('cr'), $('cg'), $('cb'), $('ca')) },
          ),
        ],
        fragment: ($: Scope) => [
          $.returnFragment({ color: $('color') }),
        ],
      }),
    ]),
  ],
};

export const auroraFieldTyped: PipelineInstallPayload = gpu(auroraFieldSpec);
