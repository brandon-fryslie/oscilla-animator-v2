/**
 * Demo behavior fixtures derived from design-docs/DEMO-PATCHES.md.
 *
 * These are boundary-level payload fixtures (manifest + roster + AST), not block-graph fixtures.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

const TAU = Math.PI * 2;

function quadShape(size: number) {
  return {
    topology: 'triangle-list' as const,
    vertexLayout: {
      stride: 8,
      attributes: { position: { format: 'float32x2' as const, shaderLocation: 0 } },
    },
    vertexData: [
      -size, -size, size, -size, size, size,
      -size, -size, size, size, -size, size,
    ],
  };
}

export const demoGridSquares: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 100 },
    },
    domains: {
      squares: {
        capacity: 100,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          angle: { type: 'f32', clearValue: 0 },
          scale: { type: 'f32', clearValue: 0.05 },
          color_r: { type: 'f32', clearValue: 0.7 },
          color_g: { type: 'f32', clearValue: 0.7 },
          color_b: { type: 'f32', clearValue: 0.9 },
        },
      },
    },
    textures: {},
    shapeBank: {
      square: quadShape(0.05),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'layout_grid',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'squares' },
      dependencies: {
        requiresGlobals: true,
        domains: { squares: 'read_write' },
        textures: {},
      },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        {
          type: 'Let',
          name: 'col',
          value: {
            type: 'Cast',
            targetType: 'f32',
            expr: { type: 'BinaryOp', op: '%', left: { type: 'VarRef', name: 'gid' }, right: { type: 'LiteralU32', value: 10 } },
          },
        },
        {
          type: 'Let',
          name: 'row',
          value: {
            type: 'Cast',
            targetType: 'f32',
            expr: { type: 'BinaryOp', op: '/', left: { type: 'VarRef', name: 'gid' }, right: { type: 'LiteralU32', value: 10 } },
          },
        },
        {
          type: 'Let',
          name: 'rank',
          value: {
            type: 'BinaryOp',
            op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
            right: { type: 'LiteralF32', value: 99 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'squares:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'col' }, right: { type: 'LiteralF32', value: 0.18 } },
            right: { type: 'LiteralF32', value: 0.81 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'squares:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'row' }, right: { type: 'LiteralF32', value: 0.18 } },
            right: { type: 'LiteralF32', value: 0.81 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'squares:angle',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: {
              type: 'BinaryOp',
              op: '*',
              left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
              right: { type: 'LiteralF32', value: 0.5 },
            },
            right: {
              type: 'BinaryOp',
              op: '*',
              left: { type: 'VarRef', name: 'time' },
              right: { type: 'LiteralF32', value: 2.0 },
            },
          },
        },
        {
          type: 'Let',
          name: 'h',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'VarRef', name: 'rank' },
            right: {
              type: 'BinaryOp',
              op: '*',
              left: { type: 'VarRef', name: 'time' },
              right: { type: 'LiteralF32', value: 0.2 },
            },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'squares:color_r',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: {
              type: 'BinaryOp',
              op: '*',
              left: {
                type: 'CallBuiltin',
                func: 'sin',
                args: [{ type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralF32', value: TAU } }],
              },
              right: { type: 'LiteralF32', value: 0.5 },
            },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'squares:color_g',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: {
              type: 'BinaryOp',
              op: '*',
              left: {
                type: 'CallBuiltin',
                func: 'sin',
                args: [{
                  type: 'BinaryOp',
                  op: '+',
                  left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralF32', value: TAU } },
                  right: { type: 'LiteralF32', value: 2.094 },
                }],
              },
              right: { type: 'LiteralF32', value: 0.5 },
            },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'squares:color_b',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: {
              type: 'BinaryOp',
              op: '*',
              left: {
                type: 'CallBuiltin',
                func: 'sin',
                args: [{
                  type: 'BinaryOp',
                  op: '+',
                  left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralF32', value: TAU } },
                  right: { type: 'LiteralF32', value: 4.188 },
                }],
              },
              right: { type: 'LiteralF32', value: 0.5 },
            },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        { type: 'StoreField', symbolId: 'squares:scale', index: { type: 'VarRef', name: 'gid' }, value: { type: 'LiteralF32', value: 0.05 } },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 100 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep_grid', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw_grid',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.03, 0.03, 0.04, 1] }] },
      drawCalls: [{
        intentId: 'grid_squares',
        source: { type: 'Domain', domainId: 'squares', sourceKind: 'Topology', shapeId: 'square' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { squares: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'squares:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'squares:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'a', value: { type: 'LoadField', symbolId: 'squares:angle', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 's', value: { type: 'LoadField', symbolId: 'squares:scale', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'lx', value: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' } },
          { type: 'Let', name: 'ly', value: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' } },
          { type: 'Let', name: 'ca', value: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'VarRef', name: 'a' }] } },
          { type: 'Let', name: 'sa', value: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'a' }] } },
          {
            type: 'Let',
            name: 'rx',
            value: {
              type: 'BinaryOp',
              op: '-',
              left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'lx' }, right: { type: 'VarRef', name: 'ca' } },
              right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'ly' }, right: { type: 'VarRef', name: 'sa' } },
            },
          },
          {
            type: 'Let',
            name: 'ry',
            value: {
              type: 'BinaryOp',
              op: '+',
              left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'lx' }, right: { type: 'VarRef', name: 'sa' } },
              right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'ly' }, right: { type: 'VarRef', name: 'ca' } },
            },
          },
          { type: 'Let', name: 'r', value: { type: 'LoadField', symbolId: 'squares:color_r', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'g', value: { type: 'LoadField', symbolId: 'squares:color_g', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'squares:color_b', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
                { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rx' }, right: { type: 'VarRef', name: 's' } }, right: { type: 'VarRef', name: 'px' } },
                { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'ry' }, right: { type: 'VarRef', name: 's' } }, right: { type: 'VarRef', name: 'py' } },
                { type: 'LiteralF32', value: 0 },
                { type: 'LiteralF32', value: 1 },
              ],
            },
            varyings: {
              color: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [{ type: 'VarRef', name: 'r' }, { type: 'VarRef', name: 'g' }, { type: 'VarRef', name: 'b' }, { type: 'LiteralF32', value: 1 }],
              },
            },
          },
        ],
        fragmentAst: [{ type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } }],
      }],
    },
  ],
};

export const demoSpirographTrace: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 600 },
    },
    domains: {
      points: {
        capacity: 600,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          color_r: { type: 'f32', clearValue: 0.8 },
          color_g: { type: 'f32', clearValue: 0.8 },
          color_b: { type: 'f32', clearValue: 1.0 },
        },
      },
    },
    textures: {},
    shapeBank: {
      point: quadShape(0.005),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'spiro',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'points' },
      dependencies: { requiresGlobals: true, domains: { points: 'read_write' }, textures: {} },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        {
          type: 'Let',
          name: 'rank',
          value: {
            type: 'BinaryOp',
            op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
            right: { type: 'LiteralF32', value: 599 },
          },
        },
        { type: 'Let', name: 'phase', value: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: TAU } } },
        {
          type: 'StoreField',
          symbolId: 'points:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '*',
            left: {
              type: 'CallBuiltin',
              func: 'sin',
              args: [{
                type: 'BinaryOp',
                op: '+',
                left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 3.0 } },
                right: { type: 'VarRef', name: 'phase' },
              }],
            },
            right: { type: 'LiteralF32', value: 0.75 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'points:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '*',
            left: {
              type: 'CallBuiltin',
              func: 'cos',
              args: [{
                type: 'BinaryOp',
                op: '+',
                left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 2.3 } },
                right: { type: 'VarRef', name: 'phase' },
              }],
            },
            right: { type: 'LiteralF32', value: 0.75 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'points:color_r',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: TAU } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'points:color_g',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: TAU } }, right: { type: 'LiteralF32', value: 2.094 } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'points:color_b',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: TAU } }, right: { type: 'LiteralF32', value: 4.188 } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 600 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.01, 0.01, 0.03, 1] }] },
      drawCalls: [{
        intentId: 'trace',
        source: { type: 'Domain', domainId: 'points', sourceKind: 'Topology', shapeId: 'point' },
        pipelineState: { blendMode: 'additive', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { points: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'points:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'points:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'r', value: { type: 'LoadField', symbolId: 'points:color_r', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'g', value: { type: 'LoadField', symbolId: 'points:color_g', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'points:color_b', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
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
                args: [{ type: 'VarRef', name: 'r' }, { type: 'VarRef', name: 'g' }, { type: 'VarRef', name: 'b' }, { type: 'LiteralF32', value: 0.85 }],
              },
            },
          },
        ],
        fragmentAst: [{ type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } }],
      }],
    },
  ],
};

export const demoMouseReactiveField: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 300 },
    },
    domains: {
      dots: {
        capacity: 300,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          size: { type: 'f32', clearValue: 0.01 },
          brightness: { type: 'f32', clearValue: 0.2 },
        },
      },
    },
    textures: {},
    shapeBank: {
      dot: quadShape(0.01),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'mouse_field',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'dots' },
      dependencies: { requiresGlobals: true, domains: { dots: 'read_write' }, textures: {} },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        { type: 'Let', name: 'h', value: { type: 'CallBuiltin', func: 'hash_u32', args: [{ type: 'VarRef', name: 'gid' }] } },
        {
          type: 'Let',
          name: 'u',
          value: {
            type: 'BinaryOp',
            op: '/',
            left: {
              type: 'Cast',
              targetType: 'f32',
              expr: { type: 'BinaryOp', op: '&', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralU32', value: 1023 } },
            },
            right: { type: 'LiteralF32', value: 1023 },
          },
        },
        {
          type: 'Let',
          name: 'v',
          value: {
            type: 'BinaryOp',
            op: '/',
            left: {
              type: 'Cast',
              targetType: 'f32',
              expr: { type: 'BinaryOp', op: '&', left: { type: 'BinaryOp', op: '>>', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralU32', value: 10 } }, right: { type: 'LiteralU32', value: 1023 } },
            },
            right: { type: 'LiteralF32', value: 1023 },
          },
        },
        {
          type: 'Let',
          name: 'px',
          value: {
            type: 'BinaryOp',
            op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'u' }, right: { type: 'LiteralF32', value: 1.8 } },
            right: { type: 'LiteralF32', value: 0.9 },
          },
        },
        {
          type: 'Let',
          name: 'py',
          value: {
            type: 'BinaryOp',
            op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'v' }, right: { type: 'LiteralF32', value: 1.8 } },
            right: { type: 'LiteralF32', value: 0.9 },
          },
        },
        { type: 'StoreField', symbolId: 'dots:pos_x', index: { type: 'VarRef', name: 'gid' }, value: { type: 'VarRef', name: 'px' } },
        { type: 'StoreField', symbolId: 'dots:pos_y', index: { type: 'VarRef', name: 'gid' }, value: { type: 'VarRef', name: 'py' } },
        {
          type: 'Let',
          name: 'mx',
          value: {
            type: 'BinaryOp',
            op: '*',
            left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.6 } }] },
            right: { type: 'LiteralF32', value: 0.45 },
          },
        },
        {
          type: 'Let',
          name: 'my',
          value: {
            type: 'BinaryOp',
            op: '*',
            left: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.4 } }] },
            right: { type: 'LiteralF32', value: 0.45 },
          },
        },
        {
          type: 'Let',
          name: 'dist',
          value: {
            type: 'CallBuiltin',
            func: 'length',
            args: [{
              type: 'Construct',
              dataType: 'vec2<f32>',
              args: [
                { type: 'BinaryOp', op: '-', left: { type: 'VarRef', name: 'px' }, right: { type: 'VarRef', name: 'mx' } },
                { type: 'BinaryOp', op: '-', left: { type: 'VarRef', name: 'py' }, right: { type: 'VarRef', name: 'my' } },
              ],
            }],
          },
        },
        {
          type: 'Let',
          name: 'b',
          value: {
            type: 'BinaryOp',
            op: '-',
            left: { type: 'LiteralF32', value: 1.0 },
            right: {
              type: 'CallBuiltin',
              func: 'clamp',
              args: [
                { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'dist' }, right: { type: 'LiteralF32', value: 2.2 } },
                { type: 'LiteralF32', value: 0.0 },
                { type: 'LiteralF32', value: 1.0 },
              ],
            },
          },
        },
        { type: 'StoreField', symbolId: 'dots:brightness', index: { type: 'VarRef', name: 'gid' }, value: { type: 'VarRef', name: 'b' } },
        {
          type: 'StoreField',
          symbolId: 'dots:size',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'b' }, right: { type: 'LiteralF32', value: 0.03 } },
            right: { type: 'LiteralF32', value: 0.004 },
          },
        },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 300 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.02, 0.02, 0.03, 1] }] },
      drawCalls: [{
        intentId: 'mouse_field',
        source: { type: 'Domain', domainId: 'dots', sourceKind: 'Topology', shapeId: 'dot' },
        pipelineState: { blendMode: 'additive', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { dots: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'dots:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'dots:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 's', value: { type: 'LoadField', symbolId: 'dots:size', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'dots:brightness', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
                { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'VarRef', name: 's' } }, right: { type: 'VarRef', name: 'px' } },
                { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' }, right: { type: 'VarRef', name: 's' } }, right: { type: 'VarRef', name: 'py' } },
                { type: 'LiteralF32', value: 0 },
                { type: 'LiteralF32', value: 1 },
              ],
            },
            varyings: {
              color: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [{ type: 'VarRef', name: 'b' }, { type: 'VarRef', name: 'b' }, { type: 'VarRef', name: 'b' }, { type: 'LiteralF32', value: 1 }],
              },
            },
          },
        ],
        fragmentAst: [{ type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } }],
      }],
    },
  ],
};

export const demoColorRampPalette: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 200 },
    },
    domains: {
      line: {
        capacity: 200,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          rank: { type: 'f32', clearValue: 0 },
        },
      },
    },
    textures: {
      palette: {
        dimension: '2d',
        width: 256,
        height: 1,
        format: 'rgba8unorm',
        usage: ['storage', 'sampled'],
      },
    },
    shapeBank: {
      bar: quadShape(0.01),
    },
    dataStreams: {},
    samplers: {
      linear: {
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      },
    },
  },
  roster: [
    {
      type: 'Compute',
      passId: 'fill_palette',
      sourceBlockIds: [],
      workgroupSize: [32, 1, 1],
      dispatch: { mode: 'Exact', x: 8, y: 1, z: 1 },
      dependencies: { requiresGlobals: true, domains: {}, textures: { palette: 'write' } },
      ast: [
        { type: 'Let', name: 'x', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        {
          type: 'Let',
          name: 't',
          value: {
            type: 'BinaryOp',
            op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'x' } },
            right: { type: 'LiteralF32', value: 255 },
          },
        },
        {
          type: 'TextureStore',
          textureId: 'palette',
          coords: {
            type: 'Construct',
            dataType: 'vec2<i32>',
            args: [{ type: 'Cast', targetType: 'i32', expr: { type: 'VarRef', name: 'x' } }, { type: 'LiteralI32', value: 0 }],
          },
          value: {
            type: 'Construct',
            dataType: 'vec4<f32>',
            args: [
              { type: 'VarRef', name: 't' },
              {
                type: 'BinaryOp',
                op: '+',
                left: { type: 'LiteralF32', value: 0.2 },
                right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 't' }, right: { type: 'LiteralF32', value: 0.7 } },
              },
              { type: 'BinaryOp', op: '-', left: { type: 'LiteralF32', value: 1 }, right: { type: 'VarRef', name: 't' } },
              { type: 'LiteralF32', value: 1 },
            ],
          },
        },
      ],
    },
    {
      type: 'Compute',
      passId: 'layout_line',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'line' },
      dependencies: { requiresGlobals: true, domains: { line: 'read_write' }, textures: {} },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        {
          type: 'Let',
          name: 'rank',
          value: {
            type: 'BinaryOp',
            op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
            right: { type: 'LiteralF32', value: 199 },
          },
        },
        { type: 'StoreField', symbolId: 'line:rank', index: { type: 'VarRef', name: 'gid' }, value: { type: 'VarRef', name: 'rank' } },
        {
          type: 'StoreField',
          symbolId: 'line:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: 1.9 } },
            right: { type: 'LiteralF32', value: 0.95 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'line:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '*',
            left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: TAU } }, right: { type: 'VarRef', name: 'time' } }] },
            right: { type: 'LiteralF32', value: 0.2 },
          },
        },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 200 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.01, 0.01, 0.02, 1] }] },
      drawCalls: [{
        intentId: 'palette_line',
        source: { type: 'Domain', domainId: 'line', sourceKind: 'Topology', shapeId: 'bar' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: {
          requiresGlobals: false,
          domains: { line: 'read' },
          textures: { palette: 'sampled' },
          samplers: { linear: 'filtering' },
        },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'line:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'line:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'rank', value: { type: 'LoadField', symbolId: 'line:rank', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
                { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'VarRef', name: 'px' } },
                { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' }, right: { type: 'VarRef', name: 'py' } },
                { type: 'LiteralF32', value: 0 },
                { type: 'LiteralF32', value: 1 },
              ],
            },
            varyings: {
              rank: { type: 'VarRef', name: 'rank' },
            },
          },
        ],
        fragmentAst: [{
          type: 'ReturnFragment',
          outputs: {
            color: {
              type: 'TextureSample',
              textureId: 'palette',
              samplerId: 'linear',
              uv: {
                type: 'Construct',
                dataType: 'vec2<f32>',
                args: [{ type: 'VarRef', name: 'rank' }, { type: 'LiteralF32', value: 0.5 }],
              },
            },
          },
        }],
      }],
    },
  ],
};

export const demoTwoDomainScene: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 400 },
    },
    domains: {
      bg: {
        capacity: 400,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          color_r: { type: 'f32', clearValue: 0.2 },
          color_g: { type: 'f32', clearValue: 0.3 },
          color_b: { type: 'f32', clearValue: 0.45 },
        },
      },
      fg: {
        capacity: 400,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          color_r: { type: 'f32', clearValue: 0.8 },
          color_g: { type: 'f32', clearValue: 0.9 },
          color_b: { type: 'f32', clearValue: 1.0 },
        },
      },
    },
    textures: {},
    shapeBank: {
      bg_quad: quadShape(0.035),
      fg_dot: quadShape(0.007),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'bg_update',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'bg' },
      dependencies: { requiresGlobals: true, domains: { bg: 'read_write' }, textures: {} },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        {
          type: 'Let', name: 'rank', value: {
            type: 'BinaryOp', op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
            right: { type: 'LiteralF32', value: 399 },
          },
        },
        {
          type: 'StoreField', symbolId: 'bg:pos_x', index: { type: 'VarRef', name: 'gid' }, value: {
            type: 'BinaryOp', op: '*',
            left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: TAU } }, right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.15 } } }] },
            right: { type: 'LiteralF32', value: 0.72 },
          },
        },
        {
          type: 'StoreField', symbolId: 'bg:pos_y', index: { type: 'VarRef', name: 'gid' }, value: {
            type: 'BinaryOp', op: '*',
            left: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: TAU } }, right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.12 } } }] },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        { type: 'StoreField', symbolId: 'bg:color_r', index: { type: 'VarRef', name: 'gid' }, value: { type: 'LiteralF32', value: 0.18 } },
        { type: 'StoreField', symbolId: 'bg:color_g', index: { type: 'VarRef', name: 'gid' }, value: { type: 'LiteralF32', value: 0.24 } },
        { type: 'StoreField', symbolId: 'bg:color_b', index: { type: 'VarRef', name: 'gid' }, value: { type: 'LiteralF32', value: 0.38 } },
      ],
    },
    {
      type: 'Compute',
      passId: 'fg_update',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'fg' },
      dependencies: { requiresGlobals: true, domains: { fg: 'read_write' }, textures: {} },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        { type: 'Let', name: 'h', value: { type: 'CallBuiltin', func: 'hash_u32', args: [{ type: 'VarRef', name: 'gid' }] } },
        {
          type: 'Let', name: 'u', value: {
            type: 'BinaryOp', op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'BinaryOp', op: '&', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralU32', value: 1023 } } },
            right: { type: 'LiteralF32', value: 1023 },
          },
        },
        {
          type: 'Let', name: 'v', value: {
            type: 'BinaryOp', op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'BinaryOp', op: '&', left: { type: 'BinaryOp', op: '>>', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralU32', value: 10 } }, right: { type: 'LiteralU32', value: 1023 } } },
            right: { type: 'LiteralF32', value: 1023 },
          },
        },
        {
          type: 'StoreField', symbolId: 'fg:pos_x', index: { type: 'VarRef', name: 'gid' }, value: {
            type: 'BinaryOp', op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'u' }, right: { type: 'LiteralF32', value: 1.9 } },
            right: { type: 'LiteralF32', value: 0.95 },
          },
        },
        {
          type: 'StoreField', symbolId: 'fg:pos_y', index: { type: 'VarRef', name: 'gid' }, value: {
            type: 'BinaryOp', op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'v' }, right: { type: 'LiteralF32', value: 1.9 } },
            right: { type: 'LiteralF32', value: 0.95 },
          },
        },
        {
          type: 'StoreField', symbolId: 'fg:color_r', index: { type: 'VarRef', name: 'gid' }, value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'u' }, right: { type: 'LiteralF32', value: TAU } }, right: { type: 'VarRef', name: 'time' } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        {
          type: 'StoreField', symbolId: 'fg:color_g', index: { type: 'VarRef', name: 'gid' }, value: { type: 'LiteralF32', value: 0.8 } },
        {
          type: 'StoreField', symbolId: 'fg:color_b', index: { type: 'VarRef', name: 'gid' }, value: { type: 'LiteralF32', value: 1.0 } },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 400 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.005, 0.01, 0.02, 1] }] },
      drawCalls: [
        {
          intentId: 'background',
          source: { type: 'Domain', domainId: 'bg', sourceKind: 'Topology', shapeId: 'bg_quad' },
          pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
          dependencies: { requiresGlobals: false, domains: { bg: 'read' }, textures: {} },
          vertexAst: [
            { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
            { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'bg:pos_x', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'bg:pos_y', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'r', value: { type: 'LoadField', symbolId: 'bg:color_r', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'g', value: { type: 'LoadField', symbolId: 'bg:color_g', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'bg:color_b', index: { type: 'VarRef', name: 'iid' } } },
            {
              type: 'ReturnVertex',
              position: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [
                  { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'VarRef', name: 'px' } },
                  { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' }, right: { type: 'VarRef', name: 'py' } },
                  { type: 'LiteralF32', value: 0 },
                  { type: 'LiteralF32', value: 1 },
                ],
              },
              varyings: {
                color: { type: 'Construct', dataType: 'vec4<f32>', args: [{ type: 'VarRef', name: 'r' }, { type: 'VarRef', name: 'g' }, { type: 'VarRef', name: 'b' }, { type: 'LiteralF32', value: 0.65 }] },
              },
            },
          ],
          fragmentAst: [{ type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } }],
        },
        {
          intentId: 'foreground',
          source: { type: 'Domain', domainId: 'fg', sourceKind: 'Topology', shapeId: 'fg_dot' },
          pipelineState: { blendMode: 'additive', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
          dependencies: { requiresGlobals: false, domains: { fg: 'read' }, textures: {} },
          vertexAst: [
            { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
            { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'fg:pos_x', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'fg:pos_y', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'r', value: { type: 'LoadField', symbolId: 'fg:color_r', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'g', value: { type: 'LoadField', symbolId: 'fg:color_g', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'fg:color_b', index: { type: 'VarRef', name: 'iid' } } },
            {
              type: 'ReturnVertex',
              position: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [
                  { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'VarRef', name: 'px' } },
                  { type: 'BinaryOp', op: '+', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' }, right: { type: 'VarRef', name: 'py' } },
                  { type: 'LiteralF32', value: 0 },
                  { type: 'LiteralF32', value: 1 },
                ],
              },
              varyings: {
                color: { type: 'Construct', dataType: 'vec4<f32>', args: [{ type: 'VarRef', name: 'r' }, { type: 'VarRef', name: 'g' }, { type: 'VarRef', name: 'b' }, { type: 'LiteralF32', value: 1 }] },
              },
            },
          ],
          fragmentAst: [{ type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } }],
        },
      ],
    },
  ],
};

export const demoFillAndOutline: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 30 },
    },
    domains: {
      shapes: {
        capacity: 30,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          fill_r: { type: 'f32', clearValue: 0.6 },
          fill_g: { type: 'f32', clearValue: 0.6 },
          fill_b: { type: 'f32', clearValue: 0.8 },
        },
      },
    },
    textures: {},
    shapeBank: {
      glyph: quadShape(0.05),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'layout',
      sourceBlockIds: [],
      workgroupSize: [32, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'shapes' },
      dependencies: { requiresGlobals: true, domains: { shapes: 'read_write' }, textures: {} },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        {
          type: 'Let',
          name: 'rank',
          value: {
            type: 'BinaryOp', op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
            right: { type: 'LiteralF32', value: 29 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'shapes:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: 1.8 } },
            right: { type: 'LiteralF32', value: 0.9 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'shapes:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '*',
            left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: TAU } }, right: { type: 'VarRef', name: 'time' } }] },
            right: { type: 'LiteralF32', value: 0.3 },
          },
        },
        { type: 'StoreField', symbolId: 'shapes:fill_r', index: { type: 'VarRef', name: 'gid' }, value: { type: 'LiteralF32', value: 0.9 } },
        { type: 'StoreField', symbolId: 'shapes:fill_g', index: { type: 'VarRef', name: 'gid' }, value: { type: 'LiteralF32', value: 0.45 } },
        { type: 'StoreField', symbolId: 'shapes:fill_b', index: { type: 'VarRef', name: 'gid' }, value: { type: 'LiteralF32', value: 0.25 } },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 30 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.06, 0.06, 0.07, 1] }] },
      drawCalls: [
        {
          intentId: 'outline',
          source: { type: 'Domain', domainId: 'shapes', sourceKind: 'Topology', shapeId: 'glyph' },
          pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
          dependencies: { requiresGlobals: false, domains: { shapes: 'read' }, textures: {} },
          vertexAst: [
            { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
            { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'shapes:pos_x', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'shapes:pos_y', index: { type: 'VarRef', name: 'iid' } } },
            {
              type: 'ReturnVertex',
              position: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [
                  { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'LiteralF32', value: 1.35 } }, right: { type: 'VarRef', name: 'px' } },
                  { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' }, right: { type: 'LiteralF32', value: 1.35 } }, right: { type: 'VarRef', name: 'py' } },
                  { type: 'LiteralF32', value: 0 },
                  { type: 'LiteralF32', value: 1 },
                ],
              },
              varyings: {
                color: {
                  type: 'Construct',
                  dataType: 'vec4<f32>',
                  args: [{ type: 'LiteralF32', value: 0.03 }, { type: 'LiteralF32', value: 0.03 }, { type: 'LiteralF32', value: 0.05 }, { type: 'LiteralF32', value: 1 }],
                },
              },
            },
          ],
          fragmentAst: [{ type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } }],
        },
        {
          intentId: 'fill',
          source: { type: 'Domain', domainId: 'shapes', sourceKind: 'Topology', shapeId: 'glyph' },
          pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
          dependencies: { requiresGlobals: false, domains: { shapes: 'read' }, textures: {} },
          vertexAst: [
            { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
            { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'shapes:pos_x', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'shapes:pos_y', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'r', value: { type: 'LoadField', symbolId: 'shapes:fill_r', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'g', value: { type: 'LoadField', symbolId: 'shapes:fill_g', index: { type: 'VarRef', name: 'iid' } } },
            { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'shapes:fill_b', index: { type: 'VarRef', name: 'iid' } } },
            {
              type: 'ReturnVertex',
              position: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [
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
                  args: [{ type: 'VarRef', name: 'r' }, { type: 'VarRef', name: 'g' }, { type: 'VarRef', name: 'b' }, { type: 'LiteralF32', value: 1 }],
                },
              },
            },
          ],
          fragmentAst: [{ type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } }],
        },
      ],
    },
  ],
};

export const demoReactionDiffusionSurface: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 1 },
    },
    domains: {
      quad: {
        capacity: 1,
        activeLanesSymbol: 'sys:active',
        fields: {
          _pad: { type: 'f32', clearValue: 0 },
        },
      },
    },
    textures: {
      sim_a: {
        dimension: '2d',
        width: 128,
        height: 128,
        format: 'rgba8unorm',
        usage: ['storage', 'sampled'],
      },
    },
    shapeBank: {
      fullscreen: {
        topology: 'triangle-list',
        vertexLayout: {
          stride: 8,
          attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
        },
        vertexData: [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1],
      },
    },
    dataStreams: {},
    samplers: {
      linear: {
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      },
    },
  },
  roster: [
    {
      type: 'Compute',
      passId: 'simulate',
      sourceBlockIds: [],
      workgroupSize: [8, 8, 1],
      dispatch: { mode: 'Exact', x: 16, y: 16, z: 1 },
      dependencies: { requiresGlobals: true, domains: {}, textures: { sim_a: 'write' } },
      ast: [
        { type: 'Let', name: 'gx', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'gy', value: { type: 'Intrinsic', name: 'global_invocation_id.y' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        {
          type: 'Let',
          name: 'u',
          value: {
            type: 'BinaryOp',
            op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gx' } },
            right: { type: 'LiteralF32', value: 127 },
          },
        },
        {
          type: 'Let',
          name: 'v',
          value: {
            type: 'BinaryOp',
            op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gy' } },
            right: { type: 'LiteralF32', value: 127 },
          },
        },
        {
          type: 'Let',
          name: 'n',
          value: {
            type: 'CallBuiltin',
            func: 'noise_simplex_2d',
            args: [{
              type: 'Construct',
              dataType: 'vec2<f32>',
              args: [
                { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'u' }, right: { type: 'LiteralF32', value: 4.0 } }, right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.2 } } },
                { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'v' }, right: { type: 'LiteralF32', value: 4.0 } }, right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.15 } } },
              ],
            }],
          },
        },
        {
          type: 'TextureStore',
          textureId: 'sim_a',
          coords: {
            type: 'Construct',
            dataType: 'vec2<i32>',
            args: [{ type: 'Cast', targetType: 'i32', expr: { type: 'VarRef', name: 'gx' } }, { type: 'Cast', targetType: 'i32', expr: { type: 'VarRef', name: 'gy' } }],
          },
          value: {
            type: 'Construct',
            dataType: 'vec4<f32>',
            args: [
              { type: 'VarRef', name: 'n' },
              { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'n' }, right: { type: 'VarRef', name: 'n' } },
              { type: 'BinaryOp', op: '-', left: { type: 'LiteralF32', value: 1.0 }, right: { type: 'VarRef', name: 'n' } },
              { type: 'LiteralF32', value: 1.0 },
            ],
          },
        },
      ],
    },
    {
      type: 'Compute',
      passId: 'active',
      sourceBlockIds: [],
      workgroupSize: [1, 1, 1],
      dispatch: { mode: 'Exact', x: 1, y: 1, z: 1 },
      dependencies: { requiresGlobals: false, domains: {}, textures: {} },
      ast: [{ type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 1 } }],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0, 0, 0, 1] }] },
      drawCalls: [{
        intentId: 'solver_surface',
        source: { type: 'Domain', domainId: 'quad', sourceKind: 'Topology', shapeId: 'fullscreen' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: {
          requiresGlobals: false,
          domains: {},
          textures: { sim_a: 'sampled' },
          samplers: { linear: 'filtering' },
        },
        vertexAst: [
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
                { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' },
                { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' },
                { type: 'LiteralF32', value: 0 },
                { type: 'LiteralF32', value: 1 },
              ],
            },
            varyings: {
              uv: {
                type: 'Construct',
                dataType: 'vec2<f32>',
                args: [
                  { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' }, right: { type: 'LiteralF32', value: 0.5 } }, right: { type: 'LiteralF32', value: 0.5 } },
                  { type: 'BinaryOp', op: '-', left: { type: 'LiteralF32', value: 1.0 }, right: { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' }, right: { type: 'LiteralF32', value: 0.5 } }, right: { type: 'LiteralF32', value: 0.5 } } },
                ],
              },
            },
          },
        ],
        fragmentAst: [{
          type: 'ReturnFragment',
          outputs: {
            color: {
              type: 'TextureSample',
              textureId: 'sim_a',
              samplerId: 'linear',
              uv: { type: 'VarRef', name: 'uv' },
            },
          },
        }],
      }],
    },
  ],
};

export const demoStrangeAttractor: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 2000 },
    },
    domains: {
      attractor: {
        capacity: 2000,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          color_r: { type: 'f32', clearValue: 0.8 },
          color_g: { type: 'f32', clearValue: 0.8 },
          color_b: { type: 'f32', clearValue: 1.0 },
        },
      },
    },
    textures: {},
    shapeBank: {
      point: quadShape(0.0035),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'attractor',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'attractor' },
      dependencies: { requiresGlobals: true, domains: { attractor: 'read_write' }, textures: {} },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        {
          type: 'Let',
          name: 'rank',
          value: {
            type: 'BinaryOp', op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
            right: { type: 'LiteralF32', value: 1999 },
          },
        },
        {
          type: 'Let',
          name: 't',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: 20 } },
            right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.2 } },
          },
        },
        {
          type: 'Let',
          name: 'x',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 2.1 }, right: { type: 'VarRef', name: 't' } }] },
            right: { type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 1.1 }, right: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 1.7 }, right: { type: 'VarRef', name: 't' } }] } },
          },
        },
        {
          type: 'Let',
          name: 'y',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 2.7 }, right: { type: 'VarRef', name: 't' } }] },
            right: { type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 1.0 }, right: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 1.3 }, right: { type: 'VarRef', name: 't' } }] } },
          },
        },
        { type: 'Let', name: 'te', value: { type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 't' }, right: { type: 'LiteralF32', value: 0.02 } } },
        {
          type: 'Let',
          name: 'xe',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 2.1 }, right: { type: 'VarRef', name: 'te' } }] },
            right: { type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 1.1 }, right: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 1.7 }, right: { type: 'VarRef', name: 'te' } }] } },
          },
        },
        {
          type: 'Let',
          name: 'ye',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 2.7 }, right: { type: 'VarRef', name: 'te' } }] },
            right: { type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 1.0 }, right: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'BinaryOp', op: '*', left: { type: 'LiteralF32', value: 1.3 }, right: { type: 'VarRef', name: 'te' } }] } },
          },
        },
        { type: 'Let', name: 'vx', value: { type: 'BinaryOp', op: '-', left: { type: 'VarRef', name: 'xe' }, right: { type: 'VarRef', name: 'x' } } },
        { type: 'Let', name: 'vy', value: { type: 'BinaryOp', op: '-', left: { type: 'VarRef', name: 'ye' }, right: { type: 'VarRef', name: 'y' } } },
        {
          type: 'Let',
          name: 'speed',
          value: {
            type: 'CallBuiltin',
            func: 'length',
            args: [{ type: 'Construct', dataType: 'vec2<f32>', args: [{ type: 'VarRef', name: 'vx' }, { type: 'VarRef', name: 'vy' }] }],
          },
        },
        {
          type: 'StoreField',
          symbolId: 'attractor:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'x' }, right: { type: 'LiteralF32', value: 0.25 } },
        },
        {
          type: 'StoreField',
          symbolId: 'attractor:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'y' }, right: { type: 'LiteralF32', value: 0.25 } },
        },
        {
          type: 'StoreField',
          symbolId: 'attractor:color_r',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'speed' }, right: { type: 'LiteralF32', value: 6.0 } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'attractor:color_g',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'speed' }, right: { type: 'LiteralF32', value: 6.0 } }, right: { type: 'LiteralF32', value: 2.094 } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'attractor:color_b',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'speed' }, right: { type: 'LiteralF32', value: 6.0 } }, right: { type: 'LiteralF32', value: 4.188 } }] }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 2000 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0, 0, 0.01, 1] }] },
      drawCalls: [{
        intentId: 'attractor_points',
        source: { type: 'Domain', domainId: 'attractor', sourceKind: 'Topology', shapeId: 'point' },
        pipelineState: { blendMode: 'additive', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { attractor: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'attractor:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'attractor:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'r', value: { type: 'LoadField', symbolId: 'attractor:color_r', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'g', value: { type: 'LoadField', symbolId: 'attractor:color_g', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'attractor:color_b', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
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
                args: [{ type: 'VarRef', name: 'r' }, { type: 'VarRef', name: 'g' }, { type: 'VarRef', name: 'b' }, { type: 'LiteralF32', value: 0.85 }],
              },
            },
          },
        ],
        fragmentAst: [{ type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } }],
      }],
    },
  ],
};
