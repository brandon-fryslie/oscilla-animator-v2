// texture-array-alloc: Allocation-only proof for 2d-array and cube-array view dimensions.
// The current shader IR does not yet expose array-layer-aware texture sampling,
// so this fixture validates MMU allocation while rendering a normal canvas pass.
gpu({
  textures: {
    layer_tex: {
      dimension: '2d-array',
      width: 64,
      height: 64,
      depthOrArrayLayers: 4,
      format: 'rgba8unorm',
      usage: ['sampled'],
    },
    cube_array_tex: {
      dimension: 'cube-array',
      width: 32,
      height: 32,
      depthOrArrayLayers: 12,
      format: 'rgba8unorm',
      usage: ['sampled'],
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
              0.18 + uv.x * 0.72,
              0.22 + uv.y * 0.48,
              0.8 - uv.x * 0.28,
              1.0,
            ),
          });
        },
      }),
    ]),
  ],
})
