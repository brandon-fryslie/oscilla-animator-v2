/**
 * texture-blur (typed DSL) — Texture dispatch mode, multiple TextureLoad/TextureStore,
 * 5-tap cross blur.
 *
 * Pass 1: Write a striped pattern to tex_src.
 * Pass 2: Blur from tex_src -> tex_dst (texture-dispatched).
 * Pass 3: Set active count for draw.
 * Render: Display tex_dst via textureLoad in the fragment shader.
 */

import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  exact, wg, domainSource, ortho, clearTarget, texDispatch,
  OPAQUE, TAU,
} from '../../../gpu-ir/compile';
import { fullscreenQuad } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, i32, vec2i, vec4, sin, lit,
  textureStore, textureLoad,
} from '../../../gpu-ir/typed-dsl';

export const textureBlurSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    quad: { capacity: 1, active: 'sys:active', fields: { _pad: 'f32' } },
  },
  textures: {
    tex_src: {
      dimension: '2d', width: 64, height: 64,
      format: 'rgba8unorm', usage: ['storage'],
    },
    tex_dst: {
      dimension: '2d', width: 64, height: 64,
      format: 'rgba8unorm', usage: ['storage', 'sampled'],
    },
  },
  shapes: { fullscreen_quad: fullscreenQuad() },

  roster: [
    // Pass 1: Write a pattern to tex_src
    compute('write_pattern', exact(8, 8), wg(8, 8), ($: Scope) => [
      $.let('gx',   $.thread.x),
      $.let('gy',   $.thread.y),
      $.let('time', $.global('sys:time')),
      $.let('u', f32($('gx')).div(64.0)),
      $.let('v', f32($('gy')).div(64.0)),
      $.let('r', sin($('u').mul(TAU * 2).add($('time'))).mul(0.5).add(0.5)),
      $.let('g', sin($('v').mul(TAU * 2).add($('time').mul(1.7))).mul(0.5).add(0.5)),
      $.let('b', sin($('u').add($('v')).mul(TAU).add($('time').mul(0.5))).mul(0.5).add(0.5)),
      textureStore('tex_src', vec2i(i32($('gx')), i32($('gy'))),
        vec4($('r'), $('g'), $('b'), 1.0)),
    ]),

    // Pass 2: Blur -- texture dispatch reads neighbors from tex_src, writes to tex_dst
    compute('blur', texDispatch('tex_dst'), wg(8, 8), ($: Scope) => [
      $.let('gx', $.thread.x),
      $.let('gy', $.thread.y),
      $.let('ix', i32($('gx'))),
      $.let('iy', i32($('gy'))),
      // 5-tap cross filter
      $.let('c', textureLoad('tex_src', vec2i($('ix'), $('iy')))),
      $.let('l', textureLoad('tex_src', vec2i($('ix').sub(i32(1)), $('iy')))),
      $.let('r', textureLoad('tex_src', vec2i($('ix').add(i32(1)), $('iy')))),
      $.let('u', textureLoad('tex_src', vec2i($('ix'), $('iy').sub(i32(1))))),
      $.let('d', textureLoad('tex_src', vec2i($('ix'), $('iy').add(i32(1))))),
      $.let('avg', vec4(
        $('c').x.add($('l').x).add($('r').x).add($('u').x).add($('d').x).mul(0.2),
        $('c').y.add($('l').y).add($('r').y).add($('u').y).add($('d').y).mul(0.2),
        $('c').z.add($('l').z).add($('r').z).add($('u').z).add($('d').z).mul(0.2),
        1.0,
      )),
      textureStore('tex_dst', vec2i($('ix'), $('iy')), $('avg')),
    ]),

    // Pass 3: Set active for draw
    compute('set_active', exact(1), wg(1), ($: Scope) => [
      $.storeScalar('sys:active', u32(1)),
    ]),

    drawPrep('prep', 'sys:active', 6),

    render('draw', ortho(), clearTarget([0, 0, 0, 1]), [
      draw('fullscreen', domainSource('quad', 'fullscreen_quad'), OPAQUE, {
        vertex: ($: Scope) => [
          $.returnVertex(
            vec4($('position').x, $('position').y, 0.0, 1.0),
            { uv: vec4(
              $('position').x.mul(0.5).add(0.5),
              lit(1.0).sub($('position').y.mul(0.5).add(0.5)),
              0.0, 0.0,
            ) },
          ),
        ],
        fragment: ($: Scope) => [
          $.let('tx', i32($('uv').x.mul(63.0))),
          $.let('ty', i32($('uv').y.mul(63.0))),
          $.returnFragment({ color: textureLoad('tex_dst', vec2i($('tx'), $('ty'))) }),
        ],
      }),
    ]),
  ],
};

export const textureBlurTyped: PipelineInstallPayload = gpu(textureBlurSpec);
