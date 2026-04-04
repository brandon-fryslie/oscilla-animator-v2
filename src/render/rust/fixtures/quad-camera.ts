// quad-camera: 4 cameras → 4 textures → composite onto canvas.
// Tests: render-to-texture, composite pass, multi-camera, texture sampling.
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
  textures: {
    tl: { dimension: '2d', width: { relativeTo: 'canvas', scale: 0.5 }, height: { relativeTo: 'canvas', scale: 0.5 }, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
    tr: { dimension: '2d', width: { relativeTo: 'canvas', scale: 0.5 }, height: { relativeTo: 'canvas', scale: 0.5 }, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
    bl: { dimension: '2d', width: { relativeTo: 'canvas', scale: 0.5 }, height: { relativeTo: 'canvas', scale: 0.5 }, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
    br: { dimension: '2d', width: { relativeTo: 'canvas', scale: 0.5 }, height: { relativeTo: 'canvas', scale: 0.5 }, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
  },
  samplers: {
    nearest: { magFilter: 'nearest', minFilter: 'nearest', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' },
  },
  shapes: {
    petal: tri([
      -0.02, -0.005,  0.02, -0.005,  0.02, 0.005,
      -0.02, -0.005,  0.02,  0.005, -0.02, 0.005,
    ]),
  },

  roster: [
    // Shared simulation
    compute('sim', domain('pts'), wg(256), () => {
      const gid = $thread.x;
      const time = $global.time;
      const N = 1024.0;
      const fi = f32(gid);
      const rank = fi / N;
      const angle = rank * TAU * 3.0 + time * 0.7;
      const radius = 0.15 + rank * 0.6;
      const wobble = sin(fi * 0.3 + time * 2.5) * 0.05;
      $domains.pts.pos_x[gid] = cos(angle) * (radius + wobble);
      $domains.pts.pos_y[gid] = sin(angle) * (radius + wobble);
      $domains.pts.scale[gid] = 0.4 + 0.6 * sin(fi * 0.7 + time * 3.0);
      $domains.pts.rotation[gid] = angle + HALF_PI;
      const hue = rank + time * 0.1;
      $domains.pts.color_r[gid] = sin(hue * TAU) * 0.5 + 0.5;
      $domains.pts.color_g[gid] = sin(hue * TAU + TAU / 3.0) * 0.5 + 0.5;
      $domains.pts.color_b[gid] = sin(hue * TAU + TAU * 2.0 / 3.0) * 0.5 + 0.5;
      $domains.pts.color_a[gid] = 0.6 + 0.4 * rank;
    }),
    drawPrep('prep', 'sys:active', 6),

    // 4 cameras → 4 separate textures
    render('tl', ortho(), clearTexture('tl', [0.15, 0.06, 0.06, 1]), [
      draw('tl_fill', domainSource('pts', 'petal'), ALPHA_BLEND, {
        transform: { posX: 'pos_x', posY: 'pos_y', rotation: 'rotation', scale: 'scale' },
        vertex: (position) => {
          const iid = $instance.index;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), {
            color: vec4($domains.pts.color_r[iid], $domains.pts.color_g[iid], $domains.pts.color_b[iid], $domains.pts.color_a[iid]),
          });
        },
      }),
    ]),
    render('tr', ortho({ zoom: 2 }), clearTexture('tr', [0.04, 0.06, 0.18, 1]), [
      draw('tr_fill', domainSource('pts', 'petal'), ALPHA_BLEND, {
        transform: { posX: 'pos_x', posY: 'pos_y', rotation: 'rotation', scale: 'scale' },
        vertex: (position) => {
          const iid = $instance.index;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), {
            color: vec4($domains.pts.color_r[iid], $domains.pts.color_g[iid], $domains.pts.color_b[iid], $domains.pts.color_a[iid]),
          });
        },
      }),
    ]),
    render('bl', ortho({ centerX: 0.3, centerY: 0.2 }), clearTexture('bl', [0.04, 0.14, 0.06, 1]), [
      draw('bl_fill', domainSource('pts', 'petal'), ALPHA_BLEND, {
        transform: { posX: 'pos_x', posY: 'pos_y', rotation: 'rotation', scale: 'scale' },
        vertex: (position) => {
          const iid = $instance.index;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), {
            color: vec4($domains.pts.color_r[iid], $domains.pts.color_g[iid], $domains.pts.color_b[iid], $domains.pts.color_a[iid]),
          });
        },
      }),
    ]),
    render('br', ortho({ zoom: 0.5 }), clearTexture('br', [0.12, 0.04, 0.16, 1]), [
      draw('br_fill', domainSource('pts', 'petal'), ALPHA_BLEND, {
        transform: { posX: 'pos_x', posY: 'pos_y', rotation: 'rotation', scale: 'scale' },
        vertex: (position) => {
          const iid = $instance.index;
          return vertex(vec4(position.x, position.y, 0.0, 1.0), {
            color: vec4($domains.pts.color_r[iid], $domains.pts.color_g[iid], $domains.pts.color_b[iid], $domains.pts.color_a[iid]),
          });
        },
      }),
    ]),

    // Composite: sample 4 textures, draw as positioned quads on canvas
    composite('final', clearTarget([0.02, 0.02, 0.02, 1]), [
      // Top-left quadrant
      draw('comp_tl', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const x = position.x * 0.5 - 0.5;
          const y = position.y * 0.5 + 0.5;
          const u = position.x * 0.5 + 0.5;
          const v = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(x, y, 0.0, 1.0), { uv: vec4(u, v, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({ color: textureSample('tl', 'nearest', vec2(uv.x, uv.y)) });
        },
      }),
      // Top-right quadrant
      draw('comp_tr', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const x = position.x * 0.5 + 0.5;
          const y = position.y * 0.5 + 0.5;
          const u = position.x * 0.5 + 0.5;
          const v = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(x, y, 0.0, 1.0), { uv: vec4(u, v, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({ color: textureSample('tr', 'nearest', vec2(uv.x, uv.y)) });
        },
      }),
      // Bottom-left quadrant
      draw('comp_bl', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const x = position.x * 0.5 - 0.5;
          const y = position.y * 0.5 - 0.5;
          const u = position.x * 0.5 + 0.5;
          const v = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(x, y, 0.0, 1.0), { uv: vec4(u, v, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({ color: textureSample('bl', 'nearest', vec2(uv.x, uv.y)) });
        },
      }),
      // Bottom-right quadrant
      draw('comp_br', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const x = position.x * 0.5 + 0.5;
          const y = position.y * 0.5 - 0.5;
          const u = position.x * 0.5 + 0.5;
          const v = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(x, y, 0.0, 1.0), { uv: vec4(u, v, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({ color: textureSample('br', 'nearest', vec2(uv.x, uv.y)) });
        },
      }),
    ]),
  ],
})
