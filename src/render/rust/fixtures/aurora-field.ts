// aurora-field: 76800 soft glowing petals with curl dynamics, rotation.
// R2 quasi-random scatter for zero moiré; wave bands emerge from y-based hue.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 76800 } },
  domains: {
    petals: { capacity: 76800, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32', rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  // Elongated petal shape — scaled for [-1,1] coordinate space
  shapes: { petal: tri([
    -0.048, -0.012,  0.048, -0.012,  0.048, 0.012,
    -0.048, -0.012,  0.048,  0.012, -0.048, 0.012,
  ]) },

  roster: [
    compute('sim_aurora', domain('petals'), wg(256), () => {
      const gid = $thread.x;
      const time = $global.time;
      const N = 76800.0;
      const rank = f32(gid) / N;

      // R2 quasi-random placement — zero moiré, full coverage, [-1, 1] range
      const g = 1.32471795724;
      const a1 = 1.0 / g;
      const a2 = 1.0 / (g * g);
      const x0 = fract(0.5 + a1 * f32(gid)) * 2.0 - 1.0;
      const y0 = fract(0.5 + a2 * f32(gid)) * 2.0 - 1.0;

      // Per-instance phase offsets
      const phase_a = time * 0.57 + rank * 6.283;
      const phase_b = time * 0.41 + rank * 4.189;
      const sin_a = sin(phase_a);
      const cos_a = cos(phase_a);
      const sin_b = sin(phase_b);
      const cos_b = cos(phase_b);

      // Radial breathing (centered on origin)
      const cx = x0;
      const cy = y0;
      const r = sqrt(max(cx * cx + cy * cy, 0.0001));
      const bend = r * 4.0 + 1.2 * sin_b;
      const veil = 0.94 + 0.05 * cos(bend);
      const plume = 0.93 + 0.05 * sin(bend + (cx + cy) * 3.0 + 0.4 * cos_a);

      // Curl distortion — amplitudes doubled for [-1,1] range
      const curl_x = 0.12 * sin(cy * 6.0 + 1.4 * sin_a + 0.6 * cos(cx * 4.0 - sin_b));
      const curl_y = 0.14 * cos(cx * 5.5 - 1.1 * sin_b + 0.5 * sin(cy * 4.5 + cos_a));
      const drift = 0.05 * sin((cx + cy) * 5.0 - 0.9 * cos_b);
      const orbit_x = 0.036 * sin((cx - cy) * 3.5 + 1.7 * sin_a);
      const orbit_y = 0.040 * cos((cx + cy) * 3.0 - 1.5 * cos_b);

      const fx = x0 * veil + curl_x + drift + orbit_x;
      const fy = y0 * plume + curl_y + orbit_y;
      $domains.petals.pos_x[gid] = fx;
      $domains.petals.pos_y[gid] = fy;

      // Per-instance scale: ripple + radial modulation
      const ripple = 0.5 + 0.5 * sin(rank * 96.0 + phase_a * 4.2);
      const radial = 0.45 + 0.55 * cos(r * 8.0 - phase_b * 2.8);
      $domains.petals.scale[gid] = 0.25 + 0.85 * ripple * radial;

      // Rotation: align petals along curl flow
      $domains.petals.rotation[gid] = atan2(curl_y + orbit_y, curl_x + drift + orbit_x) + sin(rank * 200.0 + time * 2.0) * 0.3;

      // Hue from final y-position — creates horizontal rainbow bands
      const hue = fy * 1.2 + time * 0.08;
      const brightness = 0.65 + 0.35 * ripple * radial;
      $domains.petals.color_r[gid] = (sin(hue * 6.283) * 0.5 + 0.5) * brightness;
      $domains.petals.color_g[gid] = (sin(hue * 6.283 + 2.094) * 0.5 + 0.5) * brightness;
      $domains.petals.color_b[gid] = (sin(hue * 6.283 + 4.189) * 0.5 + 0.5) * brightness;
      $domains.petals.color_a[gid] = 0.35 + 0.55 * sin(rank * 37.0 + time * 1.3);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', ortho(), clearTarget([0.012, 0.006, 0.03, 1]), [
      draw('petals_fill', domainSource('petals', 'petal'), ALPHA_BLEND, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.petals.pos_x[iid];
          const py = $domains.petals.pos_y[iid];
          const sc = $domains.petals.scale[iid];
          const rot = $domains.petals.rotation[iid];
          const cr = $domains.petals.color_r[iid];
          const cg = $domains.petals.color_g[iid];
          const cb = $domains.petals.color_b[iid];
          const ca = $domains.petals.color_a[iid];
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
