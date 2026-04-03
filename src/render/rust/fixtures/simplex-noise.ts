// simplex-noise: 10000 dots colored by noise_simplex_2d. Tests stdlib transplant.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 10000 } },
  domains: {
    dots: { capacity: 10000, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { dot: quad(0.012) },

  roster: [
    compute('sim', domain('dots'), wg(256), () => {
      const gid = $thread.x;
      const time = $global.time;
      const N = 10000.0;
      const rank = f32(gid) / N;

      // Grid layout
      const col = f32(gid % u32(100));
      const row = f32(gid / u32(100));
      const x = col / 50.0 - 1.0;
      const y = row / 50.0 - 1.0;

      // Noise-driven displacement
      const n = noise_simplex_2d(vec2(x * 3.0 + time * 0.5, y * 3.0));
      const n2 = noise_simplex_2d(vec2(y * 4.0 - time * 0.3, x * 4.0));

      $domains.dots.pos_x[gid] = x + n * 0.08;
      $domains.dots.pos_y[gid] = y + n2 * 0.08;

      // Color from noise
      const hue = n * 0.5 + 0.5;
      $domains.dots.color_r[gid] = sin(hue * 6.283) * 0.5 + 0.5;
      $domains.dots.color_g[gid] = sin(hue * 6.283 + 2.094) * 0.5 + 0.5;
      $domains.dots.color_b[gid] = sin(hue * 6.283 + 4.189) * 0.5 + 0.5;
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.02, 0.02, 0.04, 1]), [
      draw('dots_fill', domainSource('dots', 'dot'), OPAQUE, {
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
