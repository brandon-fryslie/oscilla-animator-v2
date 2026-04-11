/**
 * mrt-split (typed DSL) — MRT: single pass writing 2 color textures simultaneously,
 * then a composite pass samples both side-by-side.
 *
 * Fragment outputs sorted alphabetically determine @location mapping:
 *   bright -> @location(0) -> bright_tex
 *   color  -> @location(1) -> color_tex
 */

import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, composite, draw,
  clearTarget, fsQuadSource, OPAQUE,
  TAU,
} from '../../../gpu-ir/compile';
import {
  type Scope, vec2, vec4, sin, cos, sqrt, atan2, lit,
  textureSample,
} from '../../../gpu-ir/typed-dsl';

export const mrtSplitSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  textures: {
    color_tex: {
      dimension: '2d',
      width: { relativeTo: 'canvas', scale: 1 },
      height: { relativeTo: 'canvas', scale: 1 },
      format: 'rgba8unorm',
      usage: ['render_attachment', 'sampled'],
    },
    bright_tex: {
      dimension: '2d',
      width: { relativeTo: 'canvas', scale: 1 },
      height: { relativeTo: 'canvas', scale: 1 },
      format: 'rgba8unorm',
      usage: ['render_attachment', 'sampled'],
    },
  },
  samplers: {
    linear: {
      magFilter: 'linear', minFilter: 'linear',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
    },
  },

  roster: [
    // MRT render pass: full-screen quad writing to BOTH textures simultaneously.
    composite('gbuffer', {
      colors: [
        { textureId: 'bright_tex', loadOp: 'clear', clearColor: [0, 0, 0, 1] },
        { textureId: 'color_tex', loadOp: 'clear', clearColor: [0, 0, 0, 1] },
      ],
    }, [
      draw('fullscreen_mrt', fsQuadSource(), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('u', $('position').x.mul(0.5).add(0.5)),
          $.let('v', lit(1.0).sub($('position').y.mul(0.5).add(0.5))),
          $.returnVertex(
            vec4($('position').x, $('position').y, 0.0, 1.0),
            { uv: vec4($('u'), $('v'), 0.0, 0.0) },
          ),
        ],
        fragment: ($: Scope) => [
          $.let('time', $.global('sys:time')),

          // "color" output: rainbow radial gradient
          $.let('angle', atan2($('uv').y.sub(0.5), $('uv').x.sub(0.5))),
          $.let('hue', $('angle').add($('time'))),
          $.let('full', vec4(
            sin($('hue')).mul(0.5).add(0.5),
            sin($('hue').add(TAU / 3)).mul(0.5).add(0.5),
            sin($('hue').add(TAU * 2 / 3)).mul(0.5).add(0.5),
            1.0,
          )),

          // "bright" output: concentric rings
          $.let('dist', sqrt(
            $('uv').x.sub(0.5).mul($('uv').x.sub(0.5))
            .add($('uv').y.sub(0.5).mul($('uv').y.sub(0.5))),
          )),
          $.let('rings', sin($('dist').mul(40.0).sub($('time').mul(4.0))).mul(0.5).add(0.5)),
          $.let('bright_out', vec4(
            $('rings'),
            $('rings').mul(0.5),
            $('rings').mul(0.8),
            1.0,
          )),

          $.returnFragment({ color: $('full'), bright: $('bright_out') }),
        ],
      }),
    ]),

    // Composite: left half = full color, right half = bright/bloom channel
    composite('final', clearTarget([0.0, 0.0, 0.0, 1]), [
      // Left half -- full color
      draw('show_color', fsQuadSource(), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('x', $('position').x.mul(0.5).sub(0.5)),
          $.let('u', $('position').x.mul(0.5).add(0.5)),
          $.let('v', lit(1.0).sub($('position').y.mul(0.5).add(0.5))),
          $.returnVertex(
            vec4($('x'), $('position').y, 0.0, 1.0),
            { uv: vec4($('u'), $('v'), 0.0, 0.0) },
          ),
        ],
        fragment: ($: Scope) => [
          $.returnFragment({
            color: textureSample('color_tex', 'linear', vec2($('uv').x, $('uv').y)),
          }),
        ],
      }),
      // Right half -- bright channel
      draw('show_bright', fsQuadSource(), OPAQUE, {
        vertex: ($: Scope) => [
          $.let('x', $('position').x.mul(0.5).add(0.5)),
          $.let('u', $('position').x.mul(0.5).add(0.5)),
          $.let('v', lit(1.0).sub($('position').y.mul(0.5).add(0.5))),
          $.returnVertex(
            vec4($('x'), $('position').y, 0.0, 1.0),
            { uv: vec4($('u'), $('v'), 0.0, 0.0) },
          ),
        ],
        fragment: ($: Scope) => [
          $.returnFragment({
            color: textureSample('bright_tex', 'linear', vec2($('uv').x, $('uv').y)),
          }),
        ],
      }),
    ]),
  ],
};

export const mrtSplitTyped: PipelineInstallPayload = gpu(mrtSplitSpec);
