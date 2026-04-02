// for-loop-gradient: 32 bars with brightness from a For loop accumulator.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 32 } },
  domains: {
    bars: { capacity: 32, active: 'sys:active', fields: {
      brightness: 'f32',
      pos_x: 'f32',
    }},
  },
  shapes: {
    bar: tri([
      -0.0125, -0.4, 0.0125, -0.4, 0.0125, 0.4,
      -0.0125, -0.4, 0.0125, 0.4, -0.0125, 0.4,
    ]),
  },

  roster: [
    compute('accumulate', domain('bars'), wg(32), () => {
      const gid = $thread.x;
      const time = $global.time;
      let acc = 0.0;
      let i = u32(0);
      for (const _noop = u32(0); i < gid + u32(1); i = i + u32(1)) {
        acc = acc + sin(time + f32(i) * 0.5) * 0.1;
      }
      $domains.bars.brightness[gid] = clamp(acc * 0.5 + 0.5, 0.0, 1.0);
      $domains.bars.pos_x[gid] = f32(gid) / 32.0 * 1.8 - 0.9;
    }),
    drawPrep('prep_bars', 'sys:active', 6),
    render('draw_bars', ortho(), clearTarget([0.02, 0.02, 0.04, 1]), [
      draw('bars_fill', domainSource('bars', 'bar'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.bars.pos_x[iid];
          const b = $domains.bars.brightness[iid];
          return vertex(
            vec4(position.x + px, position.y, 0.0, 1.0),
            { brightness: vec4(b, 0.0, 0.0, 0.0) },
          );
        },
        fragment: (brightness) => {
          const b = brightness.x;
          return fragment({ color: vec4(b * 0.3, b, b * 0.8, 1.0) });
        },
      }),
    ]),
  ],
})
