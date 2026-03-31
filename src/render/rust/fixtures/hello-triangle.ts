/**
 * hello-triangle: Minimal vertical slice — compute color, draw_prep, render.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

export const helloTriangle: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:tri_active': { type: 'u32', clearValue: 1 },
    },
    domains: {
      tri: {
        capacity: 1,
        activeLanesSymbol: 'sys:tri_active',
        fields: {
          color_r: { type: 'f32', clearValue: 0 },
          color_g: { type: 'f32', clearValue: 0 },
          color_b: { type: 'f32', clearValue: 0 },
        },
      },
    },
    textures: {},
    shapeBank: {
      unit_triangle: {
        topology: 'triangle-list',
        vertexLayout: {
          stride: 8,
          attributes: {
            position: { format: 'float32x2', shaderLocation: 0 },
          },
        },
        vertexData: [0.0, 0.5, -0.5, -0.5, 0.5, -0.5],
      },
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'eval_color',
      sourceBlockIds: [],
      workgroupSize: [1, 1, 1],
      dispatch: { mode: 'Exact', x: 1, y: 1, z: 1 },
      dependencies: {
        requiresGlobals: true,
        domains: { tri: 'read_write' },
        textures: {},
      },
      ast: [
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        {
          type: 'StoreField', symbolId: 'tri:color_r',
          index: { type: 'LiteralU32', value: 0 },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'time' }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        {
          type: 'StoreField', symbolId: 'tri:color_g',
          index: { type: 'LiteralU32', value: 0 },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 2.094 } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        {
          type: 'StoreField', symbolId: 'tri:color_b',
          index: { type: 'LiteralU32', value: 0 },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 4.189 } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        { type: 'StoreScalar', symbolId: 'sys:tri_active', value: { type: 'LiteralU32', value: 1 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep_tri', sourceBlockIds: [], activeLanesSymbol: 'sys:tri_active', vertexCount: 3 },
    {
      type: 'Render', passId: 'draw', sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0, 0, 0, 1] }] },
      drawCalls: [{
        intentId: 'tri_fill',
        source: { type: 'Domain', domainId: 'tri', sourceKind: 'Topology', shapeId: 'unit_triangle' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { tri: 'read' }, textures: {} },
        vertexAst: [{
          type: 'ReturnVertex',
          position: {
            type: 'Construct', dataType: 'vec4<f32>', args: [
              { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' },
              { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' },
              { type: 'LiteralF32', value: 0.0 },
              { type: 'LiteralF32', value: 1.0 },
            ],
          },
          varyings: {},
        }],
        fragmentAst: [
          { type: 'Let', name: 'r', value: { type: 'LoadField', symbolId: 'tri:color_r', index: { type: 'LiteralU32', value: 0 } } },
          { type: 'Let', name: 'g', value: { type: 'LoadField', symbolId: 'tri:color_g', index: { type: 'LiteralU32', value: 0 } } },
          { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'tri:color_b', index: { type: 'LiteralU32', value: 0 } } },
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
