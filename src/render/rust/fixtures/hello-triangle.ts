// hello-triangle: Compute writes time-varying RGB, render draws a colored triangle.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:tri_active': { u32: 1 } },
  domains: {
    tri: { capacity: 1, active: 'sys:tri_active', fields: {
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_triangle: tri([0.0, 0.5, -0.5, -0.5, 0.5, -0.5]) },

  roster: [
    compute('eval_color', exact(1), wg(1), () => {
      const time = $global.time;
      $domains.tri.color_r[0] = sin(time) * 0.5 + 0.5;
      $domains.tri.color_g[0] = sin(time + 2.094) * 0.5 + 0.5;
      $domains.tri.color_b[0] = sin(time + 4.189) * 0.5 + 0.5;
      $domains.tri.$active = u32(1);
    }),
    drawPrep('prep_tri', 'sys:tri_active', 3),
    render('draw', clearTarget([0, 0, 0, 1]), [
      draw('tri_fill', domainSource('tri', 'unit_triangle'), OPAQUE, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
        },
        fragment: () => {
          const r = $domains.tri.color_r[0];
          const g = $domains.tri.color_g[0];
          const b = $domains.tri.color_b[0];
          return fragment({ color: vec4(r, g, b, 1.0) });
        },
      }),
    ]),
  ],
})
