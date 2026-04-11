// sdf-circle: Anti-aliased SDF circle with fragment derivatives.
gpu({
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    tri: { capacity: 1, active: 'sys:active', fields: {
      _pad: 'f32',
    }},
  },
  shapes: { fullscreen_triangle: tri([-1.0, -1.0, 3.0, -1.0, -1.0, 3.0]) },

  roster: [
    compute('set_active', exact(1), wg(1), () => {
      $scalar.active = u32(1);
    }),
    drawPrep('prep', 'sys:active', 3),
    render('draw', ortho(), clearTarget([0.02, 0.02, 0.03, 1.0]), [
      draw('sdf_circle', domainSource('tri', 'fullscreen_triangle'), OPAQUE, {
        vertex: (position) => {
          return vertex(
            vec4(position.x, position.y, 0.0, 1.0),
            { uv: vec4(position.x * 0.5 + 0.5, 1.0 - (position.y * 0.5 + 0.5), 0.0, 0.0) },
          );
        },
        fragment: (uv) => {
          const centered = vec2(uv.x - 0.5, uv.y - 0.5);
          const distance_to_edge = length(centered) - 0.3;
          const grad_x = dpdx(distance_to_edge);
          const grad_y = dpdy(distance_to_edge);
          const width_auto = fwidth(distance_to_edge);
          const width_manual = max(abs(grad_x), abs(grad_y));
          const aa_width = max(max(width_auto, width_manual), 0.0008);
          const coverage = 1.0 - smoothstep(-aa_width, aa_width, distance_to_edge);
          return fragment({
            color: vec4(
              0.1 + coverage * 0.85,
              0.2 + coverage * 0.55,
              0.35 + coverage * 0.35,
              1.0,
            ),
          });
        },
      }),
    ]),
  ],
})
