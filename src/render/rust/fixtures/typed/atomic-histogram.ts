/**
 * atomic-histogram (typed DSL) — AtomicLoadField, AtomicAdd with assignResultTo.
 * 64 cells in 8x8 grid. Pass 1 atomically increments per-cell counters,
 * capturing old values. Pass 2 reads counters via atomicLoad and normalizes brightness.
 */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  domain, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { quad } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec4, sin, clamp,
} from '../../../gpu-ir/typed-dsl';

export const atomicHistogramSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    cells: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      counter: { 'atomic<u32>': 0 },
      brightness: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { cell_quad: quad(0.04) },

  roster: [
    // Each cell atomically adds to its own counter, captures old value
    compute('accumulate', domain('cells'), wg(64), ($: Scope) => [
      $.let('gid', $.thread.x),
      $.let('time', $.global('sys:time')),

      // Position in grid
      $.let('col', f32($('gid').mod(u32(8)))),
      $.let('row', f32($('gid').div(u32(8)))),
      $.storeField('cells:pos_x', $('gid'), $('col').sub(3.5).mul(0.22)),
      $.storeField('cells:pos_y', $('gid'), $('row').sub(3.5).mul(0.22)),

      // Atomically increment counter — assignResultTo captures old value
      $.let('increment', u32(1).add($('gid').mod(u32(3)))),
      $.atomicOpField('Add', 'cells:counter', $('gid'), $('increment'), 'old_value'),

      // Use old_value to derive a color — demonstrates assignResultTo works
      $.storeField('cells:color_r', $('gid'), f32($('old_value').mod(u32(8))).div(8.0)),
      $.storeField('cells:color_g', $('gid'), f32($('old_value').mod(u32(5))).div(5.0)),
      $.storeField('cells:color_b', $('gid'),
        f32(0.5).add(sin($('time').mul(0.001).add(f32($('gid')).mul(0.3))).mul(0.3))),

      // Read counter back via atomicLoad — demonstrates atomicLoad as expression
      $.let('current', $.atomicField('cells:counter', $('gid'))),
      $.storeField('cells:brightness', $('gid'), clamp(f32($('current')).div(100.0), 0.1, 1.0)),
    ]),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.04, 0.04, 0.07, 1]), [
      draw('cells_fill', domainSource('cells', 'cell_quad'), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('iid', $.instance.index),
          $.let('px', $.field('cells:pos_x', $('iid'))),
          $.let('py', $.field('cells:pos_y', $('iid'))),
          $.let('b', $.field('cells:brightness', $('iid'))),
          $.let('cr', $.field('cells:color_r', $('iid'))),
          $.let('cg', $.field('cells:color_g', $('iid'))),
          $.let('cb', $.field('cells:color_b', $('iid'))),
          $.returnVertex(
            vec4($('position').x.add($('px')), $('position').y.add($('py')), 0.0, 1.0),
            { color: vec4($('cr').mul($('b')), $('cg').mul($('b')), $('cb').mul($('b')), 1.0) },
          ),
        ],
        fragment: ($: Scope) => [
          $.returnFragment({ color: $('color') }),
        ],
      }),
    ]),
  ],
};

export const atomicHistogramTyped: PipelineInstallPayload = gpu(atomicHistogramSpec);
