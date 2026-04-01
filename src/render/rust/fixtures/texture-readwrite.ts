// texture-readwrite: Compute writes to storage texture, render reads via TextureLoad.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    quad: { capacity: 1, active: 'sys:active', fields: {
      _pad: 'f32',
    }},
  },
  textures: {
    tex_color: {
      dimension: '2d',
      width: 64,
      height: 64,
      format: 'rgba8unorm',
      usage: ['storage', 'sampled'],
    },
  },
  shapes: { fullscreen_quad: fullscreenQuad() },

  roster: [
    compute('fill_texture', exact(8, 8), wg(8, 8), () => {
      const gx = $thread.x;
      const gy = $thread.y;
      const time = $global.time;
      const u = f32(gx) / 64.0;
      const v = f32(gy) / 64.0;
      const r = sin(u * 6.28 + time) * 0.5 + 0.5;
      const g = sin(v * 6.28 + time * 1.3) * 0.5 + 0.5;
      textureStore('tex_color', vec2i(i32(gx), i32(gy)), vec4(r, g, 0.5, 1.0));
    }),
    compute('set_active', exact(1), wg(1), () => {
      $scalar.active = u32(1);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', clearTarget([0, 0, 0, 1]), [
      draw('fullscreen', domainSource('quad', 'fullscreen_quad'), OPAQUE, {
        vertex: (position) => {
          return vertex(
            vec4(position.x, position.y, 0.0, 1.0),
            { uv: vec4(position.x * 0.5 + 0.5, 1.0 - (position.y * 0.5 + 0.5), 0.0, 0.0) },
          );
        },
        fragment: (uv) => {
          const tx = i32(uv.x * 63.0);
          const ty = i32(uv.y * 63.0);
          return fragment({ color: textureLoad('tex_color', vec2i(tx, ty)) });
        },
      }),
    ]),
  ],
})
