/**
 * texture-readwrite (typed DSL) — Compute writes checkerboard to storage texture,
 * render reads via TextureLoad. Two compute passes.
 */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  exact, wg, domainSource, ortho, clearTarget, OPAQUE, TAU,
} from '../../../gpu-ir/compile';
import { fullscreenQuad } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, i32, vec2i, vec4, sin,
  textureStore, textureLoad,
} from '../../../gpu-ir/typed-dsl';

export const textureReadwriteSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    quad: { capacity: 1, active: 'sys:active', fields: { _pad: 'f32' } },
  },
  textures: {
    tex_color: {
      dimension: '2d', width: 64, height: 64,
      format: 'rgba8unorm', usage: ['storage', 'sampled'],
    },
  },
  shapes: { fullscreen_quad: fullscreenQuad() },

  roster: [
    compute('fill_texture', exact(8, 8), wg(8, 8), ($: Scope) => [
      $.let('gx', $.thread.x),
      $.let('gy', $.thread.y),
      $.let('time', $.global('sys:time')),
      $.let('u', f32($('gx')).div(64.0)),
      $.let('v', f32($('gy')).div(64.0)),
      $.let('r', sin($('u').mul(TAU).add($('time'))).mul(0.5).add(0.5)),
      $.let('g', sin($('v').mul(TAU).add($('time').mul(1.3))).mul(0.5).add(0.5)),
      textureStore('tex_color',
        vec2i(i32($('gx')), i32($('gy'))),
        vec4($('r'), $('g'), 0.5, 1.0)),
    ]),
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
              $('position').y.mul(0.5).add(0.5).neg().add(1.0),
              0.0, 0.0,
            ) },
          ),
        ],
        fragment: ($: Scope) => [
          $.let('tx', i32($('uv').x.mul(63.0))),
          $.let('ty', i32($('uv').y.mul(63.0))),
          $.returnFragment({ color: textureLoad('tex_color', vec2i($('tx'), $('ty'))) }),
        ],
      }),
    ]),
  ],
};

export const textureReadwriteTyped: PipelineInstallPayload = gpu(textureReadwriteSpec);
