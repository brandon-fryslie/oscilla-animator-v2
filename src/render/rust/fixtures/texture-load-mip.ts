// texture-load-mip: Offscreen render target read back with explicit TextureLoad mipLevel=0.
gpu({
  textures: {
    color_tex: {
      dimension: '2d',
      width: { relativeTo: 'canvas', scale: 1 },
      height: { relativeTo: 'canvas', scale: 1 },
      format: 'rgba8unorm',
      usage: ['render_attachment', 'sampled'],
    },
  },
  roster: [
    render('paint_color_tex', ortho(), clearTexture('color_tex', [0.02, 0.03, 0.06, 1.0]), [
      draw('paint_gradient', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const uvx = position.x * 0.5 + 0.5;
          const uvy = position.y * 0.5 + 0.5;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({
            color: vec4(
              uv.x,
              0.25 + uv.y * 0.55,
              0.95 - uv.x * 0.65,
              1.0,
            ),
          });
        },
      }),
    ]),
    composite('present', clearTarget([0.01, 0.01, 0.02, 1.0]), [
      draw('present_loaded_tex', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const uvx = position.x * 0.5 + 0.5;
          const uvy = position.y * 0.5 + 0.5;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          const tx = i32(uv.x * 719.0);
          const ty = i32((1.0 - uv.y) * 719.0);
          return fragment({ color: textureLoad('color_tex', vec2i(tx, ty), i32(0)) });
        },
      }),
    ]),
  ],
})
