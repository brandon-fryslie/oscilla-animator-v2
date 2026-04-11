// flat-varying-u32: Explicit u32 varying with flat interpolation.
// Expected image: a diagonal split square with one solid orange triangle and one solid cyan triangle.
gpu({
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    quad_domain: { capacity: 1, active: 'sys:active', fields: { _pad: 'f32' } },
  },
  shapes: {
    split_quad: tri([
      -0.82,  0.82,  -0.82, -0.82,   0.82, -0.82,
      -0.82,  0.82,   0.82, -0.82,   0.82,  0.82,
    ]),
  },
  roster: [
    drawPrep('prep_split_quad', 'sys:active', 6),
    render('show_flat_varying', ortho(), clearTarget([0.04, 0.05, 0.08, 1.0]), [
      draw('flat_id_triangles', domainSource('quad_domain', 'split_quad'), OPAQUE, {
        varyings: {
          materialId: { type: 'u32', interpolation: 'flat' },
        },
        vertex: (position) => {
          const materialId = $vertex.index / u32(3);
          return vertex(vec4(position.x, position.y, 0.0, 1.0), { materialId });
        },
        fragment: (materialId) => {
          const t = f32(materialId);
          return fragment({
            color: vec4(
              0.96 - t * 0.84,
              0.56 + t * 0.24,
              0.14 + t * 0.78,
              1.0,
            ),
          });
        },
      }),
    ]),
  ],
})
