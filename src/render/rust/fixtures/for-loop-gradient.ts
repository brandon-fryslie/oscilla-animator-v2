// for-loop-gradient: 64 bars with height + color from a For loop accumulator.
// Tests: for-loop with accumulator, per-instance computed brightness.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    bars: { capacity: 64, active: 'sys:active', fields: {
      brightness: 'f32',
      pos_x: 'f32',
      height: 'f32',
    }},
  },
  shapes: {
    bar: tri([
      -0.006, 0.0, 0.006, 0.0, 0.006, 1.0,
      -0.006, 0.0, 0.006, 1.0, -0.006, 1.0,
    ]),
  },

  roster: [
    compute('accumulate', domain('bars'), wg(64), () => {
      const gid = $thread.x;
      const time = $global.time;
      let acc = 0.0;
      let i = u32(0);
      for (const _noop = u32(0); i < gid + u32(1); i = i + u32(1)) {
        acc = acc + sin(time * 1.5 + f32(i) * 0.4) * 0.08;
      }
      const b = clamp(acc * 0.5 + 0.5, 0.05, 1.0);
      $domains.bars.brightness[gid] = b;
      $domains.bars.pos_x[gid] = f32(gid) / 64.0 * 1.9 - 0.95;
      $domains.bars.height[gid] = b * 0.85;
    }),
    drawPrep('prep_bars', 'sys:active', 6),
    render('draw_bars', ortho(), clearTarget([0.02, 0.015, 0.04, 1]), [
      draw('bars_fill', domainSource('bars', 'bar'), ALPHA_BLEND, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.bars.pos_x[iid];
          const b = $domains.bars.brightness[iid];
          const h = $domains.bars.height[iid];
          // Bar grows upward from bottom, height driven by accumulator
          const y = position.y * h - 0.8;
          return vertex(
            vec4(position.x + px, y, 0.0, 1.0),
            { data: vec4(b, position.y, 0.0, 0.0) },
          );
        },
        fragment: (data) => {
          const b = data.x;
          const v = data.y;
          // Gradient: warm at base, cool at tip
          const r = b * (0.9 - v * 0.5);
          const g = b * (0.3 + v * 0.7);
          const bl = b * v * 0.6;
          const a = 0.7 + 0.3 * b;
          return fragment({ color: vec4(r, g, bl, a) });
        },
      }),
    ]),
  ],
})
