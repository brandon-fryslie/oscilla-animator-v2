// test-additive: 64 overlapping dots with additive blending. Tests blend mode only.
gpu({
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    dots: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
    }},
  },
  shapes: { dot: quad(0.08) },

  roster: [
    compute('setup', domain('dots'), wg(64), () => {
      const gid = $thread.x;
      const angle = f32(gid) * 0.09817;
      const r = 0.1 + f32(gid) * 0.005;
      $domains.dots.pos_x[gid] = cos(angle) * r;
      $domains.dots.pos_y[gid] = sin(angle) * r;
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', clearTarget([0.0, 0.0, 0.0, 1]), [
      draw('dots_draw', domainSource('dots', 'dot'),
        { blendMode: 'additive', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        {
          vertex: (position) => {
            const iid = $instance.index;
            const px = $domains.dots.pos_x[iid];
            const py = $domains.dots.pos_y[iid];
            return vertex(
              vec4(position.x + px, position.y + py, 0.0, 1.0),
              { color: vec4(0.1, 0.15, 0.3, 0.5) },
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
