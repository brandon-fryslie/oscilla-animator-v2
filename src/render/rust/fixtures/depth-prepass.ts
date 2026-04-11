// depth-prepass: Zero-color depth prepass, then a depth-equal color pass.
// Expected image: deep blue outer quad with a warm orange inner quad.
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
      format: 'depth24plus',
      usage: ['render_attachment'],
    },
  },
  shapes: {
    outer_quad: quad(0.84),
    inner_quad: quad(0.44),
  },
  roster: [
    drawPrep('prep_depth', 'sys:active', 6),
    render('depth_prepass', ortho(), depthOnlyTarget('depth_tex'), [
      draw('outer_depth', domainSource('layer', 'outer_quad'), {
        blendMode: 'opaque',
        cullMode: 'none',
        depthWrite: true,
        depthCompare: 'less',
      }, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.62, 1.0), {});
        },
      }),
      draw('inner_depth', domainSource('layer', 'inner_quad'), {
        blendMode: 'opaque',
        cullMode: 'none',
        depthWrite: true,
        depthCompare: 'less',
      }, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.22, 1.0), {});
        },
      }),
    ]),
    render('shade', ortho(), {
      colors: [{
        textureId: 'canvas',
        loadOp: 'clear',
        clearColor: [0.03, 0.04, 0.07, 1.0],
        blendMode: 'opaque',
        writeMask: ['r', 'g', 'b', 'a'],
      }],
      depthStencil: {
        textureId: 'depth_tex',
        depth: { op: 'load' },
      },
    }, [
      draw('outer_color', domainSource('layer', 'outer_quad'), {
        blendMode: 'opaque',
        cullMode: 'none',
        depthWrite: false,
        depthCompare: 'equal',
      }, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.62, 1.0), {});
        },
        fragment: () => {
          return fragment({ color: vec4(0.16, 0.3, 0.9, 1.0) });
        },
      }),
      draw('inner_color', domainSource('layer', 'inner_quad'), {
        blendMode: 'opaque',
        cullMode: 'none',
        depthWrite: false,
        depthCompare: 'equal',
      }, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.22, 1.0), {});
        },
        fragment: () => {
          return fragment({ color: vec4(0.96, 0.58, 0.18, 1.0) });
        },
      }),
    ]),
  ],
})
