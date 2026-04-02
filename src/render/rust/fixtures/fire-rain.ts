// fire-rain: 12288 falling embers with heat shimmer and wind turbulence.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 12288 } },
  domains: {
    embers: { capacity: 12288, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32', rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: { spark: tri([
    -0.003, -0.010,  0.003, -0.010,  0.001, 0.010,
    -0.003, -0.010,  0.001,  0.010, -0.001, 0.010,
  ]) },

  roster: [
    compute('sim_fire', domain('embers'), wg(256), () => {
      const gid = $thread.x;
      const time = $global.time;
      const N = 12288.0;
      const rank = f32(gid) / N;

      // Hash for per-ember randomness
      const h0 = gid * u32(747796405) + u32(2891336453);
      const h1 = ((h0 >> u32(16)) ^ h0) * u32(2654435769);
      const h2 = (h1 >> u32(16)) ^ h1;
      const rand1 = f32(h2 & u32(65535)) / 65535.0;
      const rand2 = f32((h2 >> u32(16)) & u32(65535)) / 65535.0;

      // Falling: each ember has its own period
      const fall_speed = 0.3 + rand1 * 0.7;
      const fall_phase = fract(time * fall_speed * 0.15 + rand2);
      const y = 1.0 - fall_phase * 2.2;

      // Horizontal: spread across with wind turbulence
      const base_x = rand1 * 2.0 - 1.0;
      const wind = sin(time * 0.8 + y * 3.0) * 0.15;
      const turbulence = sin(y * 12.0 + time * 2.0 + rand2 * 6.283) * 0.04;
      const shimmer = cos(time * 5.0 + rank * 200.0) * 0.008;

      $domains.embers.pos_x[gid] = base_x + wind + turbulence + shimmer;
      $domains.embers.pos_y[gid] = y;

      // Rotation: tumbling as they fall
      $domains.embers.rotation[gid] = time * (2.0 + rand1 * 4.0) + rand2 * 6.283;

      // Scale: larger when fresh, shrink as they fall
      const life = 1.0 - fall_phase;
      $domains.embers.scale[gid] = (0.3 + life * 0.9) * (0.5 + rand2 * 0.5);

      // Color: white-hot → orange → red → dark as they fall
      const heat = life * life;
      $domains.embers.color_r[gid] = 0.2 + heat * 0.8;
      $domains.embers.color_g[gid] = heat * heat * 0.7 + heat * 0.2;
      $domains.embers.color_b[gid] = heat * heat * heat * 0.5;
      $domains.embers.color_a[gid] = life * (0.3 + 0.7 * sin(time * 8.0 + rank * 100.0) * 0.5 + 0.5);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.02, 0.008, 0.005, 1]), [
      draw('embers_fill', domainSource('embers', 'spark'), ALPHA_BLEND, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.embers.pos_x[iid];
          const py = $domains.embers.pos_y[iid];
          const sc = $domains.embers.scale[iid];
          const rot = $domains.embers.rotation[iid];
          const cr = $domains.embers.color_r[iid];
          const cg = $domains.embers.color_g[iid];
          const cb = $domains.embers.color_b[iid];
          const ca = $domains.embers.color_a[iid];
          const c = cos(rot);
          const s = sin(rot);
          const lx = position.x * sc;
          const ly = position.y * sc;
          return vertex(
            vec4(lx * c - ly * s + px, lx * s + ly * c + py, 0.0, 1.0),
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
