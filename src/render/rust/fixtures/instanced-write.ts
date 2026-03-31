/**
 * instanced-write: 64 instances placed in a ring via parallel compute.
 * Gate 1: Tests global_invocation_id, Cast, Domain dispatch, instanced draw_indirect.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

const TAU = Math.PI * 2;
const INSTANCE_COUNT = 64;

export const instancedWrite: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: INSTANCE_COUNT },
    },
    domains: {
      dots: {
        capacity: INSTANCE_COUNT,
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
      unit_quad: {
        topology: 'triangle-list',
        vertexLayout: {
          stride: 8,
          attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
        },
        // Two triangles forming a small quad centered at origin, size ~0.06
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
    // Pass 1: Compute — place 64 instances in a ring, color based on index + time
    {
      type: 'Compute',
      passId: 'eval_instances',
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
        // angle = f32(gid) * TAU / 64.0 + time
        {
          type: 'Let', name: 'angle', value: {
            type: 'BinaryOp', op: '+',
            left: {
              type: 'BinaryOp', op: '*',
              left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
              right: { type: 'LiteralF32', value: TAU / INSTANCE_COUNT },
            },
            right: { type: 'VarRef', name: 'time' },
          },
        },
        // pos_x = cos(angle) * 0.7
        {
          type: 'StoreField', symbolId: 'dots:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '*',
            left: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'VarRef', name: 'angle' }] },
            right: { type: 'LiteralF32', value: 0.7 },
          },
        },
        // pos_y = sin(angle) * 0.7
        {
          type: 'StoreField', symbolId: 'dots:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '*',
            left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'angle' }] },
            right: { type: 'LiteralF32', value: 0.7 },
          },
        },
        // color_r = sin(angle) * 0.5 + 0.5
        {
          type: 'StoreField', symbolId: 'dots:color_r',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'angle' }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        // color_g = sin(angle + 2.094) * 0.5 + 0.5
        {
          type: 'StoreField', symbolId: 'dots:color_g',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 'angle' }, right: { type: 'LiteralF32', value: 2.094 } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        // color_b = sin(angle + 4.189) * 0.5 + 0.5
        {
          type: 'StoreField', symbolId: 'dots:color_b',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 'angle' }, right: { type: 'LiteralF32', value: 4.189 } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        // Write active count
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: INSTANCE_COUNT } },
      ],
    },
    // Pass 2: DrawPrep
    {
      type: 'System_DrawPrep',
      passId: 'prep_dots',
      sourceBlockIds: [],
      activeLanesSymbol: 'sys:active',
      vertexCount: 6,
    },
    // Pass 3: Render — draw instanced quads at domain positions with domain colors
    {
      type: 'Render',
      passId: 'draw_dots',
      sourceBlockIds: [],
      targets: {
        colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.05, 0.05, 0.07, 1] }],
      },
      drawCalls: [{
        intentId: 'dots_fill',
        source: { type: 'Domain', domainId: 'dots', sourceKind: 'Topology', shapeId: 'unit_quad' },
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
            varyings: {},
          },
        ],
        fragmentAst: [
          { type: 'Let', name: 'r', value: { type: 'LoadField', symbolId: 'dots:color_r', index: { type: 'LiteralU32', value: 0 } } },
          { type: 'Let', name: 'g', value: { type: 'LoadField', symbolId: 'dots:color_g', index: { type: 'LiteralU32', value: 0 } } },
          { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'dots:color_b', index: { type: 'LiteralU32', value: 0 } } },
          {
            type: 'ReturnFragment',
            outputs: {
              color: { type: 'Construct', dataType: 'vec4<f32>', args: [{ type: 'VarRef', name: 'r' }, { type: 'VarRef', name: 'g' }, { type: 'VarRef', name: 'b' }, { type: 'LiteralF32', value: 1.0 }] },
            },
          },
        ],
      }],
    },
  ],
};
