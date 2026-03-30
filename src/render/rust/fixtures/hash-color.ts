/**
 * hash-color: 64 instances with PCG-hash-derived colors in a ring.
 * Gate 3: Tests bitwise operators (XOR, shift, AND, multiply).
 * Uses same render pass pattern as instanced-write (proven working).
 */

import type { PipelineInstallPayload } from '../boundary-contract';

const TAU = Math.PI * 2;
const N = 64;

export const hashColor: PipelineInstallPayload = {
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
          color_r: { type: 'f32', clearValue: 0 },
          color_g: { type: 'f32', clearValue: 0 },
          color_b: { type: 'f32', clearValue: 0 },
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
          -0.04, -0.04, 0.04, -0.04, 0.04, 0.04,
          -0.04, -0.04, 0.04, 0.04, -0.04, 0.04,
        ],
      },
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    // Compute: hash gid for color, ring for position
    {
      type: 'Compute',
      passId: 'hash_colors',
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
        // Ring position
        {
          type: 'Let', name: 'angle', value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } }, right: { type: 'LiteralF32', value: TAU / N } },
            right: { type: 'VarRef', name: 'time' },
          },
        },
        { type: 'StoreField', symbolId: 'dots:pos_x', index: { type: 'VarRef', name: 'gid' }, value: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'VarRef', name: 'angle' }] }, right: { type: 'LiteralF32', value: 0.7 } } },
        { type: 'StoreField', symbolId: 'dots:pos_y', index: { type: 'VarRef', name: 'gid' }, value: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'angle' }] }, right: { type: 'LiteralF32', value: 0.7 } } },
        // PCG-style hash: h0 = gid * 747796405u + 2891336453u
        {
          type: 'Let', name: 'h0', value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'gid' }, right: { type: 'LiteralU32', value: 747796405 } },
            right: { type: 'LiteralU32', value: 2891336453 },
          },
        },
        // h1 = ((h0 >> 16u) ^ h0) * 2654435769u
        {
          type: 'Let', name: 'h1', value: {
            type: 'BinaryOp', op: '*',
            left: { type: 'BinaryOp', op: '^', left: { type: 'BinaryOp', op: '>>', left: { type: 'VarRef', name: 'h0' }, right: { type: 'LiteralU32', value: 16 } }, right: { type: 'VarRef', name: 'h0' } },
            right: { type: 'LiteralU32', value: 2654435769 },
          },
        },
        // h2 = ((h1 >> 16u) ^ h1)
        {
          type: 'Let', name: 'h2', value: {
            type: 'BinaryOp', op: '^',
            left: { type: 'BinaryOp', op: '>>', left: { type: 'VarRef', name: 'h1' }, right: { type: 'LiteralU32', value: 16 } },
            right: { type: 'VarRef', name: 'h1' },
          },
        },
        // r = f32(h2 & 0xFF) / 255.0
        { type: 'StoreField', symbolId: 'dots:color_r', index: { type: 'VarRef', name: 'gid' }, value: { type: 'BinaryOp', op: '/', left: { type: 'Cast', targetType: 'f32', expr: { type: 'BinaryOp', op: '&', left: { type: 'VarRef', name: 'h2' }, right: { type: 'LiteralU32', value: 255 } } }, right: { type: 'LiteralF32', value: 255.0 } } },
        // g = f32((h2 >> 8u) & 0xFF) / 255.0
        { type: 'StoreField', symbolId: 'dots:color_g', index: { type: 'VarRef', name: 'gid' }, value: { type: 'BinaryOp', op: '/', left: { type: 'Cast', targetType: 'f32', expr: { type: 'BinaryOp', op: '&', left: { type: 'BinaryOp', op: '>>', left: { type: 'VarRef', name: 'h2' }, right: { type: 'LiteralU32', value: 8 } }, right: { type: 'LiteralU32', value: 255 } } }, right: { type: 'LiteralF32', value: 255.0 } } },
        // b = f32((h2 >> 16u) & 0xFF) / 255.0
        { type: 'StoreField', symbolId: 'dots:color_b', index: { type: 'VarRef', name: 'gid' }, value: { type: 'BinaryOp', op: '/', left: { type: 'Cast', targetType: 'f32', expr: { type: 'BinaryOp', op: '&', left: { type: 'BinaryOp', op: '>>', left: { type: 'VarRef', name: 'h2' }, right: { type: 'LiteralU32', value: 16 } }, right: { type: 'LiteralU32', value: 255 } } }, right: { type: 'LiteralF32', value: 255.0 } } },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: N } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    // Render: same pattern as instanced-write (known working)
    {
      type: 'Render', passId: 'draw', sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.08, 0.08, 0.1, 1] }] },
      drawCalls: [{
        intentId: 'dots_fill',
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
