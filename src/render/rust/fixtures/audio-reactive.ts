/**
 * audio-reactive: Data stream driven bars.
 * Gate 10: Tests MMU data stream allocation + update_data_stream writes.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

const BARS = 64;

export const audioReactive: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: BARS },
    },
    domains: {
      bars: {
        capacity: BARS,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          height: { type: 'f32', clearValue: 0 },
        },
      },
    },
    textures: {},
    shapeBank: {
      bar: {
        topology: 'triangle-list',
        vertexLayout: {
          stride: 8,
          attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
        },
        vertexData: [
          -0.0125, -0.45, 0.0125, -0.45, 0.0125, 0.45,
          -0.0125, -0.45, 0.0125, 0.45, -0.0125, 0.45,
        ],
      },
    },
    dataStreams: {
      fft: { type: 'f32', length: 128 },
    },
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'update_bars',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'bars' },
      dependencies: {
        requiresGlobals: false,
        domains: { bars: 'read_write' },
        dataStreams: { fft: 'read' },
        textures: {},
      },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        {
          type: 'Let',
          name: 'bin',
          value: {
            type: 'BinaryOp',
            op: '%',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'gid' }, right: { type: 'LiteralU32', value: 2 } },
            right: { type: 'LiteralU32', value: 128 },
          },
        },
        {
          type: 'Let',
          name: 'amp',
          value: {
            type: 'CallBuiltin',
            func: 'clamp',
            args: [
              { type: 'LoadField', symbolId: 'stream:fft', index: { type: 'VarRef', name: 'bin' } },
              { type: 'LiteralF32', value: 0.0 },
              { type: 'LiteralF32', value: 1.0 },
            ],
          },
        },
        {
          type: 'StoreField',
          symbolId: 'bars:height',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'VarRef', name: 'amp' },
        },
        {
          type: 'StoreField',
          symbolId: 'bars:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '-',
            left: {
              type: 'BinaryOp',
              op: '*',
              left: {
                type: 'BinaryOp',
                op: '/',
                left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
                right: { type: 'LiteralF32', value: BARS },
              },
              right: { type: 'LiteralF32', value: 1.8 },
            },
            right: { type: 'LiteralF32', value: 0.9 },
          },
        },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: BARS } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.02, 0.02, 0.05, 1] }] },
      drawCalls: [{
        intentId: 'bars',
        source: { type: 'Domain', domainId: 'bars', sourceKind: 'Topology', shapeId: 'bar' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { bars: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'bars:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'h', value: { type: 'LoadField', symbolId: 'bars:height', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'Let',
            name: 'lane',
            value: {
              type: 'BinaryOp',
              op: '/',
              left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'iid' } },
              right: { type: 'LiteralF32', value: BARS - 1 },
            },
          },
          {
            type: 'Let',
            name: 'light',
            value: {
              type: 'CallBuiltin',
              func: 'clamp',
              args: [
                {
                  type: 'BinaryOp',
                  op: '+',
                  left: {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'LiteralF32', value: 0.15 },
                    right: {
                      type: 'BinaryOp',
                      op: '*',
                      left: { type: 'VarRef', name: 'h' },
                      right: { type: 'LiteralF32', value: 0.65 },
                    },
                  },
                  right: {
                    type: 'BinaryOp',
                    op: '*',
                    left: { type: 'VarRef', name: 'lane' },
                    right: { type: 'LiteralF32', value: 0.2 },
                  },
                },
                { type: 'LiteralF32', value: 0.0 },
                { type: 'LiteralF32', value: 1.0 },
              ],
            },
          },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct', dataType: 'vec4<f32>', args: [
                { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'VarRef', name: 'px' } },
                {
                  type: 'BinaryOp',
                  op: '*',
                  left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' },
                  right: {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralF32', value: 1.7 } },
                    right: { type: 'LiteralF32', value: 0.1 },
                  },
                },
                { type: 'LiteralF32', value: 0.0 },
                { type: 'LiteralF32', value: 1.0 },
              ],
            },
            varyings: {
              color: {
                type: 'Construct', dataType: 'vec4<f32>', args: [
                  { type: 'VarRef', name: 'light' },
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'LiteralF32', value: 0.18 },
                    right: {
                      type: 'BinaryOp',
                      op: '*',
                      left: { type: 'VarRef', name: 'light' },
                      right: { type: 'LiteralF32', value: 0.72 },
                    },
                  },
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'LiteralF32', value: 0.08 },
                    right: {
                      type: 'BinaryOp',
                      op: '*',
                      left: { type: 'VarRef', name: 'light' },
                      right: { type: 'LiteralF32', value: 0.45 },
                    },
                  },
                  { type: 'LiteralF32', value: 1.0 },
                ],
              },
            },
          },
        ],
        fragmentAst: [
          { type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } },
        ],
      }],
    },
  ],
};
