/** jellyfish-bloom (typed DSL) — 6144 tendrils radiating from 3 pulsing bell shapes. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, ALPHA_BLEND, TAU,
} from '../../../gpu-ir/compile';
import { tri } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec4, sin, cos, fract,
} from '../../../gpu-ir/typed-dsl';

const N = 6144;
const TAU_OVER_3 = TAU / 3;
const TENDRILS_PER_JELLY = 2048;

export const jellyfishBloomSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: N } },
  domains: {
    tendrils: { capacity: N, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32', rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: { strand: tri([
    -0.002, -0.018,  0.002, -0.018,  0.002, 0.018,
    -0.002, -0.018,  0.002,  0.018, -0.002, 0.018,
  ]) },

  roster: [
    compute('sim_jelly', domain('tendrils'), wg(256), ($: Scope) => [
      $.let('gid',  $.thread.x),
      $.let('time', $.global('sys:time')),
      $.let('rank', f32($('gid')).div(N)),

      // 3 jellyfish, each with 2048 tendrils
      $.let('jelly_id',   $('gid').div(u32(TENDRILS_PER_JELLY))),
      $.let('local_id',   $('gid').mod(u32(TENDRILS_PER_JELLY))),
      $.let('local_rank', f32($('local_id')).div(TENDRILS_PER_JELLY)),
      $.let('jf', f32($('jelly_id'))),

      // Jellyfish center positions: slow drift
      $.let('jx', sin($('time').mul(0.3).add($('jf').mul(TAU_OVER_3))).mul(0.35)),
      $.let('jy', cos($('time').mul(0.23).add($('jf').mul(TAU_OVER_3))).mul(0.25).add(0.05)),

      // Bell pulse
      $.let('pulse', sin($('time').mul(2.5).add($('jf'))).mul(0.5).add(0.5)),
      $.let('bell_radius', $('pulse').mul(0.06).add(0.12)),

      // Tendril grows from bell edge downward
      $.let('tendril_angle', $('local_rank').mul(TAU * 5).add($('jf'))),
      $.let('tendril_depth', fract($('local_rank').mul(13)).mul(0.35).add(0.05)),

      // Attach point on the bell
      $.let('attach_x',
        cos($('tendril_angle')).mul($('bell_radius')).mul(
          sin($('local_rank').mul(40)).mul(0.4).add(0.6),
        )),
      $.let('attach_y', sin($('tendril_angle')).mul($('bell_radius')).mul(0.3)),

      // Tendril hangs down with wave motion
      $.let('wave', sin($('time').mul(3).add($('tendril_depth').mul(8)).add($('local_rank').mul(20)))
        .mul(0.03).mul($('tendril_depth'))),
      $.let('sway', cos($('time').mul(1.7).add($('local_rank').mul(30)))
        .mul(0.02).mul($('tendril_depth'))),

      $.storeField('tendrils:pos_x', $('gid'),
        $('jx').add($('attach_x')).add($('wave')).add($('sway'))),
      $.storeField('tendrils:pos_y', $('gid'),
        $('jy').add($('attach_y')).sub($('tendril_depth')).sub(
          $('tendril_depth').mul($('pulse')).mul(0.3),
        )),

      // Rotation: tendrils dangle
      $.storeField('tendrils:rotation', $('gid'),
        sin($('time').mul(2).add($('local_rank').mul(15))).mul(0.4).add($('tendril_angle').mul(0.1))),

      // Scale: thinner further from bell
      $.storeField('tendrils:scale', $('gid'),
        f32(1).sub($('tendril_depth')).mul(0.8).add(0.4)),

      // Color: bioluminescent — cyan/magenta/violet per jellyfish
      $.let('hue_base', $('jf').mul(0.33).add(0.5)),
      $.let('hue', $('hue_base').add($('local_rank').mul(0.1)).add($('time').mul(0.05))),
      $.let('glow', sin($('time').mul(4).add($('tendril_depth').mul(6)).add($('local_rank').mul(50)))
        .mul(0.5).add(0.5)),
      $.storeField('tendrils:color_r', $('gid'),
        sin($('hue').mul(TAU)).mul(0.4).add(0.55).mul($('glow'))),
      $.storeField('tendrils:color_g', $('gid'),
        sin($('hue').mul(TAU).add(TAU_OVER_3)).mul(0.4).add(0.55).mul($('glow'))),
      $.storeField('tendrils:color_b', $('gid'),
        sin($('hue').mul(TAU).add(TAU_OVER_3 * 2)).mul(0.4).add(0.65).mul($('glow'))),
      $.storeField('tendrils:color_a', $('gid'),
        f32(1).sub($('tendril_depth')).mul(0.6).add(0.2).mul($('glow').mul(0.5).add(0.5))),
    ]),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.005, 0.008, 0.02, 1]), [
      draw('tendrils_fill', domainSource('tendrils', 'strand'), ALPHA_BLEND, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px',  $.field('tendrils:pos_x', $('iid'))),
          $.let('py',  $.field('tendrils:pos_y', $('iid'))),
          $.let('sc',  $.field('tendrils:scale', $('iid'))),
          $.let('rot', $.field('tendrils:rotation', $('iid'))),
          $.let('cr',  $.field('tendrils:color_r', $('iid'))),
          $.let('cg',  $.field('tendrils:color_g', $('iid'))),
          $.let('cb',  $.field('tendrils:color_b', $('iid'))),
          $.let('ca',  $.field('tendrils:color_a', $('iid'))),
          $.let('c', cos($('rot'))),
          $.let('s', sin($('rot'))),
          $.let('lx', $('position').x.mul($('sc'))),
          $.let('ly', $('position').y.mul($('sc'))),
          $.returnVertex(
            vec4(
              $('lx').mul($('c')).sub($('ly').mul($('s'))).add($('px')),
              $('lx').mul($('s')).add($('ly').mul($('c'))).add($('py')),
              0.0, 1.0,
            ),
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

export const jellyfishBloomTyped: PipelineInstallPayload = gpu(jellyfishBloomSpec);
