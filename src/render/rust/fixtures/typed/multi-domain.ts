/**
 * multi-domain (typed DSL) — Two domains (emitters + particles), cross-domain field reads,
 * multiple draw calls in one render pass.
 *
 * 4 emitters orbit in a square; 64 particles (16 per emitter) spread around their parent.
 * Colors derived from emitter ID.
 */

import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget,
  OPAQUE, HALF_PI, TAU, PI,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec4, sin, cos,
} from '../../../gpu-ir/typed-dsl';

export const multiDomainSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: {
    'sys:emitter_active': { u32: 4 },
    'sys:particle_active': { u32: 64 },
  },
  domains: {
    emitters: { capacity: 4, active: 'sys:emitter_active', fields: {
      pos_x: 'f32', pos_y: 'f32',
    }},
    particles: { capacity: 64, active: 'sys:particle_active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: {
    emitter_quad: quad(0.05),
    particle_quad: quad(0.015),
  },

  roster: [
    // Pass 1: Position emitters in a square
    compute('eval_emitters', domain('emitters'), wg(4), ($: Scope) => [
      $.let('gid',   $.thread.x),
      $.let('time',  $.global('sys:time')),
      $.let('angle', f32($('gid')).mul(HALF_PI).add($('time').mul(0.5))),
      $.storeField('emitters:pos_x', $('gid'), cos($('angle')).mul(0.4)),
      $.storeField('emitters:pos_y', $('gid'), sin($('angle')).mul(0.4)),
    ]),

    // Pass 2: Position particles relative to emitters (cross-domain read)
    compute('eval_particles', domain('particles'), wg(64), ($: Scope) => [
      $.let('gid',       $.thread.x),
      $.let('time',      $.global('sys:time')),
      // Each particle belongs to an emitter (16 particles per emitter)
      $.let('emitter_id', $('gid').div(u32(16))),
      $.let('local_id',   $('gid').mod(u32(16))),
      // Cross-domain read: particle compute reads emitter position
      $.let('ex', $.field('emitters:pos_x', $('emitter_id'))),
      $.let('ey', $.field('emitters:pos_y', $('emitter_id'))),
      // Spread particles around emitter
      $.let('local_angle',  f32($('local_id')).mul(PI / 8).add($('time').mul(2.0))),
      $.let('local_radius', f32(0.05).add(f32($('local_id')).mul(0.01))),
      $.storeField('particles:pos_x', $('gid'),
        $('ex').add(cos($('local_angle')).mul($('local_radius')))),
      $.storeField('particles:pos_y', $('gid'),
        $('ey').add(sin($('local_angle')).mul($('local_radius')))),
      // Color by emitter
      $.let('hue', f32($('emitter_id')).mul(HALF_PI)),
      $.storeField('particles:color_r', $('gid'), sin($('hue')).mul(0.5).add(0.5)),
      $.storeField('particles:color_g', $('gid'), sin($('hue').add(TAU / 3)).mul(0.5).add(0.5)),
      $.storeField('particles:color_b', $('gid'), sin($('hue').add(TAU * 2 / 3)).mul(0.5).add(0.5)),
    ]),

    drawPrep('prep_emitters', 'sys:emitter_active', 6),
    drawPrep('prep_particles', 'sys:particle_active', 6),

    // Single render pass with two draw calls
    render('draw_all', ortho(), clearTarget([0.03, 0.03, 0.06, 1]), [
      draw('emitter_fill', domainSource('emitters', 'emitter_quad'), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px',  $.field('emitters:pos_x', $('iid'))),
          $.let('py',  $.field('emitters:pos_y', $('iid'))),
          $.returnVertex(
            vec4($('position').x.add($('px')), $('position').y.add($('py')), 0.0, 1.0),
            { color: vec4(1.0, 1.0, 1.0, 1.0) },
          ),
        ],
        fragment: ($: Scope) => [
          $.returnFragment({ color: $('color') }),
        ],
      }),
      draw('particle_fill', domainSource('particles', 'particle_quad'), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px',  $.field('particles:pos_x', $('iid'))),
          $.let('py',  $.field('particles:pos_y', $('iid'))),
          $.let('cr',  $.field('particles:color_r', $('iid'))),
          $.let('cg',  $.field('particles:color_g', $('iid'))),
          $.let('cb',  $.field('particles:color_b', $('iid'))),
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

export const multiDomainTyped: PipelineInstallPayload = gpu(multiDomainSpec);
