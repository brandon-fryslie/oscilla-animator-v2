// vector-field: Vector builtins — normalize, length, distance, dot, cross, reflect.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 64 } },
  domains: {
    arrows: { capacity: 64, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_quad: quad(0.025) },

  roster: [
    compute('eval_vectors', domain('arrows'), wg(64), () => {
      const gid = $thread.x;
      const time = $global.time;
      const col = gid % u32(8);
      const row = gid / u32(8);
      const cx = (f32(col) - 3.5) * 0.22;
      const cy = (f32(row) - 3.5) * 0.22;

      // Build a 2D vector from position
      const v = vec2(cx + sin(time) * 0.1, cy + cos(time) * 0.1);
      const len = length(v);
      const n = normalize(v);

      // Distance from origin
      const origin = vec2(0.0, 0.0);
      const dist = distance(v, origin);

      // Dot product with a rotating reference vector
      const ref = vec2(cos(time), sin(time));
      const d = dot(n, ref);

      // Cross product (3D, for orientation)
      const v3a = vec3(n.x, n.y, 0.0);
      const v3b = vec3(ref.x, ref.y, 0.0);
      const c = cross(v3a, v3b);

      // Reflect v across the reference
      const r = reflect(v, ref);

      $domains.arrows.pos_x[gid] = cx;
      $domains.arrows.pos_y[gid] = cy;
      $domains.arrows.color_r[gid] = clamp(d * 0.5 + 0.5, 0.0, 1.0);
      $domains.arrows.color_g[gid] = clamp(1.0 - dist, 0.0, 1.0);
      $domains.arrows.color_b[gid] = clamp(abs(c.z) + abs(r.x) * 0.2, 0.0, 1.0);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', clearTarget([0.04, 0.04, 0.07, 1]), [
      draw('arrows_fill', domainSource('arrows', 'unit_quad'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.arrows.pos_x[iid];
          const py = $domains.arrows.pos_y[iid];
          const cr = $domains.arrows.color_r[iid];
          const cg = $domains.arrows.color_g[iid];
          const cb = $domains.arrows.color_b[iid];
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
