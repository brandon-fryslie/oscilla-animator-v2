// aurora-field: 8192 soft glowing petals with curl dynamics, rotation, SDF.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 8192 } },
  domains: {
    petals: { capacity: 8192, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32', rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  // Elongated petal shape (wide, thin)
  shapes: { petal: tri([
    -0.024, -0.006,  0.024, -0.006,  0.024, 0.006,
    -0.024, -0.006,  0.024,  0.006, -0.024, 0.006,
  ]) },

  roster: [
    compute('sim_aurora', domain('petals'), wg(256), () => {
      const gid = $thread.x;
      const time = $global.time;
      const N = 8192.0;
      const rank = f32(gid) / N;

      // Scatter across the viewport
      const col = f32(gid % u32(128));
      const row = f32(gid / u32(128));
      const x0 = col / 128.0 - 0.5;
      const y0 = row / 64.0 - 0.5;

      // Per-instance phase offsets
      const phase_a = time * 0.57 + rank * 6.283;
      const phase_b = time * 0.41 + rank * 4.189;
      const sin_a = sin(phase_a);
      const cos_a = cos(phase_a);
      const sin_b = sin(phase_b);
      const cos_b = cos(phase_b);

      // Radial breathing
      const r = sqrt(max(x0 * x0 + y0 * y0, 0.0001));
      const bend = r * 8.4 + 1.2 * sin_b;
      const veil = 0.76 + 0.16 * cos(bend);
      const plume = 0.72 + 0.14 * sin(bend + (x0 + y0) * 6.0 + 0.4 * cos_a);

      // Curl distortion
      const curl_x = 0.08 * sin(y0 * 12.0 + 1.4 * sin_a + 0.6 * cos(x0 * 8.0 - sin_b));
      const curl_y = 0.092 * cos(x0 * 11.0 - 1.1 * sin_b + 0.5 * sin(y0 * 9.0 + cos_a));
      const drift = 0.034 * sin((x0 + y0) * 10.0 - 0.9 * cos_b);
      const orbit_x = 0.020 * sin((x0 - y0) * 7.0 + 1.7 * sin_a);
      const orbit_y = 0.024 * cos((x0 + y0) * 6.0 - 1.5 * cos_b);

      $domains.petals.pos_x[gid] = x0 * veil + curl_x + drift + orbit_x;
      $domains.petals.pos_y[gid] = y0 * plume + curl_y + orbit_y;

      // Per-instance scale: ripple + radial modulation
      const ripple = 0.5 + 0.5 * sin(rank * 96.0 + phase_a * 4.2);
      const radial = 0.45 + 0.55 * cos(r * 16.0 - phase_b * 2.8);
      $domains.petals.scale[gid] = 0.25 + 0.85 * ripple * radial;

      // Rotation: align petals along curl flow
      $domains.petals.rotation[gid] = atan2(curl_y + orbit_y, curl_x + drift + orbit_x) + sin(rank * 200.0 + time * 2.0) * 0.3;

      // Rainbow hue
      const hue = rank + time * 0.08;
      const brightness = 0.65 + 0.35 * ripple * radial;
      $domains.petals.color_r[gid] = (sin(hue * 6.283) * 0.5 + 0.5) * brightness;
      $domains.petals.color_g[gid] = (sin(hue * 6.283 + 2.094) * 0.5 + 0.5) * brightness;
      $domains.petals.color_b[gid] = (sin(hue * 6.283 + 4.189) * 0.5 + 0.5) * brightness;
      $domains.petals.color_a[gid] = 0.35 + 0.55 * sin(rank * 37.0 + time * 1.3);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', clearTarget([0.012, 0.006, 0.03, 1]), [
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
          // 2D rotation matrix applied to scaled vertex position
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
