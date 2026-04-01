// test-vertex-time: Single rotating quad. Tests $global.time in vertex shader.
gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    obj: { capacity: 1, active: 'sys:active', fields: {
      _pad: 'f32',
    }},
  },
  shapes: { rect: quad(0.2) },

  roster: [
    compute('setup', exact(1), wg(1), () => {
      $scalar.active = u32(1);
    }),
    drawPrep('prep', 'sys:active', 6),
    render('draw', clearTarget([0.1, 0.1, 0.15, 1]), [
      draw('obj_draw', domainSource('obj', 'rect'), OPAQUE, {
        vertex: (position) => {
          const time = $global.time;
          const angle = time * 0.001;
          const c = cos(angle);
          const s = sin(angle);
          const rx = position.x * c - position.y * s;
          const ry = position.x * s + position.y * c;
          return vertex(vec4(rx, ry, 0.0, 1.0), { color: vec4(0.3, 0.8, 0.5, 1.0) });
        },
        fragment: (color) => {
          return fragment({ color });
        },
      }),
    ]),
  ],
})
