/** fire-rain (typed DSL) — 12288 falling embers with heat shimmer and wind turbulence. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, ALPHA_BLEND, TAU,
} from '../../../gpu-ir/compile';
import { tri } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec4, sin, cos, fract, hash_u32,
} from '../../../gpu-ir/typed-dsl';

const N = 12288;

export const fireRainSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: N } },
  domains: {
    embers: { capacity: N, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32', rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: { spark: tri([
    -0.003, -0.010,  0.003, -0.010,  0.001, 0.010,
    -0.003, -0.010,  0.001,  0.010, -0.001, 0.010,
  ]) },

  roster: [
    compute('sim_fire', domain('embers'), wg(256), ($: Scope) => [
      $.let('gid',  $.thread.x),
      $.let('time', $.global('sys:time')),
      $.let('rank', f32($('gid')).div(N)),

      // Hash for per-ember randomness
      $.let('seed',  hash_u32($('gid'))),
      $.let('rand1', f32($('seed').bitand(u32(65535))).div(65535.0)),
      $.let('rand2', f32($('seed').shr(u32(16)).bitand(u32(65535))).div(65535.0)),

      // Falling: each ember has its own period
      $.let('fall_speed', $('rand1').mul(0.7).add(0.3)),
      $.let('fall_phase', fract($('time').mul($('fall_speed')).mul(0.15).add($('rand2')))),
      $.let('y', f32(1.0).sub($('fall_phase').mul(2.2))),

      // Horizontal: spread across with wind turbulence
      $.let('base_x',     $('rand1').mul(2).sub(1)),
      $.let('wind',       sin($('time').mul(0.8).add($('y').mul(3))).mul(0.15)),
      $.let('turbulence', sin($('y').mul(12).add($('time').mul(2)).add($('rand2').mul(TAU))).mul(0.04)),
      $.let('shimmer',    cos($('time').mul(5).add($('rank').mul(200))).mul(0.008)),

      $.storeField('embers:pos_x', $('gid'),
        $('base_x').add($('wind')).add($('turbulence')).add($('shimmer'))),
      $.storeField('embers:pos_y', $('gid'), $('y')),

      // Rotation: tumbling as they fall
      $.storeField('embers:rotation', $('gid'),
        $('time').mul(f32(2).add($('rand1').mul(4))).add($('rand2').mul(TAU))),

      // Scale: larger when fresh, shrink as they fall
      $.let('life', f32(1).sub($('fall_phase'))),
      $.storeField('embers:scale', $('gid'),
        $('life').mul(0.9).add(0.3).mul($('rand2').mul(0.5).add(0.5))),

      // Color: white-hot -> orange -> red -> dark as they fall
      $.let('heat', $('life').mul($('life'))),
      $.storeField('embers:color_r', $('gid'), $('heat').mul(0.8).add(0.2)),
      $.storeField('embers:color_g', $('gid'), $('heat').mul($('heat')).mul(0.7).add($('heat').mul(0.2))),
      $.storeField('embers:color_b', $('gid'), $('heat').mul($('heat')).mul($('heat')).mul(0.5)),
      $.storeField('embers:color_a', $('gid'),
        $('life').mul(
          sin($('time').mul(8).add($('rank').mul(100))).mul(0.5).add(0.5).mul(0.7).add(0.3),
        )),
    ]),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.02, 0.008, 0.005, 1]), [
      draw('embers_fill', domainSource('embers', 'spark'), ALPHA_BLEND, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px',  $.field('embers:pos_x', $('iid'))),
          $.let('py',  $.field('embers:pos_y', $('iid'))),
          $.let('sc',  $.field('embers:scale', $('iid'))),
          $.let('rot', $.field('embers:rotation', $('iid'))),
          $.let('cr',  $.field('embers:color_r', $('iid'))),
          $.let('cg',  $.field('embers:color_g', $('iid'))),
          $.let('cb',  $.field('embers:color_b', $('iid'))),
          $.let('ca',  $.field('embers:color_a', $('iid'))),
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

export const fireRainTyped: PipelineInstallPayload = gpu(fireRainSpec);
