// strange-attractor: Clifford attractor with flowing motion and lifecycle fading.
// From DEMO-PATCHES.md §5: "Strange Attractor"
//
// Each point's seed shifts with time → apparent flow along the attractor.
// Each point has a staggered lifecycle that fades it out and resets,
// creating a streaming, breathing effect.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 12000 } },
  domains: {
    pts: { capacity: 12000, active: 'sys:active', fields: {
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
        const rank = f32(gid) / 12000.0;

        // Flowing seed: shifts with time so points stream along the attractor
        const moving_rank = fract(rank + time * 0.000005);

        // Seed from moving_rank
        let x = sin(moving_rank * 137.5 + 0.1);
        let y = cos(moving_rank * 97.3 + 0.2);

        // Burn-in to converge onto attractor
        for (let i = u32(0); i < u32(200); i = i + u32(1)) {
          const xn = sin(A * y) + C * cos(A * x);
          const yn = sin(B * x) + D * cos(B * y);
          x = xn;
          y = yn;
        }

        // Current position
        $domains.pts.pos_x[gid] = x * 0.35;
        $domains.pts.pos_y[gid] = y * 0.35;

        // Next iteration → line endpoint
        const nx = sin(A * y) + C * cos(A * x);
        const ny = sin(B * x) + D * cos(B * y);
        $domains.pts.next_x[gid] = nx * 0.35;
        $domains.pts.next_y[gid] = ny * 0.35;

        // Lifecycle: staggered birth/death, each point fades independently
        const life = fract(rank * 3.0 + time * 0.0001);
        const fade = (1.0 - life) * (1.0 - life);

        // Color: rainbow along rank, brightness modulated by lifecycle
        const hue = rank + time * 0.001;
        const brightness = 0.5 + 0.5 * fade;
        $domains.pts.color_r[gid] = (sin(hue * 6.283) * 0.4 + 0.5) * brightness;
        $domains.pts.color_g[gid] = (sin(hue * 6.283 + 2.094) * 0.4 + 0.5) * brightness;
        $domains.pts.color_b[gid] = (sin(hue * 6.283 + 4.189) * 0.4 + 0.5) * brightness;
        $domains.pts.color_a[gid] = fade * 0.04;
      },
    ),
    drawPrep('prep', 'sys:active', 2),
    render('draw', clearTarget([0.008, 0.005, 0.018, 1]), [
      draw('pts_fill', domainSource('pts', 'segment'),
        { blendMode: 'additive', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        {
          vertex: (position) => {
            const iid = $instance.index;
            const t = position.x;
            const x0 = $domains.pts.pos_x[iid];
            const y0 = $domains.pts.pos_y[iid];
            const x1 = $domains.pts.next_x[iid];
            const y1 = $domains.pts.next_y[iid];
            const px = x0 * (1.0 - t) + x1 * t;
            const py = y0 * (1.0 - t) + y1 * t;
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
