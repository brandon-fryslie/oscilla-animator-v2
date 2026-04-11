// galaxy-swirl: 16384 stars in a rotating galaxy with spiral arms and core glow.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 16384 } },
  domains: {
    stars: { capacity: 16384, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: { dot: quad(0.006) },

  roster: [
    compute('sim_galaxy', domain('stars'), wg(256), () => {
      const gid = $thread.x;
      const time = $global.time;
      const N = 16384.0;
      const rank = f32(gid) / N;

      // Pseudo-random per-star seed from hash
      const seed = hash_u32(gid);
      const rand1 = f32(seed & u32(65535)) / 65535.0;
      const rand2 = f32((seed >> u32(16)) & u32(65535)) / 65535.0;

      // Radial distribution: more stars near center
      const base_r = rand1 * rand1 * 0.9;
      // Base angle with spiral arm structure (2 arms)
      const arm = f32(gid % u32(2)) * 3.14159;
      const base_angle = rank * 6.283 * 8.0 + arm;
      // Spiral wind: tighter near center
      const wind = base_r * 4.5;

      // Orbit speed: faster near center (Keplerian-ish)
      const orbit_speed = 0.3 / max(sqrt(base_r), 0.05);
      const angle = base_angle + wind + time * orbit_speed;

      // Scatter: stars deviate from perfect spiral
      const scatter_r = base_r + (rand2 - 0.5) * 0.12;
      const scatter_a = angle + (rand1 - 0.5) * 0.8;

      $domains.stars.pos_x[gid] = cos(scatter_a) * scatter_r;
      $domains.stars.pos_y[gid] = sin(scatter_a) * scatter_r;

      // Size: bigger and brighter near core
      const core_glow = 1.0 / (1.0 + base_r * 8.0);
      $domains.stars.scale[gid] = 0.5 + core_glow * 1.5 + rand2 * 0.5;

      // Color: blue-white at core, gold-red at edges, occasional blue giants
      const temp = clamp(1.0 - base_r * 1.5 + rand1 * 0.3, 0.0, 1.0);
      const is_blue_giant = step(0.97, rand2);
      $domains.stars.color_r[gid] = mix(1.0, 0.6, temp) + is_blue_giant * 0.0;
      $domains.stars.color_g[gid] = mix(0.7, 0.85, temp) + is_blue_giant * 0.0;
      $domains.stars.color_b[gid] = mix(0.3, 1.0, temp) + is_blue_giant * 0.5;
      $domains.stars.color_a[gid] = (0.3 + core_glow * 0.7) * (0.7 + 0.3 * sin(time * 3.0 + rank * 100.0));
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.005, 0.003, 0.015, 1]), [
      draw('stars_fill', domainSource('stars', 'dot'), ALPHA_BLEND, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.stars.pos_x[iid];
          const py = $domains.stars.pos_y[iid];
          const sc = $domains.stars.scale[iid];
          const cr = $domains.stars.color_r[iid];
          const cg = $domains.stars.color_g[iid];
          const cb = $domains.stars.color_b[iid];
          const ca = $domains.stars.color_a[iid];
          return vertex(
            vec4(position.x * sc + px, position.y * sc + py, 0.0, 1.0),
            { color: vec4(cr, cg, cb, ca) },
          );
        },
        fragment: (color) => {
          return fragment({ color });
        },
      }),
    ]),
  ],
})
