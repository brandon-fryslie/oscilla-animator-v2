// strange-attractor: Clifford attractor — 4000 points with velocity-derived color.
// From DEMO-PATCHES.md §5: "Strange Attractor"
//
// Clifford attractor iteration:
//   x' = sin(a * y) + c * cos(a * x)
//   y' = sin(b * x) + d * cos(b * y)
//
// Each instance iterates from a rank-derived seed until it converges
// onto the attractor. Color is driven by local velocity magnitude.
// Additive blending creates a glowing trace.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 4000 } },
  domains: {
    pts: { capacity: 4000, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: { dot: quad(0.004) },

  roster: [
    compute('iterate_attractor', domain('pts'), wg(64),
      // Clifford attractor constants — animated slowly with time for morphing
      { A_BASE: -1.4, B_BASE: 1.6, C_BASE: 1.0, D_BASE: 0.7 },
      () => {
        const gid = $thread.x;
        const time = $global.time;
        const rank = f32(gid) / 4000.0;

        // Slowly morph the attractor constants
        const a = A_BASE + sin(time * 0.13) * 0.15;
        const b = B_BASE + cos(time * 0.17) * 0.12;
        const c = C_BASE + sin(time * 0.11 + 1.0) * 0.1;
        const d = D_BASE + cos(time * 0.19 + 2.0) * 0.08;

        // Seed from rank — each point starts at a different place
        let x = sin(rank * 137.5 + 0.1);
        let y = cos(rank * 97.3 + 0.2);

        // Iterate to converge onto the attractor (burn-in)
        for (let i = u32(0); i < u32(80); i = i + u32(1)) {
          const xn = sin(a * y) + c * cos(a * x);
          const yn = sin(b * x) + d * cos(b * y);
          x = xn;
          y = yn;
        }

        // Save pre-final position for velocity
        const px = x;
        const py = y;

        // One more step for velocity computation
        const fx = sin(a * y) + c * cos(a * x);
        const fy = sin(b * x) + d * cos(b * y);

        // Velocity = difference between last two positions
        const vx = fx - px;
        const vy = fy - py;
        const speed = sqrt(vx * vx + vy * vy);

        // Store final position, scaled to viewport
        $domains.pts.pos_x[gid] = fx * 0.35;
        $domains.pts.pos_y[gid] = fy * 0.35;

        // Color from velocity magnitude — spec: hue = speed * 0.3
        const hue = speed * 2.5 + time * 0.1;
        const brightness = 0.5 + clamp(speed * 3.0, 0.0, 0.5);
        $domains.pts.color_r[gid] = (sin(hue * 6.283) * 0.5 + 0.5) * brightness;
        $domains.pts.color_g[gid] = (sin(hue * 6.283 + 2.094) * 0.5 + 0.5) * brightness;
        $domains.pts.color_b[gid] = (sin(hue * 6.283 + 4.189) * 0.5 + 0.5) * brightness;
        $domains.pts.color_a[gid] = 0.15 + speed * 0.8;
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
