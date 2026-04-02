// atomic-boids: 10,000 boids with atomic grid_cell. Tests AtomicOpField(Exchange).
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 10000 } },
  domains: {
    boids: { capacity: 10000, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      grid_cell: { 'atomic<u32>': 0 },
      cell_val: 'f32',
    }},
  },
  shapes: { dot: quad(0.003) },

  roster: [
    compute('sim_boids', domain('boids'), wg(256), () => {
      const gid = $thread.x;
      const time = $global.time;
      const fi = f32(gid);
      const angle = fi * 0.0006283185307179586 + time;
      const radius = 0.3 + sin(fi * 0.01 + time * 2.0) * 0.5;
      $domains.boids.pos_x[gid] = cos(angle) * radius;
      $domains.boids.pos_y[gid] = sin(angle) * radius;
      const cell_value = gid % u32(16) + u32(1);
      atomicExchange('boids:grid_cell', gid, cell_value);
      $domains.boids.cell_val[gid] = f32(cell_value);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.02, 0.02, 0.04, 1]), [
      draw('boids_fill', domainSource('boids', 'dot'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.boids.pos_x[iid];
          const py = $domains.boids.pos_y[iid];
          const cell = $domains.boids.cell_val[iid];
          const intensity = cell / 16.0;
          return vertex(
            vec4(position.x + px, position.y + py, 0.0, 1.0),
            { color: vec4(intensity, intensity * 0.7, 1.0, 1.0) },
          );
        },
        fragment: (color) => {
          return fragment({ color });
        },
      }),
    ]),
  ],
})
