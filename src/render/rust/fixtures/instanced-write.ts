// instanced-write: 2048 instances in a breathing double-ring via domain dispatch.
// Tests: domain-dispatched compute, per-instance field writes, instanced draw.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 2048 } },
  domains: {
    dots: { capacity: 2048, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32', rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  // Elongated petal — overlapping creates smooth fluid look
  shapes: { petal: tri([
    -0.018, -0.004,  0.018, -0.004,  0.018, 0.004,
    -0.018, -0.004,  0.018,  0.004, -0.018, 0.004,
  ]) },

  roster: [
    compute('eval_instances', domain('dots'), wg(256), () => {
      const gid = $thread.x;
      const time = $global.time;
      const N = 2048.0;
      const fi = f32(gid);
      const rank = fi / N;

      // Three concentric rings
      const ring = f32(gid % u32(3));
      const base_radius = 0.25 + ring * 0.2;
      const angle = rank * 6.283185 + time * (0.8 + ring * 0.3);

      // Breathing radius + per-instance wobble
      const breath = sin(time * 1.8 + ring * 2.094) * 0.06;
      const wobble = sin(fi * 0.37 + time * 3.0) * 0.04;
      const radius = base_radius + breath + wobble;

      $domains.dots.pos_x[gid] = cos(angle) * radius;
      $domains.dots.pos_y[gid] = sin(angle) * radius;

      // Scale pulses per instance
      $domains.dots.scale[gid] = 0.5 + 0.5 * sin(fi * 0.5 + time * 4.0);

      // Rotation: tangent to ring + gentle oscillation
      $domains.dots.rotation[gid] = angle + 1.5708 + sin(fi * 0.2 + time * 2.0) * 0.4;

      // Rainbow hue from angle, brightness modulated by ring
      const hue = angle * 0.5 + time * 0.3 + ring * 0.7;
      const bright = 0.6 + 0.2 * ring;
      $domains.dots.color_r[gid] = (sin(hue) * 0.5 + 0.5) * bright;
      $domains.dots.color_g[gid] = (sin(hue + 2.094) * 0.5 + 0.5) * bright;
      $domains.dots.color_b[gid] = (sin(hue + 4.189) * 0.5 + 0.5) * bright;
      $domains.dots.color_a[gid] = 0.3 + 0.3 * ring;
    }),
    drawPrep('prep_dots', 'sys:active', 6),
    render('draw_dots', ortho(), clearTarget([0.03, 0.02, 0.06, 1]), [
      draw('dots_fill', domainSource('dots', 'petal'), ALPHA_BLEND, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.dots.pos_x[iid];
          const py = $domains.dots.pos_y[iid];
          const sc = $domains.dots.scale[iid];
          const rot = $domains.dots.rotation[iid];
          const cr = $domains.dots.color_r[iid];
          const cg = $domains.dots.color_g[iid];
          const cb = $domains.dots.color_b[iid];
          const ca = $domains.dots.color_a[iid];
          const c = cos(rot);
          const s = sin(rot);
          const lx = position.x * sc;
          const ly = position.y * sc;
          const rx = lx * c - ly * s;
          const ry = lx * s + ly * c;
          return vertex(
            vec4(rx + px, ry + py, 0.0, 1.0),
            { color: vec4(cr, cg, cb, ca) },
          );
        },
        fragment: (color) => {
          return fragment({ color });
        },
      }),
    ]),
  ],
})
