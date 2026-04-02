// texture-blur: Texture dispatch mode, multiple TextureLoad/TextureStore, neighbor sampling.
gpu({
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
    compute('write_pattern', exact(8, 8), wg(8, 8), () => {
      const gx = $thread.x;
      const gy = $thread.y;
      const time = $global.time;
      const u = f32(gx) / 64.0;
      const v = f32(gy) / 64.0;
      const r = sin(u * 12.566 + time) * 0.5 + 0.5;
      const g = sin(v * 12.566 + time * 1.7) * 0.5 + 0.5;
      const b = sin((u + v) * 6.283 + time * 0.5) * 0.5 + 0.5;
      textureStore('tex_src', vec2i(i32(gx), i32(gy)), vec4(r, g, b, 1.0));
    }),
    // Pass 2: Blur — texture dispatch reads neighbors from tex_src, writes to tex_dst
    compute('blur', texDispatch('tex_dst'), wg(8, 8), () => {
      const gx = $thread.x;
      const gy = $thread.y;
      const ix = i32(gx);
      const iy = i32(gy);
      // 5-tap cross filter
      const c = textureLoad('tex_src', vec2i(ix, iy));
      const l = textureLoad('tex_src', vec2i(ix - i32(1), iy));
      const r = textureLoad('tex_src', vec2i(ix + i32(1), iy));
      const u = textureLoad('tex_src', vec2i(ix, iy - i32(1)));
      const d = textureLoad('tex_src', vec2i(ix, iy + i32(1)));
      const avg = vec4(
        (c.x + l.x + r.x + u.x + d.x) * 0.2,
        (c.y + l.y + r.y + u.y + d.y) * 0.2,
        (c.z + l.z + r.z + u.z + d.z) * 0.2,
        1.0,
      );
      textureStore('tex_dst', vec2i(ix, iy), avg);
    }),
    // Set active for draw
    compute('set_active', exact(1), wg(1), () => {
      $scalar.active = u32(1);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0, 0, 0, 1]), [
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
          return fragment({ color: textureLoad('tex_dst', vec2i(tx, ty)) });
        },
      }),
    ]),
  ],
})
