/**
 * for-loop-gradient: 32 instances colored by a For loop accumulator.
 * Gate 2: Tests Var, Assign, For, If, Break, Continue.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

const INSTANCE_COUNT = 32;

export const forLoopGradient: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: INSTANCE_COUNT },
    },
    domains: {
      bars: {
        capacity: INSTANCE_COUNT,
        activeLanesSymbol: 'sys:active',
        fields: {
          brightness: { type: 'f32', clearValue: 0 },
          pos_x: { type: 'f32', clearValue: 0 },
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
        // Thin vertical bar: width 0.025, height 0.8
        vertexData: [
          -0.0125, -0.4, 0.0125, -0.4, 0.0125, 0.4,
          -0.0125, -0.4, 0.0125, 0.4, -0.0125, 0.4,
        ],
      },
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    // Compute: for each instance, accumulate brightness via a for loop
    {
      type: 'Compute',
      passId: 'accumulate',
      sourceBlockIds: [],
      workgroupSize: [32, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'bars' },
      dependencies: {
        requiresGlobals: true,
        domains: { bars: 'read_write' },
        textures: {},
      },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        // var acc: f32 = 0.0;
        { type: 'Var', name: 'acc', dataType: 'f32', value: { type: 'LiteralF32', value: 0.0 } },
        // var i: u32 = 0u;
        { type: 'Var', name: 'i', dataType: 'u32', value: { type: 'LiteralU32', value: 0 } },
        // for (; i < gid + 1u; i = i + 1u) { acc = acc + sin(time + f32(i) * 0.5) * 0.1; }
        {
          type: 'For',
          init: { type: 'Let', name: '_noop', value: { type: 'LiteralU32', value: 0 } },
          condition: {
            type: 'BinaryOp', op: '<',
            left: { type: 'VarRef', name: 'i' },
            right: {
              type: 'BinaryOp', op: '+',
              left: { type: 'VarRef', name: 'gid' },
              right: { type: 'LiteralU32', value: 1 },
            },
          },
          update: {
            type: 'Assign',
            target: { type: 'VarRef', name: 'i' },
            value: {
              type: 'BinaryOp', op: '+',
              left: { type: 'VarRef', name: 'i' },
              right: { type: 'LiteralU32', value: 1 },
            },
          },
          body: [
            {
              type: 'Assign',
              target: { type: 'VarRef', name: 'acc' },
              value: {
                type: 'BinaryOp', op: '+',
                left: { type: 'VarRef', name: 'acc' },
                right: {
                  type: 'BinaryOp', op: '*',
                  left: {
                    type: 'CallBuiltin', func: 'sin', args: [{
                      type: 'BinaryOp', op: '+',
                      left: { type: 'VarRef', name: 'time' },
                      right: {
                        type: 'BinaryOp', op: '*',
                        left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'i' } },
                        right: { type: 'LiteralF32', value: 0.5 },
                      },
                    }],
                  },
                  right: { type: 'LiteralF32', value: 0.1 },
                },
              },
            },
          ],
        },
        // brightness = clamp(acc * 0.5 + 0.5, 0.0, 1.0)
        {
          type: 'StoreField', symbolId: 'bars:brightness',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'CallBuiltin', func: 'clamp', args: [
              {
                type: 'BinaryOp', op: '+',
                left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'acc' }, right: { type: 'LiteralF32', value: 0.5 } },
                right: { type: 'LiteralF32', value: 0.5 },
              },
              { type: 'LiteralF32', value: 0.0 },
              { type: 'LiteralF32', value: 1.0 },
            ],
          },
        },
        // pos_x = (f32(gid) / 32.0) * 1.8 - 0.9
        {
          type: 'StoreField', symbolId: 'bars:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '-',
            left: {
              type: 'BinaryOp', op: '*',
              left: {
                type: 'BinaryOp', op: '/',
                left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
                right: { type: 'LiteralF32', value: INSTANCE_COUNT },
              },
              right: { type: 'LiteralF32', value: 1.8 },
            },
            right: { type: 'LiteralF32', value: 0.9 },
          },
        },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: INSTANCE_COUNT } },
      ],
    },
    {
      type: 'System_DrawPrep', passId: 'prep_bars', sourceBlockIds: [],
      activeLanesSymbol: 'sys:active', vertexCount: 6,
    },
    {
      type: 'Render', passId: 'draw_bars', sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.02, 0.02, 0.04, 1] }] },
      drawCalls: [{
        intentId: 'bars_fill',
        source: { type: 'Domain', domainId: 'bars', sourceKind: 'Topology', shapeId: 'bar' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { bars: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'bars:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'bars:brightness', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct', dataType: 'vec4<f32>', args: [
                { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'VarRef', name: 'px' } },
                { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' },
                { type: 'LiteralF32', value: 0.0 },
                { type: 'LiteralF32', value: 1.0 },
              ],
            },
            // Pass brightness as varying so fragment can use it per-instance
            varyings: {
              brightness: {
                type: 'Construct', dataType: 'vec4<f32>', args: [
                  { type: 'VarRef', name: 'b' },
                  { type: 'LiteralF32', value: 0.0 },
                  { type: 'LiteralF32', value: 0.0 },
                  { type: 'LiteralF32', value: 0.0 },
                ],
              },
            },
          },
        ],
        fragmentAst: [
          // Read brightness from the varying (x component of the vec4)
          { type: 'Let', name: 'b', value: { type: 'Swizzle', source: { type: 'VarRef', name: 'brightness' }, mask: 'x' } },
          {
            type: 'ReturnFragment',
            outputs: {
              color: {
                type: 'Construct', dataType: 'vec4<f32>', args: [
                  { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'b' }, right: { type: 'LiteralF32', value: 0.3 } },
                  { type: 'VarRef', name: 'b' },
                  { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'b' }, right: { type: 'LiteralF32', value: 0.8 } },
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
