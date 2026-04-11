/**
 * depth-prepass (typed DSL) — Depth-only pass followed by a color pass using the depth buffer.
 *
 * Visual: full-screen color gradient with a black circular hole in the center.
 * The depth-only prepass writes z=0 inside a circle; the color pass draws at z=0.5
 * with depthCompare 'less' so fragments inside the hole fail the depth test.
 */

import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, render, draw,
  ortho, depthOnlyTarget, fsQuadSource,
  TAU,
} from '../../../gpu-ir/compile';
import {
  type Scope, vec4, sin, cos, sqrt, smoothstep, atan2, lit,
} from '../../../gpu-ir/typed-dsl';

export const depthPrepassSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  textures: {
    depth_buf: {
      dimension: '2d',
      width: { relativeTo: 'canvas', scale: 1 },
      height: { relativeTo: 'canvas', scale: 1 },
      format: 'depth24plus-stencil8',
      usage: ['render_attachment'],
    },
  },

  roster: [
    // Pass 1: DEPTH-ONLY — write a circular region at z=0.0.
    // Zero color attachments, no fragment shader.
    render('depth_fill', ortho(), depthOnlyTarget('depth_buf'), [
      draw('stamp_depth', fsQuadSource(), {
        blendMode: 'opaque', cullMode: 'none', depthWrite: true, depthCompare: 'always',
      }, {
        vertex: ($: Scope) => [
          $.let('u', $('position').x),
          $.let('v', $('position').y),
          $.let('dist', sqrt($('u').mul($('u')).add($('v').mul($('v'))))),
          // Inside radius 0.6: z=0.0 (blocks). Outside: z=0.99 (won't block).
          $.let('z', smoothstep(0.4, 0.6, $('dist'))),
          $.returnVertex(vec4($('position').x, $('position').y, $('z'), 1.0), {}),
        ],
      }),
    ]),

    // Pass 2: COLOR — full-screen gradient at z=0.5.
    // Depth test: fragments pass where existing depth > 0.5 (outside the circle).
    render('color_draw', ortho(), {
      colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.0, 0.0, 0.0, 1] }],
      depthStencil: {
        textureId: 'depth_buf',
        depth: { op: 'load' },
      },
    }, [
      draw('gradient', fsQuadSource(), {
        blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'less',
      }, {
        vertex: ($: Scope) => [
          $.let('u', $('position').x.mul(0.5).add(0.5)),
          $.let('v', lit(1.0).sub($('position').y.mul(0.5).add(0.5))),
          $.returnVertex(
            vec4($('position').x, $('position').y, 0.5, 1.0),
            { uv: vec4($('u'), $('v'), 0.0, 0.0) },
          ),
        ],
        fragment: ($: Scope) => [
          $.let('time', $.global('sys:time')),
          $.let('hue', atan2($('uv').y.sub(0.5), $('uv').x.sub(0.5)).add($('time'))),
          $.let('r', sin($('hue')).mul(0.5).add(0.5)),
          $.let('g', sin($('hue').add(TAU / 3)).mul(0.5).add(0.5)),
          $.let('b', sin($('hue').add(TAU * 2 / 3)).mul(0.5).add(0.5)),
          $.returnFragment({ color: vec4($('r'), $('g'), $('b'), 1.0) }),
        ],
      }),
    ]),
  ],
};

export const depthPrepassTyped: PipelineInstallPayload = gpu(depthPrepassSpec);
