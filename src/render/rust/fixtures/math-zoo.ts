// math-zoo: Comprehensive builtins coverage. Each instance color derived from a chain of math ops.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    dots: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_quad: quad(0.03) },

  roster: [
    compute('eval_math', domain('dots'), wg(64), () => {
      const gid = $thread.x;
      const time = $global.time;
      const t = f32(gid) / 64.0;

      // Position in a grid
      const col = gid % u32(8);
      const row = gid / u32(8);
      $domains.dots.pos_x[gid] = (f32(col) - 3.5) * 0.22;
      $domains.dots.pos_y[gid] = (f32(row) - 3.5) * 0.22;

      // Exercise uncovered builtins — chain them into color channels
      const a = tan(t * 0.5) * 0.1;
      const b = exp(t * 0.5 - 0.25);
      const c = log(b + 1.0);
      const d = sqrt(t);
      const e = sign(sin(time + t * 6.28));
      const f = fract(t * 4.0 + time);
      const g = ceil(t * 3.0);
      const h = floor(t * 5.0);
      const i = round(t * 7.0);
      const j = pow(t, 2.0);
      const k = atan2(sin(time), cos(time));
      const l = min(t, 0.5);
      const m = step(0.5, t);
      const n = mix(0.2, 0.8, t);
      const o = asin(t * 0.99);
      const p = acos(t * 0.99);
      const q = atan(t);

      // Combine into visible color
      $domains.dots.color_r[gid] = clamp(abs(a + c + e + k) * 0.3, 0.0, 1.0);
      $domains.dots.color_g[gid] = clamp(abs(d + f + j + n) * 0.5, 0.0, 1.0);
      $domains.dots.color_b[gid] = clamp(abs(g + h + i + l + m + o + p + q) * 0.1, 0.0, 1.0);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.05, 0.05, 0.08, 1]), [
      draw('dots_fill', domainSource('dots', 'unit_quad'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.dots.pos_x[iid];
          const py = $domains.dots.pos_y[iid];
          const cr = $domains.dots.color_r[iid];
          const cg = $domains.dots.color_g[iid];
          const cb = $domains.dots.color_b[iid];
          return vertex(
            vec4(position.x + px, position.y + py, 0.0, 1.0),
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
