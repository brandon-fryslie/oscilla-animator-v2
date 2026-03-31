/**
 * vector-math: Instanced ring using vector lighting math.
 * Gate 4: Tests dot/normalize/reflect/length, IndexAccess, and multi-component swizzle.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

const N = 48;
const TAU = Math.PI * 2;

export const vectorMath: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: N },
    },
    domains: {
      dots: {
        capacity: N,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          color_r: { type: 'f32', clearValue: 1 },
          color_g: { type: 'f32', clearValue: 1 },
          color_b: { type: 'f32', clearValue: 1 },
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
      passId: 'vector_light',
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
          type: 'Let', name: 'angle', value: {
            type: 'BinaryOp', op: '+',
            left: {
              type: 'BinaryOp', op: '*',
              left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
              right: { type: 'LiteralF32', value: TAU / N },
            },
            right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.35 } },
          },
        },
        {
          type: 'StoreField', symbolId: 'dots:pos_x', index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '*',
            left: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'VarRef', name: 'angle' }] },
            right: { type: 'LiteralF32', value: 0.72 },
          },
        },
        {
          type: 'StoreField', symbolId: 'dots:pos_y', index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '*',
            left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'angle' }] },
            right: { type: 'LiteralF32', value: 0.72 },
          },
        },
        {
          type: 'Let',
          name: 'normal',
          value: {
            type: 'CallBuiltin',
            func: 'normalize',
            args: [{
              type: 'Construct', dataType: 'vec3<f32>', args: [
                { type: 'CallBuiltin', func: 'cos', args: [{ type: 'VarRef', name: 'angle' }] },
                { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'angle' }] },
                { type: 'LiteralF32', value: 0.5 },
              ],
            }],
          },
        },
        {
          type: 'Let',
          name: 'light',
          value: {
            type: 'CallBuiltin',
            func: 'normalize',
            args: [{
              type: 'Construct', dataType: 'vec3<f32>', args: [
                { type: 'LiteralF32', value: 0.6 },
                { type: 'LiteralF32', value: 0.35 },
                { type: 'LiteralF32', value: 0.7 },
              ],
            }],
          },
        },
        {
          type: 'Let',
          name: 'ndotl',
          value: {
            type: 'CallBuiltin',
            func: 'max',
            args: [
              { type: 'CallBuiltin', func: 'dot', args: [{ type: 'VarRef', name: 'normal' }, { type: 'VarRef', name: 'light' }] },
              { type: 'LiteralF32', value: 0.0 },
            ],
          },
        },
        {
          type: 'Let',
          name: 'refl',
          value: {
            type: 'CallBuiltin',
            func: 'reflect',
            args: [
              { type: 'Construct', dataType: 'vec3<f32>', args: [{ type: 'LiteralF32', value: 0.0 }, { type: 'LiteralF32', value: 0.0 }, { type: 'LiteralF32', value: -1.0 }] },
              { type: 'VarRef', name: 'normal' },
            ],
          },
        },
        { type: 'Let', name: 'refl_xy', value: { type: 'Swizzle', source: { type: 'VarRef', name: 'refl' }, mask: 'xy' } },
        { type: 'Let', name: 'rim', value: { type: 'CallBuiltin', func: 'length', args: [{ type: 'VarRef', name: 'refl_xy' }] } },
        { type: 'Let', name: 'refl_z', value: { type: 'IndexAccess', target: { type: 'VarRef', name: 'refl' }, index: { type: 'LiteralI32', value: 2 } } },
        {
          type: 'Let',
          name: 'bright',
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
                  left: { type: 'VarRef', name: 'ndotl' },
                  right: {
                    type: 'BinaryOp',
                    op: '*',
                    left: { type: 'CallBuiltin', func: 'abs', args: [{ type: 'VarRef', name: 'refl_z' }] },
                    right: { type: 'LiteralF32', value: 0.35 },
                  },
                },
                right: {
                  type: 'BinaryOp',
                  op: '*',
                  left: { type: 'VarRef', name: 'rim' },
                  right: { type: 'LiteralF32', value: 0.15 },
                },
              },
              { type: 'LiteralF32', value: 0.0 },
              { type: 'LiteralF32', value: 1.0 },
            ],
          },
        },
        { type: 'StoreField', symbolId: 'dots:color_r', index: { type: 'VarRef', name: 'gid' }, value: { type: 'VarRef', name: 'bright' } },
        {
          type: 'StoreField',
          symbolId: 'dots:color_g',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'bright' }, right: { type: 'LiteralF32', value: 0.7 } },
        },
        {
          type: 'StoreField',
          symbolId: 'dots:color_b',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'bright' }, right: { type: 'LiteralF32', value: 0.4 } },
            right: { type: 'LiteralF32', value: 0.2 },
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
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.04, 0.04, 0.07, 1] }] },
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
              color: {
                type: 'Construct', dataType: 'vec4<f32>', args: [
                  { type: 'LoadField', symbolId: 'dots:color_r', index: { type: 'VarRef', name: 'iid' } },
                  { type: 'LoadField', symbolId: 'dots:color_g', index: { type: 'VarRef', name: 'iid' } },
                  { type: 'LoadField', symbolId: 'dots:color_b', index: { type: 'VarRef', name: 'iid' } },
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
