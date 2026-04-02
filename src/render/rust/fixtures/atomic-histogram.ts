// atomic-histogram: AtomicLoadField, AtomicLoadScalar, assignResultTo.
// Two compute passes: pass 1 atomically increments per-cell counters,
// capturing old values via assignResultTo. Pass 2 reads counters via
// atomicLoad and normalizes brightness.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    cells: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      counter: { 'atomic<u32>': 0 },
      brightness: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { cell_quad: quad(0.04) },

  roster: [
    // Pass 1: Each cell atomically adds to its own counter, captures old value
    compute('accumulate', domain('cells'), wg(64), () => {
      const gid = $thread.x;
      const time = $global.time;

      // Position in grid
      const col = f32(gid % u32(8));
      const row = f32(gid / u32(8));
      $domains.cells.pos_x[gid] = (col - 3.5) * 0.22;
      $domains.cells.pos_y[gid] = (row - 3.5) * 0.22;

      // Atomically increment counter — assignResultTo captures old value
      const increment = u32(1) + gid % u32(3);
      const old_value = atomicAdd('cells:counter', gid, increment);

      // Use old_value to derive a color — demonstrates assignResultTo works
      $domains.cells.color_r[gid] = f32(old_value % u32(8)) / 8.0;
      $domains.cells.color_g[gid] = f32(old_value % u32(5)) / 5.0;
      $domains.cells.color_b[gid] = 0.5 + sin(time * 0.001 + f32(gid) * 0.3) * 0.3;

      // Read counter back via atomicLoad — demonstrates atomicLoad as expression
      const current = atomicLoad('cells:counter', gid);
      $domains.cells.brightness[gid] = clamp(f32(current) / 100.0, 0.1, 1.0);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.04, 0.04, 0.07, 1]), [
      draw('cells_fill', domainSource('cells', 'cell_quad'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.cells.pos_x[iid];
          const py = $domains.cells.pos_y[iid];
          const b = $domains.cells.brightness[iid];
          const cr = $domains.cells.color_r[iid];
          const cg = $domains.cells.color_g[iid];
          const cb = $domains.cells.color_b[iid];
          return vertex(
            vec4(position.x + px, position.y + py, 0.0, 1.0),
            { color: vec4(cr * b, cg * b, cb * b, 1.0) },
          );
        },
        fragment: (color) => {
          return fragment({ color });
        },
      }),
    ]),
  ],
})
