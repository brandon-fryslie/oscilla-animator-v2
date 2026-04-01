// strange-attractor: Clifford attractor with slow rotation and twinkling lifecycle.
// From DEMO-PATCHES.md §5: "Strange Attractor"
//
// Points are FIXED on the attractor (no seed animation — chaos amplifies
// any change into wild jitter). Animation comes from:
//   1. Slow global rotation of the entire shape
//   2. Per-point lifecycle fading (twinkle)
//   3. Slow color cycling
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 4000 } },
  domains: {
    pts: { capacity: 4000, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      next_x: 'f32', next_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: {
    segment: {
      topology: 'line-list',
      vertexLayout: {
        stride: 8,
        attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
      },
      vertexData: [0.0, 0.0, 1.0, 0.0],
    },
  },

  roster: [
    compute('iterate_attractor', domain('pts'), wg(256),
      { A: -1.4, B: 1.6, C: 1.0, D: 0.7 },
      () => {
        const gid = $thread.x;
        const time = $global.time;
        const rank = f32(gid) / 4000.0;

        // Fixed seed — NO time dependency in attractor math
        let x = sin(rank * 137.5 + 0.1);
        let y = cos(rank * 97.3 + 0.2);

        // Burn-in
        for (let i = u32(0); i < u32(200); i = i + u32(1)) {
          const xn = sin(A * y) + C * cos(A * x);
          const yn = sin(B * x) + D * cos(B * y);
          x = xn;
          y = yn;
        }

        // Store positions (unscaled — rotation applied in vertex shader)
        $domains.pts.pos_x[gid] = x;
        $domains.pts.pos_y[gid] = y;

        const nx = sin(A * y) + C * cos(A * x);
        const ny = sin(B * x) + D * cos(B * y);
        $domains.pts.next_x[gid] = nx;
        $domains.pts.next_y[gid] = ny;

        // Lifecycle twinkle: staggered per-point fade
        const life = fract(rank * 5.0 + time * 0.0003);
        const fade = 1.0 - life * life;

        // Color: rainbow along rank, very slow hue rotation
        const hue = rank + time * 0.00002;
        $domains.pts.color_r[gid] = (sin(hue * 6.283) * 0.4 + 0.5) * fade;
        $domains.pts.color_g[gid] = (sin(hue * 6.283 + 2.094) * 0.4 + 0.5) * fade;
        $domains.pts.color_b[gid] = (sin(hue * 6.283 + 4.189) * 0.4 + 0.5) * fade;
        $domains.pts.color_a[gid] = fade * 0.012;
      },
    ),
    drawPrep('prep', 'sys:active', 2),
    render('draw', clearTarget([0.008, 0.005, 0.018, 1]), [
      draw('pts_fill', domainSource('pts', 'segment'),
        { blendMode: 'additive', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        {
          vertex: (position) => {
            const iid = $instance.index;
            const time = $global.time;
            const t = position.x;
            const x0 = $domains.pts.pos_x[iid];
            const y0 = $domains.pts.pos_y[iid];
            const x1 = $domains.pts.next_x[iid];
            const y1 = $domains.pts.next_y[iid];
            const ax = (x0 * (1.0 - t) + x1 * t) * 0.35;
            const ay = (y0 * (1.0 - t) + y1 * t) * 0.35;
            // Slow global rotation
            const angle = time * 0.00005;
            const c = cos(angle);
            const s = sin(angle);
            const px = ax * c - ay * s;
            const py = ax * s + ay * c;
            const cr = $domains.pts.color_r[iid];
            const cg = $domains.pts.color_g[iid];
            const cb = $domains.pts.color_b[iid];
            const ca = $domains.pts.color_a[iid];
            return vertex(
              vec4(px, py, 0.0, 1.0),
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
