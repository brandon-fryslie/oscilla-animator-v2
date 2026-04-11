/**
 * quad-camera (typed DSL) — 4 cameras rendering to 4 textures, then composited onto canvas.
 *
 * 1024 petals in a triple-spiral with per-instance transforms.
 * Each camera has different zoom/pan settings. Final composite samples all 4 as quadrants.
 */

import type { PipelineInstallPayload } from '../../boundary-contract';
import {
  type GpuSpec,
  gpu, compute, render, composite, draw, drawPrep,
  domain, wg, domainSource, fsQuadSource,
  ortho, clearTarget, clearTexture,
  ALPHA_BLEND, OPAQUE, HALF_PI, TAU,
} from '../../../gpu-ir/compile';
import { tri } from '../../../gpu-ir/shapes';
import {
  type Scope, f32, u32, vec2, vec4, sin, cos, lit,
  textureSample,
} from '../../../gpu-ir/typed-dsl';

export const quadCameraSpec: GpuSpec = {
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1024 } },
  domains: {
    pts: { capacity: 1024, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32', rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  textures: {
    tl: { dimension: '2d', width: { relativeTo: 'canvas', scale: 0.5 }, height: { relativeTo: 'canvas', scale: 0.5 }, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
    tr: { dimension: '2d', width: { relativeTo: 'canvas', scale: 0.5 }, height: { relativeTo: 'canvas', scale: 0.5 }, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
    bl: { dimension: '2d', width: { relativeTo: 'canvas', scale: 0.5 }, height: { relativeTo: 'canvas', scale: 0.5 }, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
    br: { dimension: '2d', width: { relativeTo: 'canvas', scale: 0.5 }, height: { relativeTo: 'canvas', scale: 0.5 }, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
  },
  samplers: {
    nearest: { magFilter: 'nearest', minFilter: 'nearest', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' },
  },
  shapes: {
    petal: tri([
      -0.02, -0.005,  0.02, -0.005,  0.02, 0.005,
      -0.02, -0.005,  0.02,  0.005, -0.02, 0.005,
    ]),
  },

  roster: [
    // Shared simulation
    compute('sim', domain('pts'), wg(256), ($: Scope) => [
      $.let('gid',    $.thread.x),
      $.let('time',   $.global('sys:time')),
      $.let('N',      lit(1024.0)),
      $.let('fi',     f32($('gid'))),
      $.let('rank',   $('fi').div($('N'))),
      $.let('angle',  $('rank').mul(TAU * 3).add($('time').mul(0.7))),
      $.let('radius', lit(0.15).add($('rank').mul(0.6))),
      $.let('wobble', sin($('fi').mul(0.3).add($('time').mul(2.5))).mul(0.05)),
      $.storeField('pts:pos_x', $('gid'), cos($('angle')).mul($('radius').add($('wobble')))),
      $.storeField('pts:pos_y', $('gid'), sin($('angle')).mul($('radius').add($('wobble')))),
      $.storeField('pts:scale', $('gid'), lit(0.4).add(lit(0.6).mul(sin($('fi').mul(0.7).add($('time').mul(3.0)))))),
      $.storeField('pts:rotation', $('gid'), $('angle').add(HALF_PI)),
      $.let('hue', $('rank').add($('time').mul(0.1))),
      $.storeField('pts:color_r', $('gid'), sin($('hue').mul(TAU)).mul(0.5).add(0.5)),
      $.storeField('pts:color_g', $('gid'), sin($('hue').mul(TAU).add(TAU / 3)).mul(0.5).add(0.5)),
      $.storeField('pts:color_b', $('gid'), sin($('hue').mul(TAU).add(TAU * 2 / 3)).mul(0.5).add(0.5)),
      $.storeField('pts:color_a', $('gid'), lit(0.6).add(lit(0.4).mul($('rank')))),
    ]),
    drawPrep('prep', 'sys:active', 6),

    // Helper: vertex shader body shared by all 4 cameras
    // (each render() call gets its own draw with the same shader)
    ...(['tl', 'tr', 'bl', 'br'] as const).map((id) => {
      const cameraOpts = {
        tl: ortho(),
        tr: ortho({ zoom: 2 }),
        bl: ortho({ centerX: 0.3, centerY: 0.2 }),
        br: ortho({ zoom: 0.5 }),
      }[id];
      const bgColors = {
        tl: [0.15, 0.06, 0.06, 1] as const,
        tr: [0.04, 0.06, 0.18, 1] as const,
        bl: [0.04, 0.14, 0.06, 1] as const,
        br: [0.12, 0.04, 0.16, 1] as const,
      }[id];
      return render(id, cameraOpts, clearTexture(id, bgColors), [
        draw(`${id}_fill`, domainSource('pts', 'petal'), ALPHA_BLEND, {
          transform: { posX: 'pos_x', posY: 'pos_y', rotation: 'rotation', scale: 'scale' },
          vertex: ($: Scope) => [
            $.let('iid', $.instance.index),
            $.returnVertex(
              vec4($('position').x, $('position').y, 0.0, 1.0),
              { color: vec4(
                $.field('pts:color_r', $('iid')),
                $.field('pts:color_g', $('iid')),
                $.field('pts:color_b', $('iid')),
                $.field('pts:color_a', $('iid')),
              ) },
            ),
          ],
        }),
      ]);
    }),

    // Composite: sample 4 textures, draw as positioned quads on canvas
    composite('final', clearTarget([0.02, 0.02, 0.02, 1]), [
      ...([
        { id: 'tl', ox: -0.5, oy:  0.5 },
        { id: 'tr', ox:  0.5, oy:  0.5 },
        { id: 'bl', ox: -0.5, oy: -0.5 },
        { id: 'br', ox:  0.5, oy: -0.5 },
      ] as const).map(({ id, ox, oy }) =>
        draw(`comp_${id}`, fsQuadSource(), OPAQUE, {
          vertex: ($: Scope) => [
            $.let('x', $('position').x.mul(0.5).add(ox)),
            $.let('y', $('position').y.mul(0.5).add(oy)),
            $.let('u', $('position').x.mul(0.5).add(0.5)),
            $.let('v', lit(1.0).sub($('position').y.mul(0.5).add(0.5))),
            $.returnVertex(
              vec4($('x'), $('y'), 0.0, 1.0),
              { uv: vec4($('u'), $('v'), 0.0, 0.0) },
            ),
          ],
          fragment: ($: Scope) => [
            $.returnFragment({
              color: textureSample(id, 'nearest', vec2($('uv').x, $('uv').y)),
            }),
          ],
        }),
      ),
    ]),
  ],
};

export const quadCameraTyped: PipelineInstallPayload = gpu(quadCameraSpec);
