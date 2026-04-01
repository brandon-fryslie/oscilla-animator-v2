// conditional-ring: If, Var, Assign, LiteralBool, BinaryOp(==, !=, &&, ||, %), UnaryOp(!).
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    dots: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: { f32: 1 }, color_g: { f32: 1 }, color_b: { f32: 1 },
    }},
  },
  shapes: { unit_quad: quad(0.03) },

  roster: [
    compute('eval_conditional', domain('dots'), wg(64), () => {
      const gid = $thread.x;
      const time = $global.time;
      const angle = f32(gid) * 0.09817477042468103 + time;
      $domains.dots.pos_x[gid] = cos(angle) * 0.7;
      $domains.dots.pos_y[gid] = sin(angle) * 0.7;

      let highlight = true;
      const isEven = gid % u32(2) === u32(0);
      const isNotFirst = gid !== u32(0);
      const isEdge = !isNotFirst || gid === u32(63);

      if (isEdge) {
        highlight = false;
      }

      if (highlight && isEven) {
        $domains.dots.color_r[gid] = 0.2;
        $domains.dots.color_g[gid] = 0.5;
        $domains.dots.color_b[gid] = 1.0;
      } else {
        $domains.dots.color_r[gid] = 1.0;
        $domains.dots.color_g[gid] = 0.3;
        $domains.dots.color_b[gid] = 0.2;
      }
    }),
    drawPrep('prep_dots', 'sys:active', 6),
    render('draw_dots', clearTarget([0.05, 0.05, 0.07, 1]), [
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
