// test-lines: 8 static line segments in a star pattern. Tests line-list topology only.
gpu({
  scalars: { 'sys:active': { u32: 8 } },
  domains: {
    lines: { capacity: 8, active: 'sys:active', fields: {
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
    compute('setup', domain('lines'), wg(8), () => {
      const gid = $thread.x;
      const angle = f32(gid) * 0.7854;
      $domains.lines.x0[gid] = 0.0;
      $domains.lines.y0[gid] = 0.0;
      $domains.lines.x1[gid] = cos(angle) * 0.5;
      $domains.lines.y1[gid] = sin(angle) * 0.5;
    }),
    drawPrep('prep', 'sys:active', 2),
    render('draw', clearTarget([0.1, 0.1, 0.15, 1]), [
      draw('lines_draw', domainSource('lines', 'seg'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const ax = $domains.lines.x0[iid];
          const ay = $domains.lines.y0[iid];
          const bx = $domains.lines.x1[iid];
          const by = $domains.lines.y1[iid];
          const t = position.x;
          const px = ax * (1.0 - t) + bx * t;
          const py = ay * (1.0 - t) + by * t;
          return vertex(vec4(px, py, 0.0, 1.0), { color: vec4(1.0, 1.0, 1.0, 1.0) });
        },
        fragment: (color) => {
          return fragment({ color });
        },
      }),
    ]),
  ],
})
