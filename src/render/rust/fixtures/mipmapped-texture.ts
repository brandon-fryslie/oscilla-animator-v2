// mipmapped-texture: Declares a named texture with mipLevelCount > 1.
// Validates the C.1 allocator path: the mipmapped texture installs without error,
// while the visible render still targets the canvas.
gpu({
  textures: {
    mip_tex: {
      dimension: '2d',
      width: { relativeTo: 'canvas', scale: 1 },
      height: { relativeTo: 'canvas', scale: 1 },
      mipLevelCount: 4,
      sampleCount: 1,
      format: 'rgba8unorm',
      usage: ['render_attachment', 'sampled'],
    },
  },
  roster: [
    render('show_canvas', ortho(), clearTarget([0.03, 0.04, 0.07, 1.0]), [
      draw('canvas_fill', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const uvx = position.x * 0.5 + 0.5;
          const uvy = position.y * 0.5 + 0.5;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({
            color: vec4(
              0.12 + uv.x * 0.75,
              0.18 + uv.y * 0.55,
              0.92 - uv.x * 0.35,
              1.0,
            ),
          });
        },
      }),
    ]),
  ],
})
