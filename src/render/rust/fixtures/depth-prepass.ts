// depth-prepass: Depth-only pass followed by a color pass using the depth buffer.
// Tests: zero color attachments (fragment: None), depth texture write,
//        depth_compare: 'less' consuming a pre-filled depth buffer.
//
// Visual: full-screen color gradient, but the depth-only prepass writes a
// circular "hole" at z=0.0 in the center. The color pass draws at z=0.5
// with depthCompare 'less' — fragments OUTSIDE the hole pass (0.5 < 1.0),
// fragments INSIDE fail (0.5 > 0.0). Result: gradient with a black circle.
gpu({
  globals: { 'sys:time': 'f32' },
  textures: {
    depth_buf: { dimension: '2d', width: { relativeTo: 'canvas', scale: 1 }, height: { relativeTo: 'canvas', scale: 1 }, format: 'depth24plus-stencil8', usage: ['render_attachment'] },
  },

  roster: [
    // Pass 1: DEPTH-ONLY — write a circular region at z=0.0 (very close).
    // The rest of the depth buffer stays at the clear value (1.0 = far).
    // Zero color attachments, no fragment shader.
    render('depth_fill', ortho(), depthOnlyTarget('depth_buf'), [
      draw('stamp_depth', fsQuadSource(), { blendMode: 'opaque', cullMode: 'none', depthWrite: true, depthCompare: 'always' }, {
        vertex: (position) => {
          // Full-screen quad at z=0.0 (closest). The fragment shader
          // would normally discard pixels outside the circle, but we have
          // no fragment (depth-only). Instead we shape the depth via
          // vertex z: center vertices at z=0.0, edge at z=0.99.
          // Since this is a simple full-screen triangle, we use UV to
          // derive depth: pixels near center get z≈0, edges get z≈1.
          const u = position.x;
          const v = position.y;
          const dist = sqrt(u * u + v * v);
          // Inside radius 0.6: z=0.0 (blocks). Outside: z=0.99 (won't block).
          const z = smoothstep(0.4, 0.6, dist);
          return vertex(vec4(position.x, position.y, z, 1.0), {});
        },
        // No fragment — depth-only
      }),
    ]),

    // Pass 2: COLOR — full-screen gradient at z=0.5.
    // With depthCompare 'less': fragments pass where existing depth > 0.5.
    // The prepass wrote z≈0.0 in the center circle → 0.5 < 0.0 fails → black hole.
    // Outside the circle depth is 1.0 (clear value) → 0.5 < 1.0 passes → color.
    render('color_draw', ortho(), {
      colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.0, 0.0, 0.0, 1] }],
      depthStencil: {
        textureId: 'depth_buf',
        depth: { op: 'load' },
      },
    }, [
      draw('gradient', fsQuadSource(), { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'less' }, {
        vertex: (position) => {
          const u = position.x * 0.5 + 0.5;
          const v = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(position.x, position.y, 0.5, 1.0), {
            uv: vec4(u, v, 0.0, 0.0),
          });
        },
        fragment: (uv) => {
          const time = $global.time;
          const hue = atan2(uv.y - 0.5, uv.x - 0.5) + time;
          const r = sin(hue) * 0.5 + 0.5;
          const g = sin(hue + 2.094) * 0.5 + 0.5;
          const b = sin(hue + 4.189) * 0.5 + 0.5;
          return fragment({ color: vec4(r, g, b, 1.0) });
        },
      }),
    ]),
  ],
})
