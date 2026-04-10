// mrt-split: Single render pass writing to 2 color textures simultaneously (MRT),
// then a composite pass samples both and displays them side-by-side on canvas.
// Tests: multiple color attachments, FsOutput struct with 2 @location outputs,
//        multi-texture sampling in composite.
//
// Convention: fragment output keys are sorted alphabetically to determine
// @location(i) mapping. The colors array must be ordered to match:
//   bright → @location(0) → colors[0] = bright_tex
//   color  → @location(1) → colors[1] = color_tex
gpu({
  globals: { 'sys:time': 'f32' },
  textures: {
    color_tex: { dimension: '2d', width: { relativeTo: 'canvas', scale: 1 }, height: { relativeTo: 'canvas', scale: 1 }, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
    bright_tex: { dimension: '2d', width: { relativeTo: 'canvas', scale: 1 }, height: { relativeTo: 'canvas', scale: 1 }, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
  },
  samplers: {
    linear: { magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' },
  },

  roster: [
    // MRT render pass: full-screen quad writing to BOTH textures simultaneously.
    // The fragment returns two outputs — sorted alphabetically:
    //   "bright" → @location(0) → bright_tex
    //   "color"  → @location(1) → color_tex
    // MRT pass uses composite() — clip-space positions pass through directly,
    // no camera/VP transform (which would distort the fullscreen triangle).
    composite('gbuffer', {
      colors: [
        { textureId: 'bright_tex', loadOp: 'clear', clearColor: [0, 0, 0, 1] },
        { textureId: 'color_tex', loadOp: 'clear', clearColor: [0, 0, 0, 1] },
      ],
    }, [
      draw('fullscreen_mrt', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          // Pass UV coordinates as varying
          const u = position.x * 0.5 + 0.5;
          const v = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(position.x, position.y, 0.0, 1.0), {
            uv: vec4(u, v, 0.0, 0.0),
          });
        },
        fragment: (uv) => {
          const time = $global.time;
          // Two clearly distinct patterns so the split is obvious:

          // "color" output: rainbow radial gradient
          const angle = atan2(uv.y - 0.5, uv.x - 0.5);
          const hue = angle + time;
          const full = vec4(
            sin(hue) * 0.5 + 0.5,
            sin(hue + 2.094) * 0.5 + 0.5,
            sin(hue + 4.189) * 0.5 + 0.5,
            1.0,
          );

          // "bright" output: concentric rings (completely different pattern)
          const dist = sqrt((uv.x - 0.5) * (uv.x - 0.5) + (uv.y - 0.5) * (uv.y - 0.5));
          const rings = sin(dist * 40.0 - time * 4.0) * 0.5 + 0.5;
          const bright_out = vec4(rings, rings * 0.5, rings * 0.8, 1.0);

          return fragment({ color: full, bright: bright_out });
        },
      }),
    ]),

    // Composite: left half = full color, right half = bright/bloom channel
    composite('final', clearTarget([0.0, 0.0, 0.0, 1]), [
      // Left half — full color
      draw('show_color', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const x = position.x * 0.5 - 0.5;
          const u = position.x * 0.5 + 0.5;
          const v = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(x, position.y, 0.0, 1.0), { uv: vec4(u, v, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({ color: textureSample('color_tex', 'linear', vec2(uv.x, uv.y)) });
        },
      }),
      // Right half — bright channel
      draw('show_bright', fsQuadSource(), OPAQUE, {
        vertex: (position) => {
          const x = position.x * 0.5 + 0.5;
          const u = position.x * 0.5 + 0.5;
          const v = 1.0 - (position.y * 0.5 + 0.5);
          return vertex(vec4(x, position.y, 0.0, 1.0), { uv: vec4(u, v, 0.0, 0.0) });
        },
        fragment: (uv) => {
          return fragment({ color: textureSample('bright_tex', 'linear', vec2(uv.x, uv.y)) });
        },
      }),
    ]),
  ],
})
