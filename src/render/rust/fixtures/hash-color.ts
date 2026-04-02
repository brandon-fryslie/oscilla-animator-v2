// hash-color: 64 instances with PCG-hash-derived colors in 8x8 grid.
gpu({
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    dots: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { quad: quad(0.04) },

  roster: [
    compute('hash_colors', domain('dots'), wg(64), () => {
      const gid = $thread.x;
      const col = gid % u32(8);
      const row = gid / u32(8);
      $domains.dots.pos_x[gid] = (f32(col) - 3.5) * 0.2;
      $domains.dots.pos_y[gid] = (f32(row) - 3.5) * 0.2;
      const h0 = gid * u32(747796405) + u32(2891336453);
      const h1 = ((h0 >> u32(16)) ^ h0) * u32(2654435769);
      const h2 = (h1 >> u32(16)) ^ h1;
      $domains.dots.color_r[gid] = f32(h2 & u32(255)) / 255.0;
      $domains.dots.color_g[gid] = f32((h2 >> u32(8)) & u32(255)) / 255.0;
      $domains.dots.color_b[gid] = f32((h2 >> u32(16)) & u32(255)) / 255.0;
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.08, 0.08, 0.1, 1]), [
      draw('dots_fill', domainSource('dots', 'quad'), OPAQUE, {
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
