// front-face-cw: Clockwise triangle with back-face culling.
// Expected image: a warm triangle is visible.
// If frontFace remains hardcoded to ccw, the triangle is culled and only the background remains.
gpu({
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    tri_domain: { capacity: 1, active: 'sys:active', fields: { _pad: 'f32' } },
  },
  shapes: {
    cw_triangle: tri([0.0, 0.82, 0.82, -0.72, -0.82, -0.72]),
  },
  roster: [
    drawPrep('prep_tri', 'sys:active', 3),
    render('show_front_face', ortho(), clearTarget([0.03, 0.04, 0.08, 1.0]), [
      draw('cw_fill', domainSource('tri_domain', 'cw_triangle'), {
        blendMode: 'opaque',
        cullMode: 'back',
        frontFace: 'cw',
        depthWrite: false,
        depthCompare: 'always',
      }, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
        },
        fragment: () => {
          return fragment({ color: vec4(0.98, 0.46, 0.14, 1.0) });
        },
      }),
    ]),
  ],
})
