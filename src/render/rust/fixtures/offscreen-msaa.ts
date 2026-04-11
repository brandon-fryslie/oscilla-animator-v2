// offscreen-msaa: Render a high-contrast X into a multisampled named texture,
// then sample the resolved result back to canvas.
gpu({
  textures: {
    msaa_tex: {
      dimension: '2d',
      width: { relativeTo: 'canvas', scale: 1 },
      height: { relativeTo: 'canvas', scale: 1 },
      sampleCount: 4,
      format: 'rgba8unorm',
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
    render('paint_msaa_tex', ortho(), clearTexture('msaa_tex', [0.03, 0.05, 0.09, 1.0]), [
      draw('paint_cross', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const uvx = position.x * 0.5 + 0.5;
          const uvy = position.y * 0.5 + 0.5;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          const rising = 1.0 - step(0.035, abs(uv.y - uv.x));
          const falling = 1.0 - step(0.035, abs(uv.y - (1.0 - uv.x)));
          const cross = max(rising, falling);
          return fragment({
            color: vec4(
              0.08 + cross * 0.92,
              0.18 + falling * 0.55,
              0.3 + rising * 0.45,
              1.0,
            ),
          });
        },
      }),
    ]),
    composite('present', clearTarget([0.01, 0.01, 0.02, 1.0]), [
      draw('present_msaa_tex', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const uvx = position.x * 0.5 + 0.5;
          const uvy = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({ color: textureSample('msaa_tex', 'nearest', vec2(uv.x, uv.y)) });
        },
      }),
    ]),
  ],
})
