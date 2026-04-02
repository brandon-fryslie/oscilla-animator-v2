// jellyfish-bloom: 6144 tendrils radiating from pulsing bell shapes.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 6144 } },
  domains: {
    tendrils: { capacity: 6144, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32', rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: { strand: tri([
    -0.002, -0.018,  0.002, -0.018,  0.002, 0.018,
    -0.002, -0.018,  0.002,  0.018, -0.002, 0.018,
  ]) },

  roster: [
    compute('sim_jelly', domain('tendrils'), wg(256), () => {
      const gid = $thread.x;
      const time = $global.time;
      const N = 6144.0;
      const rank = f32(gid) / N;

      // 3 jellyfish, each with 2048 tendrils
      const jelly_id = gid / u32(2048);
      const local_id = gid % u32(2048);
      const local_rank = f32(local_id) / 2048.0;

      // Jellyfish center positions: slow drift
      const jx = sin(time * 0.3 + f32(jelly_id) * 2.094) * 0.35;
      const jy = cos(time * 0.23 + f32(jelly_id) * 2.094) * 0.25 + 0.05;

      // Bell pulse
      const pulse = sin(time * 2.5 + f32(jelly_id) * 1.0) * 0.5 + 0.5;
      const bell_radius = 0.12 + pulse * 0.06;

      // Tendril grows from bell edge downward
      const tendril_angle = local_rank * 6.283 * 5.0 + f32(jelly_id) * 1.0;
      const tendril_depth = fract(local_rank * 13.0) * 0.35 + 0.05;

      // Attach point on the bell
      const attach_x = cos(tendril_angle) * bell_radius * (0.6 + 0.4 * sin(local_rank * 40.0));
      const attach_y = sin(tendril_angle) * bell_radius * 0.3;

      // Tendril hangs down with wave motion
      const wave = sin(time * 3.0 + tendril_depth * 8.0 + local_rank * 20.0) * 0.03 * tendril_depth;
      const sway = cos(time * 1.7 + local_rank * 30.0) * 0.02 * tendril_depth;

      $domains.tendrils.pos_x[gid] = jx + attach_x + wave + sway;
      $domains.tendrils.pos_y[gid] = jy + attach_y - tendril_depth - tendril_depth * pulse * 0.3;

      // Rotation: tendrils dangle
      $domains.tendrils.rotation[gid] = sin(time * 2.0 + local_rank * 15.0) * 0.4 + tendril_angle * 0.1;

      // Scale: thinner further from bell
      $domains.tendrils.scale[gid] = 0.4 + (1.0 - tendril_depth) * 0.8;

      // Color: bioluminescent — cyan/magenta/violet per jellyfish
      const hue_base = f32(jelly_id) * 0.33 + 0.5;
      const hue = hue_base + local_rank * 0.1 + time * 0.05;
      const glow = 0.5 + 0.5 * sin(time * 4.0 + tendril_depth * 6.0 + local_rank * 50.0);
      $domains.tendrils.color_r[gid] = (sin(hue * 6.283) * 0.4 + 0.55) * glow;
      $domains.tendrils.color_g[gid] = (sin(hue * 6.283 + 2.094) * 0.4 + 0.55) * glow;
      $domains.tendrils.color_b[gid] = (sin(hue * 6.283 + 4.189) * 0.4 + 0.65) * glow;
      $domains.tendrils.color_a[gid] = (0.2 + 0.6 * (1.0 - tendril_depth)) * (0.5 + 0.5 * glow);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.005, 0.008, 0.02, 1]), [
      draw('tendrils_fill', domainSource('tendrils', 'strand'), ALPHA_BLEND, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.tendrils.pos_x[iid];
          const py = $domains.tendrils.pos_y[iid];
          const sc = $domains.tendrils.scale[iid];
          const rot = $domains.tendrils.rotation[iid];
          const cr = $domains.tendrils.color_r[iid];
          const cg = $domains.tendrils.color_g[iid];
          const cb = $domains.tendrils.color_b[iid];
          const ca = $domains.tendrils.color_a[iid];
          const c = cos(rot);
          const s = sin(rot);
          const lx = position.x * sc;
          const ly = position.y * sc;
          return vertex(
            vec4(lx * c - ly * s + px, lx * s + ly * c + py, 0.0, 1.0),
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
