// spirograph-trace: 1000 points tracing a hypotrochoid, rainbow color, alpha blend.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1000 } },
  domains: {
    pts: { capacity: 1000, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: { f32: 1 }, color_g: { f32: 1 }, color_b: { f32: 1 },
    }},
  },
  shapes: { point_quad: quad(0.005) },

  roster: [
    compute('eval_spirograph', domain('pts'), wg(64), () => {
      const gid = $thread.x;
      const time = $global.time;
      const rank = f32(gid) / 1000.0;
      const t = rank * 50.26548245743669 + time;
      const inner = 1.625 * t;
      $domains.pts.pos_x[gid] = (0.7222222222222222 * cos(t) + 0.2777777777777778 * cos(inner)) * 0.82;
      $domains.pts.pos_y[gid] = (0.7222222222222222 * sin(t) - 0.2777777777777778 * sin(inner)) * 0.82;
      const hue_angle = rank * 6.283185307179586;
      $domains.pts.color_r[gid] = sin(hue_angle) * 0.5 + 0.5;
      $domains.pts.color_g[gid] = sin(hue_angle + 2.094) * 0.5 + 0.5;
      $domains.pts.color_b[gid] = sin(hue_angle + 4.189) * 0.5 + 0.5;
    }),
    drawPrep('prep_pts', 'sys:active', 6),
    render('draw_pts', ortho(), clearTarget([0.02, 0.02, 0.04, 1]), [
      draw('pts_fill', domainSource('pts', 'point_quad'), ALPHA_BLEND, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.pts.pos_x[iid];
          const py = $domains.pts.pos_y[iid];
          const cr = $domains.pts.color_r[iid];
          const cg = $domains.pts.color_g[iid];
          const cb = $domains.pts.color_b[iid];
          return vertex(
            vec4(position.x + px, position.y + py, 0.0, 1.0),
            { color: vec4(cr, cg, cb, 0.85) },
          );
        },
        fragment: (color) => {
          return fragment({ color });
        },
      }),
    ]),
  ],
})
