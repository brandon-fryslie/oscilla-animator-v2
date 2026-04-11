// bgra-offscreen: Offscreen BGRA render target composited back to canvas.
// Validates MMU texture allocation for bgra8unorm without relying on fallback defaults.
gpu({
  textures: {
    bgra_tex: {
      dimension: '2d',
      width: { relativeTo: 'canvas', scale: 1 },
      height: { relativeTo: 'canvas', scale: 1 },
      format: 'bgra8unorm',
      usage: ['render_attachment', 'sampled'],
    },
  },
  samplers: {
    nearest: {
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    },
  },

  roster: [
    render('paint_bgra', ortho(), clearTexture('bgra_tex', [0.08, 0.12, 0.2, 1.0]), [
      draw('bgra_fill', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const uvx = position.x * 0.5 + 0.5;
          const uvy = position.y * 0.5 + 0.5;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({
            color: vec4(
              uv.x,
              0.25 + uv.y * 0.5,
              1.0 - uv.x * 0.6,
              1.0,
            ),
          });
        },
      }),
    ]),
    composite('present', clearTarget([0.01, 0.01, 0.02, 1.0]), [
      draw('present_bgra', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const uvx = position.x * 0.5 + 0.5;
          const uvy = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({ color: textureSample('bgra_tex', 'nearest', vec2(uv.x, uv.y)) });
        },
      }),
    ]),
  ],
})
