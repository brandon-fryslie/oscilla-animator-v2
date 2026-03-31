/**
 * texture-readwrite: Compute writes to a storage texture, render pass reads it.
 * Gate 6+7: Tests texture allocation, TextureStore in compute, TextureLoad in fragment.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

const TEX_SIZE = 64;

export const textureReadwrite: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 1 },
    },
    domains: {
      quad: {
        capacity: 1,
        activeLanesSymbol: 'sys:active',
        fields: {
          _pad: { type: 'f32', clearValue: 0 },
        },
      },
    },
    textures: {
      tex_color: {
        dimension: '2d',
        width: TEX_SIZE,
        height: TEX_SIZE,
        format: 'rgba8unorm',
        usage: ['storage', 'sampled'],
      },
    },
    shapeBank: {
      fullscreen_quad: {
        topology: 'triangle-list',
        vertexLayout: {
          stride: 8,
          attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
        },
        vertexData: [
          -1, -1, 1, -1, 1, 1,
          -1, -1, 1, 1, -1, 1,
        ],
      },
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    // Compute: write a color pattern to the storage texture
    {
      type: 'Compute',
      passId: 'fill_texture',
      sourceBlockIds: [],
      workgroupSize: [8, 8, 1],
      dispatch: { mode: 'Exact', x: TEX_SIZE / 8, y: TEX_SIZE / 8, z: 1 },
      dependencies: {
        requiresGlobals: true,
        domains: {},
        textures: { tex_color: 'write' },
      },
      ast: [
        { type: 'Let', name: 'gx', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'gy', value: { type: 'Intrinsic', name: 'global_invocation_id.y' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        // Normalized UV
        {
          type: 'Let', name: 'u', value: {
            type: 'BinaryOp', op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gx' } },
            right: { type: 'LiteralF32', value: TEX_SIZE },
          },
        },
        {
          type: 'Let', name: 'v', value: {
            type: 'BinaryOp', op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gy' } },
            right: { type: 'LiteralF32', value: TEX_SIZE },
          },
        },
        // Color: time-animated gradient
        {
          type: 'Let', name: 'r', value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'u' }, right: { type: 'LiteralF32', value: 6.28 } }, right: { type: 'VarRef', name: 'time' } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        {
          type: 'Let', name: 'g', value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'v' }, right: { type: 'LiteralF32', value: 6.28 } }, right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 1.3 } } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        // TextureStore tex_color at (gx, gy) = vec4(r, g, 0.5, 1.0)
        {
          type: 'TextureStore',
          textureId: 'tex_color',
          coords: { type: 'Construct', dataType: 'vec2<i32>', args: [
            { type: 'Cast', targetType: 'i32', expr: { type: 'VarRef', name: 'gx' } },
            { type: 'Cast', targetType: 'i32', expr: { type: 'VarRef', name: 'gy' } },
          ]},
          value: { type: 'Construct', dataType: 'vec4<f32>', args: [
            { type: 'VarRef', name: 'r' },
            { type: 'VarRef', name: 'g' },
            { type: 'LiteralF32', value: 0.5 },
            { type: 'LiteralF32', value: 1.0 },
          ]},
        },
      ],
    },
    // Minimal compute to set active count
    {
      type: 'Compute',
      passId: 'set_active',
      sourceBlockIds: [],
      workgroupSize: [1, 1, 1],
      dispatch: { mode: 'Exact', x: 1, y: 1, z: 1 },
      dependencies: {
        requiresGlobals: false,
        domains: {},
        textures: {},
      },
      ast: [
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 1 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    // Render: fullscreen quad that reads from the texture via TextureLoad
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0, 0, 0, 1] }] },
      drawCalls: [{
        intentId: 'fullscreen',
        source: { type: 'Domain', domainId: 'quad', sourceKind: 'Topology', shapeId: 'fullscreen_quad' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: {
          requiresGlobals: false,
          domains: {},
          textures: { tex_color: 'sampled' },
        },
        vertexAst: [
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct', dataType: 'vec4<f32>', args: [
                { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' },
                { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' },
                { type: 'LiteralF32', value: 0.0 },
                { type: 'LiteralF32', value: 1.0 },
              ],
            },
            // Pass position as varying so fragment can compute UV
            varyings: {
              uv: {
                type: 'Construct', dataType: 'vec4<f32>', args: [
                  // Map position from [-1,1] to [0,1] for UV
                  { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'LiteralF32', value: 0.5 } }, right: { type: 'LiteralF32', value: 0.5 } },
                  { type: 'BinaryOp', op: '-', left: { type: 'LiteralF32', value: 1.0 }, right: { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' }, right: { type: 'LiteralF32', value: 0.5 } }, right: { type: 'LiteralF32', value: 0.5 } } },
                  { type: 'LiteralF32', value: 0.0 },
                  { type: 'LiteralF32', value: 0.0 },
                ],
              },
            },
          },
        ],
        fragmentAst: [
          // Convert UV varying to integer texel coordinates
          {
            type: 'Let', name: 'tx', value: {
              type: 'Cast', targetType: 'i32', expr: {
                type: 'BinaryOp', op: '*',
                left: { type: 'Swizzle', source: { type: 'VarRef', name: 'uv' }, mask: 'x' },
                right: { type: 'LiteralF32', value: TEX_SIZE - 1 },
              },
            },
          },
          {
            type: 'Let', name: 'ty', value: {
              type: 'Cast', targetType: 'i32', expr: {
                type: 'BinaryOp', op: '*',
                left: { type: 'Swizzle', source: { type: 'VarRef', name: 'uv' }, mask: 'y' },
                right: { type: 'LiteralF32', value: TEX_SIZE - 1 },
              },
            },
          },
          {
            type: 'ReturnFragment',
            outputs: {
              color: {
                type: 'TextureLoad',
                textureId: 'tex_color',
                coords: { type: 'Construct', dataType: 'vec2<i32>', args: [
                  { type: 'VarRef', name: 'tx' },
                  { type: 'VarRef', name: 'ty' },
                ]},
              },
            },
          },
        ],
      }],
    },
  ],
};
