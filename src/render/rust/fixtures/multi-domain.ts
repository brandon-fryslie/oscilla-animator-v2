// multi-domain: Two domains, cross-domain reads, multiple draw calls in one render pass.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: {
    'sys:emitter_active': { u32: 4 },
    'sys:particle_active': { u32: 64 },
  },
  domains: {
    emitters: { capacity: 4, active: 'sys:emitter_active', fields: {
      pos_x: 'f32', pos_y: 'f32',
    }},
    particles: { capacity: 64, active: 'sys:particle_active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: {
    emitter_quad: quad(0.05),
    particle_quad: quad(0.015),
  },

  roster: [
    // Pass 1: Position emitters in a square
    compute('eval_emitters', domain('emitters'), wg(4), () => {
      const gid = $thread.x;
      const time = $global.time;
      const angle = f32(gid) * 1.5707963267948966 + time * 0.5;
      $domains.emitters.pos_x[gid] = cos(angle) * 0.4;
      $domains.emitters.pos_y[gid] = sin(angle) * 0.4;
    }),
    // Pass 2: Position particles relative to emitters (cross-domain read)
    compute('eval_particles', domain('particles'), wg(64), () => {
      const gid = $thread.x;
      const time = $global.time;
      // Each particle belongs to an emitter (16 particles per emitter)
      const emitter_id = gid / u32(16);
      const local_id = gid % u32(16);
      // Cross-domain read: particle compute reads emitter position
      const ex = $domains.emitters.pos_x[emitter_id];
      const ey = $domains.emitters.pos_y[emitter_id];
      // Spread particles around emitter
      const local_angle = f32(local_id) * 0.392699 + time * 2.0;
      const local_radius = 0.05 + f32(local_id) * 0.01;
      $domains.particles.pos_x[gid] = ex + cos(local_angle) * local_radius;
      $domains.particles.pos_y[gid] = ey + sin(local_angle) * local_radius;
      // Color by emitter
      const hue = f32(emitter_id) * 1.5707963267948966;
      $domains.particles.color_r[gid] = sin(hue) * 0.5 + 0.5;
      $domains.particles.color_g[gid] = sin(hue + 2.094) * 0.5 + 0.5;
      $domains.particles.color_b[gid] = sin(hue + 4.189) * 0.5 + 0.5;
    }),
    drawPrep('prep_emitters', 'sys:emitter_active', 6),
    drawPrep('prep_particles', 'sys:particle_active', 6),
    // Single render pass with two draw calls
    render('draw_all', ortho(), clearTarget([0.03, 0.03, 0.06, 1]), [
      draw('emitter_fill', domainSource('emitters', 'emitter_quad'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.emitters.pos_x[iid];
          const py = $domains.emitters.pos_y[iid];
          return vertex(
            vec4(position.x + px, position.y + py, 0.0, 1.0),
            { color: vec4(1.0, 1.0, 1.0, 1.0) },
          );
        },
        fragment: (color) => {
          return fragment({ color });
        },
      }),
      draw('particle_fill', domainSource('particles', 'particle_quad'), OPAQUE, {
        vertex: (position) => {
          const iid = $instance.index;
          const px = $domains.particles.pos_x[iid];
          const py = $domains.particles.pos_y[iid];
          const cr = $domains.particles.color_r[iid];
          const cg = $domains.particles.color_g[iid];
          const cb = $domains.particles.color_b[iid];
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
