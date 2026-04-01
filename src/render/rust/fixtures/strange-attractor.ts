// strange-attractor: Clifford attractor traced as a continuous line.
// From DEMO-PATCHES.md §5: "Strange Attractor"
//
// Instead of scattered dots, each instance IS a vertex on a continuous
// line strip. Instance 0 is step 0 of the iteration, instance 1 is
// step 1, etc. The GPU draws them as a connected path.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 32768 } },
  domains: {
    pts: { capacity: 32768, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  // Single vertex per instance — the "shape" is just a point, rendered as dots
  shapes: { dot: quad(0.0012) },

  roster: [
    compute('iterate_attractor', domain('pts'), wg(256),
      { A: -1.4, B: 1.6, C: 1.0, D: 0.7 },
      () => {
        const gid = $thread.x;
        const time = $global.time;
        const rank = f32(gid) / 32768.0;

        // Each instance iterates from a SHARED starting point but for
        // a different number of steps. This makes the line trace the
        // attractor path sequentially: instance 0 = step 0, instance 1 = step 1, etc.
        //
        // We use 4 trajectory segments (8192 points each) starting from
        // different seeds to fill the attractor more evenly.
        const segment = gid / u32(8192);
        const step = gid % u32(8192);

        // Seed per segment
        let x = sin(f32(segment) * 2.1 + 0.5);
        let y = cos(f32(segment) * 3.7 + 0.3);

        // Burn-in: converge to attractor from seed
        for (let i = u32(0); i < u32(100); i = i + u32(1)) {
          const xn = sin(A * y) + C * cos(A * x);
          const yn = sin(B * x) + D * cos(B * y);
          x = xn;
          y = yn;
        }

        // Now iterate `step` more times to reach this instance's position
        for (let i = u32(0); i < step; i = i + u32(1)) {
          const xn = sin(A * y) + C * cos(A * x);
          const yn = sin(B * x) + D * cos(B * y);
          x = xn;
          y = yn;
        }

        $domains.pts.pos_x[gid] = x * 0.35;
        $domains.pts.pos_y[gid] = y * 0.35;

        // Color: smooth gradient along the trajectory
        const hue = rank + time * 0.05;
        $domains.pts.color_r[gid] = sin(hue * 6.283) * 0.4 + 0.5;
        $domains.pts.color_g[gid] = sin(hue * 6.283 + 2.094) * 0.4 + 0.5;
        $domains.pts.color_b[gid] = sin(hue * 6.283 + 4.189) * 0.4 + 0.5;
        $domains.pts.color_a[gid] = 0.15;
      },
    ),
    drawPrep('prep', 'sys:active', 6),
    render('draw', clearTarget([0.01, 0.008, 0.02, 1]), [
      draw('pts_fill', domainSource('pts', 'dot'),
        { blendMode: 'additive', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        {
          vertex: (position) => {
            const iid = $instance.index;
            const px = $domains.pts.pos_x[iid];
            const py = $domains.pts.pos_y[iid];
            const cr = $domains.pts.color_r[iid];
            const cg = $domains.pts.color_g[iid];
            const cb = $domains.pts.color_b[iid];
            const ca = $domains.pts.color_a[iid];
            return vertex(
              vec4(position.x + px, position.y + py, 0.0, 1.0),
              { color: vec4(cr, cg, cb, ca) },
            );
          },
          fragment: (color) => {
            return fragment({ color });
          },
        },
      ),
    ]),
  ],
})
