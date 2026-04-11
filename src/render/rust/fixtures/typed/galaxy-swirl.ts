/** galaxy-swirl (typed DSL) — 16384 stars in a rotating galaxy with spiral arms and core glow. */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, ALPHA_BLEND, TAU, PI,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec4, sin, cos, sqrt, max, clamp, step, mix, hash_u32,
} from '../../../gpu-ir/typed-dsl';

const N = 16384;

export const galaxySwirlSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: N } },
  domains: {
    stars: { capacity: N, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: { dot: quad(0.006) },

  roster: [
    compute('sim_galaxy', domain('stars'), wg(256), ($: Scope) => [
      $.let('gid',  $.thread.x),
      $.let('time', $.global('sys:time')),
      $.let('rank', f32($('gid')).div(N)),

      // Pseudo-random per-star seed from hash
      $.let('seed',  hash_u32($('gid'))),
      $.let('rand1', f32($('seed').bitand(u32(65535))).div(65535.0)),
      $.let('rand2', f32($('seed').shr(u32(16)).bitand(u32(65535))).div(65535.0)),

      // Radial distribution: more stars near center
      $.let('base_r', $('rand1').mul($('rand1')).mul(0.9)),
      // Base angle with spiral arm structure (2 arms)
      $.let('arm', f32($('gid').mod(u32(2))).mul(PI)),
      $.let('base_angle', $('rank').mul(TAU * 8).add($('arm'))),
      // Spiral wind: tighter near center
      $.let('wind', $('base_r').mul(4.5)),

      // Orbit speed: faster near center (Keplerian-ish)
      $.let('orbit_speed', f32(0.3).div(max(sqrt($('base_r')), 0.05))),
      $.let('angle', $('base_angle').add($('wind')).add($('time').mul($('orbit_speed')))),

      // Scatter: stars deviate from perfect spiral
      $.let('scatter_r', $('base_r').add($('rand2').sub(0.5).mul(0.12))),
      $.let('scatter_a', $('angle').add($('rand1').sub(0.5).mul(0.8))),

      $.storeField('stars:pos_x', $('gid'), cos($('scatter_a')).mul($('scatter_r'))),
      $.storeField('stars:pos_y', $('gid'), sin($('scatter_a')).mul($('scatter_r'))),

      // Size: bigger and brighter near core
      $.let('core_glow', f32(1).div($('base_r').mul(8).add(1))),
      $.storeField('stars:scale', $('gid'), $('core_glow').mul(1.5).add(0.5).add($('rand2').mul(0.5))),

      // Color: blue-white at core, gold-red at edges, occasional blue giants
      $.let('temp', clamp($('base_r').mul(-1.5).add(1).add($('rand1').mul(0.3)), 0.0, 1.0)),
      $.let('is_blue_giant', step(0.97, $('rand2'))),
      $.storeField('stars:color_r', $('gid'), mix(1.0, 0.6, $('temp'))),
      $.storeField('stars:color_g', $('gid'), mix(0.7, 0.85, $('temp'))),
      $.storeField('stars:color_b', $('gid'), mix(0.3, 1.0, $('temp')).add($('is_blue_giant').mul(0.5))),
      $.storeField('stars:color_a', $('gid'),
        $('core_glow').mul(0.7).add(0.3).mul(
          sin($('time').mul(3).add($('rank').mul(100))).mul(0.3).add(0.7),
        )),
    ]),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.005, 0.003, 0.015, 1]), [
      draw('stars_fill', domainSource('stars', 'dot'), ALPHA_BLEND, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px', $.field('stars:pos_x', $('iid'))),
          $.let('py', $.field('stars:pos_y', $('iid'))),
          $.let('sc', $.field('stars:scale', $('iid'))),
          $.let('cr', $.field('stars:color_r', $('iid'))),
          $.let('cg', $.field('stars:color_g', $('iid'))),
          $.let('cb', $.field('stars:color_b', $('iid'))),
          $.let('ca', $.field('stars:color_a', $('iid'))),
          $.returnVertex(
            vec4($('position').x.mul($('sc')).add($('px')), $('position').y.mul($('sc')).add($('py')), 0.0, 1.0),
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

export const galaxySwirlTyped: PipelineInstallPayload = gpu(galaxySwirlSpec);
