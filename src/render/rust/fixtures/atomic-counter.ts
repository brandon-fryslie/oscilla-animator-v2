/**
 * atomic-counter: Parallel atomic increment + visualized counter ramp.
 * Gate 9: Tests atomic scalar ops and split atomic buffer routing.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

const N = 64;
const TAU = Math.PI * 2;

export const atomicCounter: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: N },
      'sys:alive_counter': { type: 'atomic<u32>', clearValue: 0 },
    },
    domains: {
      dots: {
        capacity: N,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          count_norm: { type: 'f32', clearValue: 0 },
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
          -0.03, -0.03, 0.03, -0.03, 0.03, 0.03,
          -0.03, -0.03, 0.03, 0.03, -0.03, 0.03,
        ],
      },
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'reset_counter',
      sourceBlockIds: [],
      workgroupSize: [1, 1, 1],
      dispatch: { mode: 'Exact', x: 1, y: 1, z: 1 },
      dependencies: {
        requiresGlobals: false,
        domains: {},
        textures: {},
      },
      ast: [
        { type: 'StoreScalar', symbolId: 'sys:alive_counter', value: { type: 'LiteralU32', value: 0 } },
      ],
    },
    {
      type: 'Compute',
      passId: 'count_particles',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'dots' },
      dependencies: {
        requiresGlobals: true,
        domains: { dots: 'read_write' },
        textures: {},
      },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        {
          type: 'Let',
          name: 'angle',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: {
              type: 'BinaryOp',
              op: '*',
              left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
              right: { type: 'LiteralF32', value: TAU / N },
            },
            right: { type: 'VarRef', name: 'time' },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'dots:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'VarRef', name: 'angle' }] }, right: { type: 'LiteralF32', value: 0.72 } },
        },
        {
          type: 'StoreField',
          symbolId: 'dots:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'angle' }] }, right: { type: 'LiteralF32', value: 0.72 } },
        },
        {
          type: 'AtomicOpScalar',
          op: 'Add',
          symbolId: 'sys:alive_counter',
          value: { type: 'LiteralU32', value: 1 },
          assignResultTo: 'prev',
        },
        {
          type: 'Let',
          name: 'current',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'VarRef', name: 'prev' },
            right: { type: 'LiteralU32', value: 1 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'dots:count_norm',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'current' } },
            right: { type: 'LiteralF32', value: N },
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
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.03, 0.03, 0.05, 1] }] },
      drawCalls: [{
        intentId: 'dots',
        source: { type: 'Domain', domainId: 'dots', sourceKind: 'Topology', shapeId: 'quad' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { dots: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'dots:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'dots:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct', dataType: 'vec4<f32>', args: [
                { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'VarRef', name: 'px' } },
                { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' }, right: { type: 'VarRef', name: 'py' } },
                { type: 'LiteralF32', value: 0.0 },
                { type: 'LiteralF32', value: 1.0 },
              ],
            },
            varyings: {
              count: {
                type: 'Construct', dataType: 'vec4<f32>', args: [
                  { type: 'LoadField', symbolId: 'dots:count_norm', index: { type: 'VarRef', name: 'iid' } },
                  { type: 'LiteralF32', value: 0.0 },
                  { type: 'LiteralF32', value: 0.0 },
                  { type: 'LiteralF32', value: 1.0 },
                ],
              },
            },
          },
        ],
        fragmentAst: [
          {
            type: 'ReturnFragment',
            outputs: {
              color: {
                type: 'Construct', dataType: 'vec4<f32>', args: [
                  { type: 'Swizzle', source: { type: 'VarRef', name: 'count' }, mask: 'x' },
                  { type: 'BinaryOp', op: '-', left: { type: 'LiteralF32', value: 1.0 }, right: { type: 'Swizzle', source: { type: 'VarRef', name: 'count' }, mask: 'x' } },
                  { type: 'LiteralF32', value: 0.25 },
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
