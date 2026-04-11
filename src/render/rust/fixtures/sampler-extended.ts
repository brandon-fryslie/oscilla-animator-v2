// sampler-extended: Extended sampler descriptor fields on a real sampled-texture path.
// Comparison sampling is contract-only for now because the current IR lacks a
// textureSampleCompare expression; this fixture validates the runtime allocator path.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    quad: { capacity: 1, active: 'sys:active', fields: { _pad: 'f32' } },
  },
  textures: {
    tex_pattern: {
      dimension: '2d',
      width: 64,
      height: 64,
      format: 'rgba8unorm',
      usage: ['storage', 'sampled'],
    },
  },
  samplers: {
    extended_sampler: {
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      addressModeW: 'mirror-repeat',
      lodMinClamp: 0,
      lodMaxClamp: 4,
      maxAnisotropy: 1,
    },
  },
  shapes: { fullscreen_quad: fullscreenQuad() },

  roster: [
    compute('write_checker', exact(64, 64), wg(8, 8), () => {
      const gx = $thread.x;
      const gy = $thread.y;
      const checker = (gx + gy) % u32(2);
      const brightness = f32(checker);
      textureStore('tex_pattern', vec2i(i32(gx), i32(gy)), vec4(brightness, brightness * 0.55, 0.25, 1.0));
    }),
    compute('set_active', exact(1), wg(1), () => {
      $scalar.active = u32(1);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.01, 0.01, 0.02, 1.0]), [
      draw('fullscreen', domainSource('quad', 'fullscreen_quad'), OPAQUE, {
        vertex: (position) => {
          return vertex(
            vec4(position.x, position.y, 0.0, 1.0),
            { uv: vec4(position.x + 0.5, 1.0 - (position.y * 0.5 + 0.5), 0.0, 0.0) },
          );
        },
        fragment: (uv) => {
          const sampled = textureSample('tex_pattern', 'extended_sampler', vec2(uv.x, uv.y));
          return fragment({ color: sampled });
        },
      }),
    ]),
  ],
})
