// vertex-float32x3: Shape position attribute uses float32x3 at shaderLocation 0.
gpu({
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    tri: { capacity: 1, active: 'sys:active', fields: { _pad: 'f32' } },
  },
  shapes: {
    tri3d: {
      topology: 'triangle-list',
      vertexLayout: {
        stride: 12,
        attributes: {
          position: { format: 'float32x3', shaderLocation: 0 },
        },
      },
      vertexData: [
        0.0, 0.72, 0.0,
        -0.72, -0.58, 0.0,
        0.72, -0.58, 0.0,
      ],
    },
  },
  roster: [
    drawPrep('prep', 'sys:active', 3),
    render('show_vec3_position', ortho(), clearTarget([0.04, 0.05, 0.09, 1.0]), [
      draw('tri_vec3', domainSource('tri', 'tri3d'), OPAQUE, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, position.z, 1.0), {});
        },
        fragment: () => {
          return fragment({ color: vec4(0.98, 0.58, 0.18, 1.0) });
        },
      }),
    ]),
  ],
})
