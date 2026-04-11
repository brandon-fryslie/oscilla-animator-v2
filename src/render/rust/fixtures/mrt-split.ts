// mrt-split: Two MRT attachments with attachment-local blend/write masks,
// then composited side-by-side so both surfaces are directly visible.
// Expected image: left half shows a teal base buffer with fixed green channel;
// right half shows a brighter additive light buffer.
gpu({
  textures: {
    base_tex: {
      dimension: '2d',
      width: { relativeTo: 'canvas', scale: 1 },
      height: { relativeTo: 'canvas', scale: 1 },
      format: 'rgba8unorm',
      usage: ['render_attachment', 'sampled'],
    },
    light_tex: {
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
    render('build_gbuffer', ortho(), {
      colors: [
        {
          textureId: 'base_tex',
          loadOp: 'clear',
          clearColor: [0.04, 0.56, 0.08, 1.0],
          blendMode: 'opaque',
          writeMask: ['r', 'b', 'a'],
        },
        {
          textureId: 'light_tex',
          loadOp: 'clear',
          clearColor: [0.02, 0.02, 0.03, 1.0],
          blendMode: 'additive',
          writeMask: ['r', 'g', 'b'],
        },
      ],
    }, [
      draw('seed_buffers', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const uvx = position.x * 0.5 + 0.5;
          const uvy = position.y * 0.5 + 0.5;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({
            base: vec4(0.18 + uv.x * 0.72, uv.y, 0.28 + uv.y * 0.45, 1.0),
            light: vec4(0.16, 0.06 + uv.x * 0.08, 0.0, 0.0),
          });
        },
      }),
      draw('accumulate_light', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const uvx = position.x * 0.5 + 0.5;
          const uvy = position.y * 0.5 + 0.5;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          const stripe = 1.0 - step(0.12, abs(uv.x - 0.5));
          return fragment({
            base: vec4(0.0, 1.0, stripe, 1.0),
            light: vec4(0.0, 0.14 + stripe * 0.48, 0.22 + uv.y * 0.32, 0.0),
          });
        },
      }),
    ]),
    composite('present', clearTarget([0.01, 0.01, 0.02, 1.0]), [
      draw('show_base', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const x = position.x * 0.5 - 0.5;
          const uvx = position.x * 0.5 + 0.5;
          const uvy = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({ color: textureSample('base_tex', 'nearest', vec2(uv.x, uv.y)) });
        },
      }),
      draw('show_light', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const x = position.x * 0.5 + 0.5;
          const uvx = position.x * 0.5 + 0.5;
          const uvy = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(x, position.y, 0.0, 1.0), { uv: vec4(uvx, uvy, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({ color: textureSample('light_tex', 'nearest', vec2(uv.x, uv.y)) });
        },
      }),
    ]),
  ],
})
