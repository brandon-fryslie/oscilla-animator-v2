// quad-camera: 4 viewports, 4 cameras, one canvas.
// Tests: viewport scissoring, loadOp:load, multiple render passes with different cameras.
// One shared compute pass drives 1024 particles; four render passes show different views.
// Each quadrant has a subtly different background color via a solid fill draw call.
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
  shapes: {
    petal: tri([
      -0.02, -0.005,  0.02, -0.005,  0.02, 0.005,
      -0.02, -0.005,  0.02,  0.005, -0.02, 0.005,
    ]),
  },

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

    // Top-left: default view — warm dark background
    render('tl', ortho(), clearTarget([0.15, 0.06, 0.06, 1]), [
      draw('tl_bg', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { color: vec4(0.15, 0.06, 0.06, 1.0) });
        },
      }),
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
    ], { viewport: { x: 0, y: 0, width: 0.5, height: 0.5 } }),

    // Top-right: zoomed 2x — cool dark background
    render('tr', ortho({ zoom: 2 }), loadTarget(), [
      draw('tr_bg', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { color: vec4(0.04, 0.06, 0.18, 1.0) });
        },
      }),
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
    ], { viewport: { x: 0.5, y: 0, width: 0.5, height: 0.5 } }),

    // Bottom-left: offset center — green tinted background
    render('bl', ortho({ centerX: 0.3, centerY: 0.2 }), loadTarget(), [
      draw('bl_bg', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { color: vec4(0.04, 0.14, 0.06, 1.0) });
        },
      }),
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
    ], { viewport: { x: 0, y: 0.5, width: 0.5, height: 0.5 } }),

    // Bottom-right: zoomed out 0.5x — purple tinted background
    render('br', ortho({ zoom: 0.5 }), loadTarget(), [
      draw('br_bg', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { color: vec4(0.12, 0.04, 0.16, 1.0) });
        },
      }),
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
    ], { viewport: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } }),
  ],
})
