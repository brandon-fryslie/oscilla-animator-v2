/**
 * sdf-circle: Fullscreen SDF circle with derivative antialiasing.
 * Gate 8: Tests dpdx/dpdy/fwidth in fragment shader.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

export const sdfCircle: PipelineInstallPayload = {
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
        fields: { _pad: { type: 'f32', clearValue: 0 } },
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
      ast: [
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 1 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.03, 0.03, 0.05, 1] }] },
      drawCalls: [{
        intentId: 'circle',
        source: { type: 'Domain', domainId: 'quad', sourceKind: 'Topology', shapeId: 'fullscreen' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: {}, textures: {} },
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
            varyings: {
              uv: {
                type: 'Construct', dataType: 'vec4<f32>', args: [
                  { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'LiteralF32', value: 0.5 } }, right: { type: 'LiteralF32', value: 0.5 } },
                  { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' }, right: { type: 'LiteralF32', value: 0.5 } }, right: { type: 'LiteralF32', value: 0.5 } },
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
              type: 'Construct', dataType: 'vec2<f32>', args: [
                { type: 'BinaryOp', op: '-', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'uv' }, mask: 'x' }, right: { type: 'LiteralF32', value: 2.0 } }, right: { type: 'LiteralF32', value: 1.0 } },
                { type: 'BinaryOp', op: '-', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'uv' }, mask: 'y' }, right: { type: 'LiteralF32', value: 2.0 } }, right: { type: 'LiteralF32', value: 1.0 } },
              ],
            },
          },
          {
            type: 'Let',
            name: 'd',
            value: {
              type: 'BinaryOp',
              op: '-',
              left: { type: 'CallBuiltin', func: 'length', args: [{ type: 'VarRef', name: 'p' }] },
              right: { type: 'LiteralF32', value: 0.5 },
            },
          },
          { type: 'Let', name: 'w', value: { type: 'CallBuiltin', func: 'fwidth', args: [{ type: 'VarRef', name: 'd' }] } },
          {
            type: 'Let',
            name: 'a',
            value: {
              type: 'CallBuiltin',
              func: 'clamp',
              args: [
                { type: 'BinaryOp', op: '/', left: { type: 'BinaryOp', op: '-', left: { type: 'LiteralF32', value: 0.0 }, right: { type: 'VarRef', name: 'd' } }, right: { type: 'VarRef', name: 'w' } },
                { type: 'LiteralF32', value: 0.0 },
                { type: 'LiteralF32', value: 1.0 },
              ],
            },
          },
          {
            type: 'ReturnFragment',
            outputs: {
              color: {
                type: 'Construct', dataType: 'vec4<f32>', args: [
                  { type: 'VarRef', name: 'a' },
                  { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'a' }, right: { type: 'LiteralF32', value: 0.6 } }, right: { type: 'LiteralF32', value: 0.2 } },
                  { type: 'BinaryOp', op: '-', left: { type: 'LiteralF32', value: 1.0 }, right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'a' }, right: { type: 'LiteralF32', value: 0.2 } } },
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
