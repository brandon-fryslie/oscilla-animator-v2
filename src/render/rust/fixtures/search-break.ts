// search-break: For+If+Break (early exit), Continue, BinaryOp(<=, >).
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 32 } },
  domains: {
    bars: { capacity: 32, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_quad: quad(0.03) },

  roster: [
    compute('eval_search', domain('bars'), wg(32), () => {
      const gid = $thread.x;
      const time = $global.time;
      $domains.bars.pos_x[gid] = f32(gid) * 0.0625 - 0.96875;
      $domains.bars.pos_y[gid] = 0.0;

      let brightness = 0.1;

      for (let i = u32(0); i <= u32(15); i = i + u32(1)) {
        const sample = sin(time + f32(i) * 0.3 + f32(gid) * 0.1);
        if (sample <= 0.0) {
          continue;
        }
        if (sample > 0.8) {
          brightness = f32(i) / 15.0;
          break;
        }
      }

      $domains.bars.color_r[gid] = brightness;
      $domains.bars.color_g[gid] = brightness * 0.5;
      $domains.bars.color_b[gid] = brightness * 0.2;
    }),
    drawPrep('prep_bars', 'sys:active', 6),
    render('draw_bars', ortho(), clearTarget([0.02, 0.02, 0.05, 1]), [
      draw('bars_fill', domainSource('bars', 'unit_quad'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.bars.pos_x[iid];
          const py = $domains.bars.pos_y[iid];
          const cr = $domains.bars.color_r[iid];
          const cg = $domains.bars.color_g[iid];
          const cb = $domains.bars.color_b[iid];
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
