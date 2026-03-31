/**
 * sdf-circle: Fragment derivative fixture for anti-aliased SDF rendering.
 * Gate 8: Tests dpdx, dpdy, and fwidth in fragment stage.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

export const sdfCircle: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {},
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
      fullscreen_triangle: {
        topology: 'triangle-list',
        vertexLayout: {
          stride: 8,
          attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
        },
        vertexData: [-1.0, -1.0, 3.0, -1.0, -1.0, 3.0],
      },
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'set_active',
      sourceBlockIds: [],
      workgroupSize: [1, 1, 1],
      dispatch: { mode: 'Exact', x: 1, y: 1, z: 1 },
      dependencies: { requiresGlobals: false, domains: {}, textures: {} },
      ast: [
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 1 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 3 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: {
        colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.02, 0.02, 0.03, 1.0] }],
      },
      drawCalls: [{
        intentId: 'sdf_circle',
        source: { type: 'Domain', domainId: 'tri', sourceKind: 'Topology', shapeId: 'fullscreen_triangle' },
        pipelineState: {
          blendMode: 'opaque',
          cullMode: 'none',
          depthWrite: false,
          depthCompare: 'always',
        },
        dependencies: { requiresGlobals: false, domains: { tri: 'read' }, textures: {} },
        vertexAst: [
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
                { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' },
                { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' },
                { type: 'LiteralF32', value: 0.0 },
                { type: 'LiteralF32', value: 1.0 },
              ],
            },
            varyings: {
              uv: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: {
                      type: 'BinaryOp',
                      op: '*',
                      left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' },
                      right: { type: 'LiteralF32', value: 0.5 },
                    },
                    right: { type: 'LiteralF32', value: 0.5 },
                  },
                  {
                    type: 'BinaryOp',
                    op: '-',
                    left: { type: 'LiteralF32', value: 1.0 },
                    right: {
                      type: 'BinaryOp',
                      op: '+',
                      left: {
                        type: 'BinaryOp',
                        op: '*',
                        left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' },
                        right: { type: 'LiteralF32', value: 0.5 },
                      },
                      right: { type: 'LiteralF32', value: 0.5 },
                    },
                  },
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
            name: 'centered',
            value: {
              type: 'Construct',
              dataType: 'vec2<f32>',
              args: [
                {
                  type: 'BinaryOp',
                  op: '-',
                  left: { type: 'Swizzle', source: { type: 'VarRef', name: 'uv' }, mask: 'x' },
                  right: { type: 'LiteralF32', value: 0.5 },
                },
                {
                  type: 'BinaryOp',
                  op: '-',
                  left: { type: 'Swizzle', source: { type: 'VarRef', name: 'uv' }, mask: 'y' },
                  right: { type: 'LiteralF32', value: 0.5 },
                },
              ],
            },
          },
          {
            type: 'Let',
            name: 'distance_to_edge',
            value: {
              type: 'BinaryOp',
              op: '-',
              left: {
                type: 'CallBuiltin',
                func: 'length',
                args: [{ type: 'VarRef', name: 'centered' }],
              },
              right: { type: 'LiteralF32', value: 0.3 },
            },
          },
          {
            type: 'Let',
            name: 'grad_x',
            value: {
              type: 'CallBuiltin',
              func: 'dpdx',
              args: [{ type: 'VarRef', name: 'distance_to_edge' }],
            },
          },
          {
            type: 'Let',
            name: 'grad_y',
            value: {
              type: 'CallBuiltin',
              func: 'dpdy',
              args: [{ type: 'VarRef', name: 'distance_to_edge' }],
            },
          },
          {
            type: 'Let',
            name: 'width_auto',
            value: {
              type: 'CallBuiltin',
              func: 'fwidth',
              args: [{ type: 'VarRef', name: 'distance_to_edge' }],
            },
          },
          {
            type: 'Let',
            name: 'width_manual',
            value: {
              type: 'CallBuiltin',
              func: 'max',
              args: [
                {
                  type: 'CallBuiltin',
                  func: 'abs',
                  args: [{ type: 'VarRef', name: 'grad_x' }],
                },
                {
                  type: 'CallBuiltin',
                  func: 'abs',
                  args: [{ type: 'VarRef', name: 'grad_y' }],
                },
              ],
            },
          },
          {
            type: 'Let',
            name: 'aa_width',
            value: {
              type: 'CallBuiltin',
              func: 'max',
              args: [
                {
                  type: 'CallBuiltin',
                  func: 'max',
                  args: [{ type: 'VarRef', name: 'width_auto' }, { type: 'VarRef', name: 'width_manual' }],
                },
                { type: 'LiteralF32', value: 0.0008 },
              ],
            },
          },
          {
            type: 'Let',
            name: 'coverage',
            value: {
              type: 'BinaryOp',
              op: '-',
              left: { type: 'LiteralF32', value: 1.0 },
              right: {
                type: 'CallBuiltin',
                func: 'smoothstep',
                args: [
                  {
                    type: 'UnaryOp',
                    op: '-',
                    expr: { type: 'VarRef', name: 'aa_width' },
                  },
                  { type: 'VarRef', name: 'aa_width' },
                  { type: 'VarRef', name: 'distance_to_edge' },
                ],
              },
            },
          },
          {
            type: 'ReturnFragment',
            outputs: {
              color: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'LiteralF32', value: 0.1 },
                    right: {
                      type: 'BinaryOp',
                      op: '*',
                      left: { type: 'VarRef', name: 'coverage' },
                      right: { type: 'LiteralF32', value: 0.85 },
                    },
                  },
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'LiteralF32', value: 0.2 },
                    right: {
                      type: 'BinaryOp',
                      op: '*',
                      left: { type: 'VarRef', name: 'coverage' },
                      right: { type: 'LiteralF32', value: 0.55 },
                    },
                  },
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'LiteralF32', value: 0.35 },
                    right: {
                      type: 'BinaryOp',
                      op: '*',
                      left: { type: 'VarRef', name: 'coverage' },
                      right: { type: 'LiteralF32', value: 0.35 },
                    },
                  },
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
