// scalar-accumulator: LoadScalar as expression. Phase from scalar read drives ring rotation.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: {
    'sys:active': { u32: 64 },
    'sys:phase': { f32: 0 },
  },
  domains: {
    dots: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_quad: quad(0.03) },

  roster: [
    compute('update_phase', exact(1), wg(1), () => {
      const time = $global.time;
      $scalar.phase = sin(time) * 3.14159;
    }),
    compute('eval_dots', domain('dots'), wg(64), () => {
      const gid = $thread.x;
      const phase = $scalar.phase;
      const angle = f32(gid) * 0.09817477042468103 + phase;
      $domains.dots.pos_x[gid] = cos(angle) * 0.7;
      $domains.dots.pos_y[gid] = sin(angle) * 0.7;
      $domains.dots.color_r[gid] = sin(angle) * 0.5 + 0.5;
      $domains.dots.color_g[gid] = sin(angle + 2.094) * 0.5 + 0.5;
      $domains.dots.color_b[gid] = sin(angle + 4.189) * 0.5 + 0.5;
    }),
    drawPrep('prep_dots', 'sys:active', 6),
    render('draw_dots', ortho(), clearTarget([0.04, 0.04, 0.08, 1]), [
      draw('dots_fill', domainSource('dots', 'unit_quad'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.dots.pos_x[iid];
          const py = $domains.dots.pos_y[iid];
          const cr = $domains.dots.color_r[iid];
          const cg = $domains.dots.color_g[iid];
          const cb = $domains.dots.color_b[iid];
          return vertex(
            vec4(position.x + px, position.y + py, 0.0, 1.0),
            { color: vec4(cr, cg, cb, 1.0) },
          );
        },
        fragment: (color) => {
          return fragment({ color });
        },
      }),
    ]),
  ],
})
