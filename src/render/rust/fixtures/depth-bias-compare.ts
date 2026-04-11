// depth-bias-compare: Visual validation for extended depth compare + depth bias.
// Expected image: cool blue outer quad, warm orange middle quad, bright yellow inner quad.
// If less-equal is not wired, the orange layer disappears.
// If depth bias is not wired, the yellow inner quad disappears.
gpu({
  scalars: { 'sys:active': { u32: 1 } },
  domains: {
    layer: { capacity: 1, active: 'sys:active', fields: { _pad: 'f32' } },
  },
  textures: {
    depth_tex: {
      dimension: '2d',
      width: { relativeTo: 'canvas', scale: 1 },
      height: { relativeTo: 'canvas', scale: 1 },
      format: 'depth32float',
      usage: ['render_attachment'],
    },
  },
  shapes: {
    wide_quad: quad(0.9),
    mid_quad: quad(0.58),
    inner_quad: quad(0.28),
  },

  roster: [
    drawPrep('prep_layers', 'sys:active', 6),
    render('depth_layers', ortho(), {
      colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.04, 0.05, 0.08, 1.0] }],
      depthStencil: {
        textureId: 'depth_tex',
        depth: { op: 'clear', value: 1.0 },
      },
    }, [
      draw('base_fill', domainSource('layer', 'wide_quad'), {
        blendMode: 'opaque',
        cullMode: 'none',
        depthWrite: true,
        depthCompare: 'less',
      }, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.42, 1.0), {});
        },
        fragment: () => {
          return fragment({ color: vec4(0.12, 0.24, 0.92, 1.0) });
        },
      }),
      draw('equal_overlay', domainSource('layer', 'mid_quad'), {
        blendMode: 'opaque',
        cullMode: 'none',
        depthWrite: false,
        depthCompare: 'less-equal',
      }, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.42, 1.0), {});
        },
        fragment: () => {
          return fragment({ color: vec4(0.96, 0.44, 0.18, 1.0) });
        },
      }),
      draw('biased_overlay', domainSource('layer', 'inner_quad'), {
        blendMode: 'opaque',
        cullMode: 'none',
        depthWrite: false,
        depthCompare: 'less',
        depthBias: -8,
        depthBiasSlopeScale: -1.0,
        depthBiasClamp: 0.0,
      }, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.42, 1.0), {});
        },
        fragment: () => {
          return fragment({ color: vec4(1.0, 0.9, 0.22, 1.0) });
        },
      }),
    ]),
  ],
})
