// quad-camera: 4 viewports, 4 cameras, one canvas.
// Tests: viewport scissoring, loadOp:load, multiple render passes with different cameras.
// One shared compute pass drives 1024 particles; four render passes show different views.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1024 } },
  domains: {
    pts: { capacity: 1024, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      scale: 'f32', rotation: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32', color_a: 'f32',
    }},
  },
  shapes: { petal: tri([
    -0.02, -0.005,  0.02, -0.005,  0.02, 0.005,
    -0.02, -0.005,  0.02,  0.005, -0.02, 0.005,
  ]) },

  roster: [
    // Shared simulation — runs once, all four cameras draw the same state
    compute('sim', domain('pts'), wg(256), () => {
      const gid = $thread.x;
      const time = $global.time;
      const N = 1024.0;
      const fi = f32(gid);
      const rank = fi / N;

      // Spiral pattern
      const angle = rank * TAU * 3.0 + time * 0.7;
      const radius = 0.15 + rank * 0.6;
      const wobble = sin(fi * 0.3 + time * 2.5) * 0.05;

      $domains.pts.pos_x[gid] = cos(angle) * (radius + wobble);
      $domains.pts.pos_y[gid] = sin(angle) * (radius + wobble);
      $domains.pts.scale[gid] = 0.4 + 0.6 * sin(fi * 0.7 + time * 3.0);
      $domains.pts.rotation[gid] = angle + HALF_PI;

      // Hue from position
      const hue = rank + time * 0.1;
      $domains.pts.color_r[gid] = sin(hue * TAU) * 0.5 + 0.5;
      $domains.pts.color_g[gid] = sin(hue * TAU + TAU / 3.0) * 0.5 + 0.5;
      $domains.pts.color_b[gid] = sin(hue * TAU + TAU * 2.0 / 3.0) * 0.5 + 0.5;
      $domains.pts.color_a[gid] = 0.6 + 0.4 * rank;
    }),
    drawPrep('prep', 'sys:active', 6),

    // Top-left: default ortho view (origin centered, zoom 1)
    render('tl', ortho(), clearTarget([0.06, 0.04, 0.08, 1]), [
      draw('tl_fill', domainSource('pts', 'petal'), ALPHA_BLEND, {
        transform: { posX: 'pos_x', posY: 'pos_y', rotation: 'rotation', scale: 'scale' },
        vertex: (position) => {
          const iid = $instance.index;
          const cr = $domains.pts.color_r[iid];
          const cg = $domains.pts.color_g[iid];
          const cb = $domains.pts.color_b[iid];
          const ca = $domains.pts.color_a[iid];
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { color: vec4(cr, cg, cb, ca) });
        },
      }),
    ], { viewport: { x: 0, y: 360, width: 360, height: 360 } }),

    // Top-right: zoomed in 2x
    render('tr', ortho({ zoom: 2 }), loadTarget(), [
      draw('tr_fill', domainSource('pts', 'petal'), ALPHA_BLEND, {
        transform: { posX: 'pos_x', posY: 'pos_y', rotation: 'rotation', scale: 'scale' },
        vertex: (position) => {
          const iid = $instance.index;
          const cr = $domains.pts.color_r[iid];
          const cg = $domains.pts.color_g[iid];
          const cb = $domains.pts.color_b[iid];
          const ca = $domains.pts.color_a[iid];
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { color: vec4(cr, cg, cb, ca) });
        },
      }),
    ], { viewport: { x: 360, y: 360, width: 360, height: 360 } }),

    // Bottom-left: offset center
    render('bl', ortho({ centerX: 0.3, centerY: 0.2 }), loadTarget(), [
      draw('bl_fill', domainSource('pts', 'petal'), ALPHA_BLEND, {
        transform: { posX: 'pos_x', posY: 'pos_y', rotation: 'rotation', scale: 'scale' },
        vertex: (position) => {
          const iid = $instance.index;
          const cr = $domains.pts.color_r[iid];
          const cg = $domains.pts.color_g[iid];
          const cb = $domains.pts.color_b[iid];
          const ca = $domains.pts.color_a[iid];
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { color: vec4(cr, cg, cb, ca) });
        },
      }),
    ], { viewport: { x: 0, y: 0, width: 360, height: 360 } }),

    // Bottom-right: zoomed out 0.5x
    render('br', ortho({ zoom: 0.5 }), loadTarget(), [
      draw('br_fill', domainSource('pts', 'petal'), ALPHA_BLEND, {
        transform: { posX: 'pos_x', posY: 'pos_y', rotation: 'rotation', scale: 'scale' },
        vertex: (position) => {
          const iid = $instance.index;
          const cr = $domains.pts.color_r[iid];
          const cg = $domains.pts.color_g[iid];
          const cb = $domains.pts.color_b[iid];
          const ca = $domains.pts.color_a[iid];
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { color: vec4(cr, cg, cb, ca) });
        },
      }),
    ], { viewport: { x: 360, y: 0, width: 360, height: 360 } }),
  ],
})
