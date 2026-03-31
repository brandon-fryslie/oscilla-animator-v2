/**
 * varying-gradient: Triangle with per-vertex color passed as a varying.
 * Gate 5: Tests vertex→fragment varyings via inter-stage struct.
 * The GPU interpolates the varying across the triangle face.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

export const varyingGradient: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 1 },
    },
    domains: {
      tri: {
        capacity: 1,
        activeLanesSymbol: 'sys:active',
        fields: {
          _pad: { type: 'f32', clearValue: 0 },
        },
      },
    },
    textures: {},
    shapeBank: {
      big_triangle: {
        topology: 'triangle-list',
        vertexLayout: {
          stride: 8,
          attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
        },
        // Large triangle filling most of the viewport
        vertexData: [0.0, 0.8, -0.8, -0.6, 0.8, -0.6],
      },
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    // Minimal compute: just write active count
    {
      type: 'Compute', passId: 'setup', sourceBlockIds: [],
      workgroupSize: [1, 1, 1],
      dispatch: { mode: 'Exact', x: 1, y: 1, z: 1 },
      dependencies: { requiresGlobals: true, domains: { tri: 'read_write' }, textures: {} },
      ast: [
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 1 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 3 },
    {
      type: 'Render', passId: 'draw', sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.05, 0.05, 0.07, 1] }] },
      drawCalls: [{
        intentId: 'gradient_tri',
        source: { type: 'Domain', domainId: 'tri', sourceKind: 'Topology', shapeId: 'big_triangle' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { tri: 'read' }, textures: {} },
        // Vertex: assign a different color per vertex using vertex_index, pass as varying
        vertexAst: [
          { type: 'Let', name: 'vid', value: { type: 'Intrinsic', name: 'vertex_index' } },
          // Each vertex gets a different phase: vid * 2.094 (120° apart)
          {
            type: 'Let', name: 'phase', value: {
              type: 'BinaryOp', op: '*',
              left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'vid' } },
              right: { type: 'LiteralF32', value: 2.094 },
            },
          },
          {
            type: 'Let', name: 'vcolor', value: {
              type: 'Construct', dataType: 'vec4<f32>', args: [
                { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'phase' }] }, right: { type: 'LiteralF32', value: 0.5 } }, right: { type: 'LiteralF32', value: 0.5 } },
                { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 'phase' }, right: { type: 'LiteralF32', value: 2.094 } }] }, right: { type: 'LiteralF32', value: 0.5 } }, right: { type: 'LiteralF32', value: 0.5 } },
                { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 'phase' }, right: { type: 'LiteralF32', value: 4.189 } }] }, right: { type: 'LiteralF32', value: 0.5 } }, right: { type: 'LiteralF32', value: 0.5 } },
                { type: 'LiteralF32', value: 1.0 },
              ],
            },
          },
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
            // Pass color as a varying — GPU interpolates across triangle
            varyings: {
              color: { type: 'VarRef', name: 'vcolor' },
            },
          },
        ],
        // Fragment: use the interpolated color varying directly
        fragmentAst: [
          {
            type: 'ReturnFragment',
            outputs: {
              color: { type: 'VarRef', name: 'color' },
            },
          },
        ],
      }],
    },
  ],
};
