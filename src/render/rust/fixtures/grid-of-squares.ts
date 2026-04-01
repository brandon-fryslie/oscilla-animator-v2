// grid-of-squares: 100 rotating squares in a 10x10 grid with rainbow HSL color.
// From DEMO-PATCHES.md §1: "Grid of Squares"
//
// Primary exercise: rank and index as Field intrinsics; per-instance
// uniqueness from pure math; Scalar (time) mixing with a Field.
//
// Layout is pure index arithmetic — no GridLayout block.
// Rotation speed is constant but angle is unique per instance.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 100 } },
  domains: {
    squares: { capacity: 100, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { rect: quad(0.035) },

  roster: [
    compute('eval_grid', domain('squares'), wg(64), () => {
      const gid = $thread.x;
      const time = $global.time;
      const rank = f32(gid) / 100.0;

      // Grid layout from index arithmetic
      const col = f32(gid % u32(10));
      const row = f32(gid / u32(10));
      $domains.squares.pos_x[gid] = (col - 4.5) * 0.18;
      $domains.squares.pos_y[gid] = (row - 4.5) * 0.18;

      // Per-instance rotation: unique angle + shared speed
      $domains.squares.rotation[gid] = f32(gid) * 0.5 + time * 2.0;

      // HSL to RGB: hue = rank + time * 0.2, S=0.8, L=0.6
      const hue = fract(rank + time * 0.2);
      const h6 = hue * 6.0;

      // HSL conversion: S=0.8, L=0.6 → chroma=0.8*(1-|2*0.6-1|)=0.64
      const chroma = 0.64;
      const x = chroma * (1.0 - abs(h6 % 2.0 - 1.0));
      const m = 0.28;

      // Select RGB based on hue sextant using step functions
      // Sector 0 [0,1): R=C, G=X, B=0
      // Sector 1 [1,2): R=X, G=C, B=0
      // Sector 2 [2,3): R=0, G=C, B=X
      // Sector 3 [3,4): R=0, G=X, B=C
      // Sector 4 [4,5): R=X, G=0, B=C
      // Sector 5 [5,6): R=C, G=0, B=X
      const s0 = step(0.0, h6) * (1.0 - step(1.0, h6));
      const s1 = step(1.0, h6) * (1.0 - step(2.0, h6));
      const s2 = step(2.0, h6) * (1.0 - step(3.0, h6));
      const s3 = step(3.0, h6) * (1.0 - step(4.0, h6));
      const s4 = step(4.0, h6) * (1.0 - step(5.0, h6));
      const s5 = step(5.0, h6) * (1.0 - step(6.0, h6));

      $domains.squares.color_r[gid] = m + chroma * (s0 + s5) + x * (s1 + s4);
      $domains.squares.color_g[gid] = m + chroma * (s1 + s2) + x * (s0 + s3);
      $domains.squares.color_b[gid] = m + chroma * (s3 + s4) + x * (s2 + s5);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', clearTarget([0.06, 0.06, 0.08, 1]), [
      draw('squares_fill', domainSource('squares', 'rect'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.squares.pos_x[iid];
          const py = $domains.squares.pos_y[iid];
          const rot = $domains.squares.rotation[iid];
          const cr = $domains.squares.color_r[iid];
          const cg = $domains.squares.color_g[iid];
          const cb = $domains.squares.color_b[iid];
          const c = cos(rot);
          const s = sin(rot);
          const lx = position.x;
          const ly = position.y;
          return vertex(
            vec4(lx * c - ly * s + px, lx * s + ly * c + py, 0.0, 1.0),
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
