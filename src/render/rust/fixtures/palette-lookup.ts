// palette-lookup: IndexAccess on arrays, nested Construct, computed index via BinaryOp.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    dots: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_quad: quad(0.03) },

  roster: [
    compute('eval_palette', domain('dots'), wg(64), () => {
      const gid = $thread.x;
      const time = $global.time;
      const col = gid % u32(8);
      const row = gid / u32(8);
      $domains.dots.pos_x[gid] = (f32(col) - 3.5) * 0.22;
      $domains.dots.pos_y[gid] = (f32(row) - 3.5) * 0.22;

      // Build a palette as nested Construct
      const palette = vec4(
        sin(time) * 0.5 + 0.5,
        sin(time + 2.094) * 0.5 + 0.5,
        sin(time + 4.189) * 0.5 + 0.5,
        1.0,
      );

      // IndexAccess: pick a channel using computed index
      const channel_idx = gid % u32(3);
      const value = palette[channel_idx];

      // Nested Construct: build color from swizzled components
      const color = vec4(
        palette.x * value,
        palette.y * (1.0 - value),
        palette.z,
        1.0,
      );

      $domains.dots.color_r[gid] = color.x;
      $domains.dots.color_g[gid] = color.y;
      $domains.dots.color_b[gid] = color.z;
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', clearTarget([0.04, 0.04, 0.07, 1]), [
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
