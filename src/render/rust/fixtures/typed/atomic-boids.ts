/**
 * atomic-boids (typed DSL) — 10000 boids with atomic grid_cell.
 * Tests AtomicOpField(Exchange).
 */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, OPAQUE, TAU,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec4, sin, cos,
} from '../../../gpu-ir/typed-dsl';

export const atomicBoidsSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 10000 } },
  domains: {
    boids: { capacity: 10000, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      grid_cell: { 'atomic<u32>': 0 },
      cell_val: 'f32',
    }},
  },
  shapes: { dot: quad(0.003) },

  roster: [
    compute('sim_boids', domain('boids'), wg(256), ($: Scope) => [
      $.let('gid', $.thread.x),
      $.let('time', $.global('sys:time')),
      $.let('fi', f32($('gid'))),
      // TAU / 10000 = 0.0006283185307179586
      $.let('angle', $('fi').mul(TAU / 10000).add($('time'))),
      $.let('radius', f32(0.3).add(sin($('fi').mul(0.01).add($('time').mul(2.0))).mul(0.5))),
      $.storeField('boids:pos_x', $('gid'), cos($('angle')).mul($('radius'))),
      $.storeField('boids:pos_y', $('gid'), sin($('angle')).mul($('radius'))),
      $.let('cell_value', $('gid').mod(u32(16)).add(u32(1))),
      $.atomicOpField('Exchange', 'boids:grid_cell', $('gid'), $('cell_value')),
      $.storeField('boids:cell_val', $('gid'), f32($('cell_value'))),
    ]),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.02, 0.02, 0.04, 1]), [
      draw('boids_fill', domainSource('boids', 'dot'), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px', $.field('boids:pos_x', $('iid'))),
          $.let('py', $.field('boids:pos_y', $('iid'))),
          $.let('cell', $.field('boids:cell_val', $('iid'))),
          $.let('intensity', $('cell').div(16.0)),
          $.returnVertex(
            vec4($('position').x.add($('px')), $('position').y.add($('py')), 0.0, 1.0),
            { color: vec4($('intensity'), $('intensity').mul(0.7), 1.0, 1.0) },
          ),
        ],
        fragment: ($: Scope) => [
          $.returnFragment({ color: $('color') }),
        ],
      }),
    ]),
  ],
};

export const atomicBoidsTyped: PipelineInstallPayload = gpu(atomicBoidsSpec);
