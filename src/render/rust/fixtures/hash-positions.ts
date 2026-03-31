/**
 * hash-positions: Deterministic pseudo-random swarm with hot-swap state preservation.
 * Gate 12+13: Tests preserveStateOnRecompile blit + hash_u32 builtin.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

const N = 96;

export const hashPositions: PipelineInstallPayload = {
  manifest: {
    // [LAW:one-source-of-truth] Preserve-state behavior is declared once in manifest,
    // and MMU/engine honor this single flag during install/recompile.
    preserveStateOnRecompile: true,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: N },
    },
    domains: {
      swarm: {
        capacity: N,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          color_r: { type: 'f32', clearValue: 0.8 },
          color_g: { type: 'f32', clearValue: 0.8 },
          color_b: { type: 'f32', clearValue: 0.9 },
        },
      },
    },
    textures: {},
    shapeBank: {
      quad: {
        topology: 'triangle-list',
        vertexLayout: {
          stride: 8,
          attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
        },
        vertexData: [
          -0.0225, -0.0225, 0.0225, -0.0225, 0.0225, 0.0225,
          -0.0225, -0.0225, 0.0225, 0.0225, -0.0225, 0.0225,
        ],
      },
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'hash_swarm',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'swarm' },
      dependencies: {
        requiresGlobals: true,
        domains: { swarm: 'read_write' },
        textures: {},
      },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'h', value: { type: 'CallBuiltin', func: 'hash_u32', args: [{ type: 'VarRef', name: 'gid' }] } },
        {
          type: 'Let',
          name: 'hx',
          value: {
            type: 'BinaryOp',
            op: '/',
            left: {
              type: 'Cast',
              targetType: 'f32',
              expr: {
                type: 'BinaryOp',
                op: '&',
                left: { type: 'VarRef', name: 'h' },
                right: { type: 'LiteralU32', value: 1023 },
              },
            },
            right: { type: 'LiteralF32', value: 1023 },
          },
        },
        {
          type: 'Let',
          name: 'hy',
          value: {
            type: 'BinaryOp',
            op: '/',
            left: {
              type: 'Cast',
              targetType: 'f32',
              expr: {
                type: 'BinaryOp',
                op: '&',
                left: {
                  type: 'BinaryOp',
                  op: '>>',
                  left: { type: 'VarRef', name: 'h' },
                  right: { type: 'LiteralU32', value: 10 },
                },
                right: { type: 'LiteralU32', value: 1023 },
              },
            },
            right: { type: 'LiteralF32', value: 1023 },
          },
        },
        {
          type: 'Let',
          name: 'vx',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: {
              type: 'BinaryOp',
              op: '*',
              left: { type: 'VarRef', name: 'hx' },
              right: { type: 'LiteralF32', value: 0.0035 },
            },
            right: { type: 'LiteralF32', value: 0.0008 },
          },
        },
        {
          type: 'Let',
          name: 'vy',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: {
              type: 'BinaryOp',
              op: '*',
              left: { type: 'VarRef', name: 'hy' },
              right: { type: 'LiteralF32', value: 0.0035 },
            },
            right: { type: 'LiteralF32', value: 0.0008 },
          },
        },
        { type: 'Var', name: 'px', dataType: 'f32', value: { type: 'LoadField', symbolId: 'swarm:pos_x', index: { type: 'VarRef', name: 'gid' } } },
        { type: 'Var', name: 'py', dataType: 'f32', value: { type: 'LoadField', symbolId: 'swarm:pos_y', index: { type: 'VarRef', name: 'gid' } } },
        {
          type: 'Assign',
          target: { type: 'VarRef', name: 'px' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'VarRef', name: 'px' },
            right: { type: 'VarRef', name: 'vx' },
          },
        },
        {
          type: 'Assign',
          target: { type: 'VarRef', name: 'py' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'VarRef', name: 'py' },
            right: { type: 'VarRef', name: 'vy' },
          },
        },
        {
          type: 'If',
          condition: {
            type: 'BinaryOp',
            op: '>',
            left: { type: 'VarRef', name: 'px' },
            right: { type: 'LiteralF32', value: 0.95 },
          },
          accept: [{ type: 'Assign', target: { type: 'VarRef', name: 'px' }, value: { type: 'LiteralF32', value: -0.95 } }],
          reject: [],
        },
        {
          type: 'If',
          condition: {
            type: 'BinaryOp',
            op: '>',
            left: { type: 'VarRef', name: 'py' },
            right: { type: 'LiteralF32', value: 0.95 },
          },
          accept: [{ type: 'Assign', target: { type: 'VarRef', name: 'py' }, value: { type: 'LiteralF32', value: -0.95 } }],
          reject: [],
        },
        {
          type: 'StoreField',
          symbolId: 'swarm:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'VarRef', name: 'px' },
        },
        {
          type: 'StoreField',
          symbolId: 'swarm:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'VarRef', name: 'py' },
        },
        {
          type: 'StoreField',
          symbolId: 'swarm:color_r',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '/',
            left: {
              type: 'Cast',
              targetType: 'f32',
              expr: {
                type: 'BinaryOp',
                op: '&',
                left: { type: 'VarRef', name: 'h' },
                right: { type: 'LiteralU32', value: 255 },
              },
            },
            right: { type: 'LiteralF32', value: 255 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'swarm:color_g',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '/',
            left: {
              type: 'Cast',
              targetType: 'f32',
              expr: {
                type: 'BinaryOp',
                op: '&',
                left: {
                  type: 'BinaryOp',
                  op: '>>',
                  left: { type: 'VarRef', name: 'h' },
                  right: { type: 'LiteralU32', value: 8 },
                },
                right: { type: 'LiteralU32', value: 255 },
              },
            },
            right: { type: 'LiteralF32', value: 255 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'swarm:color_b',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '/',
            left: {
              type: 'Cast',
              targetType: 'f32',
              expr: {
                type: 'BinaryOp',
                op: '&',
                left: {
                  type: 'BinaryOp',
                  op: '>>',
                  left: { type: 'VarRef', name: 'h' },
                  right: { type: 'LiteralU32', value: 16 },
                },
                right: { type: 'LiteralU32', value: 255 },
              },
            },
            right: { type: 'LiteralF32', value: 255 },
          },
        },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: N } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.04, 0.04, 0.06, 1] }] },
      drawCalls: [{
        intentId: 'swarm',
        source: { type: 'Domain', domainId: 'swarm', sourceKind: 'Topology', shapeId: 'quad' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { swarm: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'swarm:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'swarm:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'r', value: { type: 'LoadField', symbolId: 'swarm:color_r', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'g', value: { type: 'LoadField', symbolId: 'swarm:color_g', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'swarm:color_b', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct', dataType: 'vec4<f32>', args: [
                { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'VarRef', name: 'px' } },
                { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' }, right: { type: 'VarRef', name: 'py' } },
                { type: 'LiteralF32', value: 0 },
                { type: 'LiteralF32', value: 1 },
              ],
            },
            varyings: {
              color: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [
                  { type: 'VarRef', name: 'r' },
                  { type: 'VarRef', name: 'g' },
                  { type: 'VarRef', name: 'b' },
                  { type: 'LiteralF32', value: 1 },
                ],
              },
            },
          },
        ],
        fragmentAst: [{ type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } }],
      }],
    },
  ],
};
