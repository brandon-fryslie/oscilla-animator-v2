/**
 * noise-terrain: Fullscreen procedural color using intrinsic noise helpers.
 * Gate 13: Tests noise_simplex_2d + noise_simplex_3d builtins.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

export const noiseTerrain: PipelineInstallPayload = {
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
    textures: {},
    shapeBank: {
      fullscreen: {
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
    {
      type: 'Compute',
      passId: 'setup',
      sourceBlockIds: [],
      workgroupSize: [1, 1, 1],
      dispatch: { mode: 'Exact', x: 1, y: 1, z: 1 },
      dependencies: { requiresGlobals: false, domains: {}, textures: {} },
      ast: [{ type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 1 } }],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.02, 0.02, 0.03, 1] }] },
      drawCalls: [{
        intentId: 'noise',
        source: { type: 'Domain', domainId: 'quad', sourceKind: 'Topology', shapeId: 'fullscreen' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: {}, textures: {} },
        vertexAst: [
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
                { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' },
                { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' },
                { type: 'LiteralF32', value: 0.0 },
                { type: 'LiteralF32', value: 1.0 },
              ],
            },
            varyings: {
              uv: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: {
                      type: 'BinaryOp',
                      op: '*',
                      left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' },
                      right: { type: 'LiteralF32', value: 0.5 },
                    },
                    right: { type: 'LiteralF32', value: 0.5 },
                  },
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: {
                      type: 'BinaryOp',
                      op: '*',
                      left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' },
                      right: { type: 'LiteralF32', value: 0.5 },
                    },
                    right: { type: 'LiteralF32', value: 0.5 },
                  },
                  { type: 'LiteralF32', value: 0.0 },
                  { type: 'LiteralF32', value: 0.0 },
                ],
              },
            },
          },
        ],
        fragmentAst: [
          {
            type: 'Let',
            name: 'p',
            value: {
              type: 'Construct',
              dataType: 'vec2<f32>',
              args: [
                {
                  type: 'BinaryOp',
                  op: '*',
                  left: { type: 'Swizzle', source: { type: 'VarRef', name: 'uv' }, mask: 'x' },
                  right: { type: 'LiteralF32', value: 6.0 },
                },
                {
                  type: 'BinaryOp',
                  op: '*',
                  left: { type: 'Swizzle', source: { type: 'VarRef', name: 'uv' }, mask: 'y' },
                  right: { type: 'LiteralF32', value: 6.0 },
                },
              ],
            },
          },
          {
            type: 'Let',
            name: 'n2',
            value: { type: 'CallBuiltin', func: 'noise_simplex_2d', args: [{ type: 'VarRef', name: 'p' }] },
          },
          {
            type: 'Let',
            name: 'p3',
            value: {
              type: 'Construct',
              dataType: 'vec3<f32>',
              args: [
                { type: 'Swizzle', source: { type: 'VarRef', name: 'p' }, mask: 'x' },
                { type: 'Swizzle', source: { type: 'VarRef', name: 'p' }, mask: 'y' },
                { type: 'LiteralF32', value: 0.35 },
              ],
            },
          },
          {
            type: 'Let',
            name: 'n3',
            value: { type: 'CallBuiltin', func: 'noise_simplex_3d', args: [{ type: 'VarRef', name: 'p3' }] },
          },
          {
            type: 'Let',
            name: 'h',
            value: {
              type: 'CallBuiltin',
              func: 'clamp',
              args: [
                {
                  type: 'BinaryOp',
                  op: '+',
                  left: {
                    type: 'BinaryOp',
                    op: '*',
                    left: { type: 'VarRef', name: 'n2' },
                    right: { type: 'LiteralF32', value: 0.65 },
                  },
                  right: {
                    type: 'BinaryOp',
                    op: '*',
                    left: { type: 'VarRef', name: 'n3' },
                    right: { type: 'LiteralF32', value: 0.35 },
                  },
                },
                { type: 'LiteralF32', value: 0.0 },
                { type: 'LiteralF32', value: 1.0 },
              ],
            },
          },
          {
            type: 'ReturnFragment',
            outputs: {
              color: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralF32', value: 0.35 } },
                    right: { type: 'LiteralF32', value: 0.12 },
                  },
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralF32', value: 0.55 } },
                    right: { type: 'LiteralF32', value: 0.18 },
                  },
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralF32', value: 0.75 } },
                    right: { type: 'LiteralF32', value: 0.25 },
                  },
                  { type: 'LiteralF32', value: 1.0 },
                ],
              },
            },
          },
        ],
      }],
    },
  ],
};
