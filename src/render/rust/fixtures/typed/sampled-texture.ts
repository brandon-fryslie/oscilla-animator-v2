/**
 * sampled-texture (typed DSL) — TextureSample with linear sampler.
 * Compute writes checkerboard, render samples with linear filter.
 */
import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, draw, drawPrep,
  exact, wg, domainSource, ortho, clearTarget, OPAQUE,
} from '../../../gpu-ir/compile';
import { fullscreenQuad } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, i32, vec2, vec2i, vec4,
  textureStore, textureSample,
} from '../../../gpu-ir/typed-dsl';

export const sampledTextureSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    quad: { capacity: 1, active: 'sys:active', fields: { _pad: 'f32' } },
  },
  textures: {
    tex_pattern: {
      dimension: '2d', width: 32, height: 32,
      format: 'rgba8unorm', usage: ['storage', 'sampled'],
    },
  },
  samplers: {
    linear_sampler: {
      magFilter: 'linear', minFilter: 'linear',
      addressModeU: 'repeat', addressModeV: 'repeat',
    },
  },
  shapes: { fullscreen_quad: fullscreenQuad() },

  roster: [
    // Write a checkerboard pattern
    compute('write_checker', exact(4, 4), wg(8, 8), ($: Scope) => [
      $.let('gx', $.thread.x),
      $.let('gy', $.thread.y),
      $.let('checker', $('gx').add($('gy')).mod(u32(2))),
      $.let('brightness', f32($('checker'))),
      textureStore('tex_pattern',
        vec2i(i32($('gx')), i32($('gy'))),
        vec4($('brightness'), $('brightness').mul(0.7), 0.2, 1.0)),
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
          $.let('sampled', textureSample('tex_pattern', 'linear_sampler', vec2($('uv').x, $('uv').y))),
          $.returnFragment({ color: $('sampled') }),
        ],
      }),
    ]),
  ],
};

export const sampledTextureTyped: PipelineInstallPayload = gpu(sampledTextureSpec);
