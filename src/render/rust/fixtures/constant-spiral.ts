// constant-spiral: Constants map, LiteralI32, deeply nested expressions.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 128 } },
  domains: {
    pts: { capacity: 128, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { dot: quad(0.012) },

  roster: [
    compute('eval_spiral', domain('pts'), wg(64),
      { RADIUS: 0.7, TWIST: 12.566370614359172, ARMS: 3 },
      () => {
        const gid = $thread.x;
        const time = $global.time;
        const rank = f32(gid) / 128.0;

        // Deeply nested expression: spiral with twist and multi-arm offset
        // i32(3) produces LiteralI32; i32(gid) produces Cast('i32', VarRef)
        const arm = f32(i32(gid) % i32(3));
        const arm_offset = arm * 2.094;
        const t = rank * TWIST + time + arm_offset;
        const r = rank * RADIUS;
        $domains.pts.pos_x[gid] = cos(t) * r;
        $domains.pts.pos_y[gid] = sin(t) * r;

        // Color from deeply nested chain
        $domains.pts.color_r[gid] = sin(rank * 6.283 + arm_offset) * 0.5 + 0.5;
        $domains.pts.color_g[gid] = sin(rank * 6.283 + arm_offset + 2.094) * 0.5 + 0.5;
        $domains.pts.color_b[gid] = sin(rank * 6.283 + arm_offset + 4.189) * 0.5 + 0.5;
      },
    ),
    drawPrep('prep', 'sys:active', 6),
    render('draw', clearTarget([0.02, 0.02, 0.05, 1]), [
      draw('pts_fill', domainSource('pts', 'dot'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.pts.pos_x[iid];
          const py = $domains.pts.pos_y[iid];
          const cr = $domains.pts.color_r[iid];
          const cg = $domains.pts.color_g[iid];
          const cb = $domains.pts.color_b[iid];
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
