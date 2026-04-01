// test-additive-lines: 16 line segments with additive blending. Tests lines + additive together.
gpu({
  scalars: { 'sys:active': { u32: 16 } },
  domains: {
    lines: { capacity: 16, active: 'sys:active', fields: {
      x0: 'f32', y0: 'f32',
      x1: 'f32', y1: 'f32',
    }},
  },
  shapes: {
    seg: {
      topology: 'line-list',
      vertexLayout: {
        stride: 8,
        attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
      },
      vertexData: [0.0, 0.0, 1.0, 0.0],
    },
  },

  roster: [
    compute('setup', domain('lines'), wg(16), () => {
      const gid = $thread.x;
      const angle = f32(gid) * 0.3927;
      const r = 0.6;
      $domains.lines.x0[gid] = cos(angle) * r * 0.2;
      $domains.lines.y0[gid] = sin(angle) * r * 0.2;
      $domains.lines.x1[gid] = cos(angle) * r;
      $domains.lines.y1[gid] = sin(angle) * r;
    }),
    drawPrep('prep', 'sys:active', 2),
    render('draw', clearTarget([0.0, 0.0, 0.0, 1]), [
      draw('lines_draw', domainSource('lines', 'seg'),
        { blendMode: 'additive', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        {
          vertex: (position) => {
            const iid = $instance.index;
            const ax = $domains.lines.x0[iid];
            const ay = $domains.lines.y0[iid];
            const bx = $domains.lines.x1[iid];
            const by = $domains.lines.y1[iid];
            const t = position.x;
            const px = ax * (1.0 - t) + bx * t;
            const py = ay * (1.0 - t) + by * t;
            return vertex(vec4(px, py, 0.0, 1.0), { color: vec4(0.2, 0.4, 0.8, 0.8) });
          },
          fragment: (color) => {
            return fragment({ color });
          },
        },
      ),
    ]),
  ],
})
