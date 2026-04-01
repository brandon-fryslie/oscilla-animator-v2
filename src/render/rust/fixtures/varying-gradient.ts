// varying-gradient: Per-vertex color as varying, GPU-interpolated.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    tri: { capacity: 1, active: 'sys:active', fields: {
      _pad: 'f32',
    }},
  },
  shapes: { big_triangle: tri([0.0, 0.8, -0.8, -0.6, 0.8, -0.6]) },

  roster: [
    compute('setup', exact(1), wg(1), () => {
      $scalar.active = u32(1);
    }),
    drawPrep('prep', 'sys:active', 3),
    render('draw', ortho(), clearTarget([0.05, 0.05, 0.07, 1]), [
      draw('gradient_tri', domainSource('tri', 'big_triangle'), OPAQUE, {
        vertex: (position) => {
          const vid = $vertex.index;
          const phase = f32(vid) * 2.094;
          const vcolor = vec4(
            sin(phase) * 0.5 + 0.5,
            sin(phase + 2.094) * 0.5 + 0.5,
            sin(phase + 4.189) * 0.5 + 0.5,
            1.0,
          );
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { color: vcolor });
        },
        fragment: (color) => {
          return fragment({ color });
        },
      }),
    ]),
  ],
})
