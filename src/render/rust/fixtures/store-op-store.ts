// store-op-store: Explicit storeOp on an offscreen color target, then sample it in a composite pass.
// This validates the new storeOp field on a deterministic path (`store`), while `discard`
// remains intentionally unsuitable for visual equality because the retained contents are undefined.
gpu({
  textures: {
    store_tex: {
      dimension: '2d',
      width: { relativeTo: 'canvas', scale: 1 },
      height: { relativeTo: 'canvas', scale: 1 },
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
    render('paint_store_tex', ortho(), {
      colors: [{ textureId: 'store_tex', loadOp: 'clear', storeOp: 'store', clearColor: [0.06, 0.08, 0.14, 1.0] }],
    }, [
      draw('store_fill', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const uvx = position.x * 0.5 + 0.5;
          const uvy = position.y * 0.5 + 0.5;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({
            color: vec4(
              0.18 + uv.y * 0.35,
              uv.x,
              0.9 - uv.y * 0.5,
              1.0,
            ),
          });
        },
      }),
    ]),
    composite('present', clearTarget([0.01, 0.01, 0.02, 1.0]), [
      draw('present_store_tex', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const uvx = position.x * 0.5 + 0.5;
          const uvy = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({ color: textureSample('store_tex', 'nearest', vec2(uv.x, uv.y)) });
        },
      }),
    ]),
  ],
})
