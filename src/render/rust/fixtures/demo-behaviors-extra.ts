/**
 * Extra demo behavior fixtures to complete design-docs/DEMO-PATCHES.md coverage.
 *
 * [LAW:one-source-of-truth] DEMO-PATCHES behavior coverage is encoded once in
 * fixture payloads and referenced by the payload tester registry.
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

function petalShape(length: number, halfWidth: number) {
  return {
    topology: 'triangle-list' as const,
    vertexLayout: {
      stride: 8,
      attributes: { position: { format: 'float32x2' as const, shaderLocation: 0 } },
    },
    vertexData: [
      0, -halfWidth, length, -halfWidth, length, halfWidth,
      0, -halfWidth, length, halfWidth, 0, halfWidth,
    ],
  };
}

function regularPolygonShape(radius: number, segments: number) {
  const vertexData: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * TAU;
    const a1 = ((i + 1) / segments) * TAU;
    vertexData.push(
      0,
      0,
      radius * Math.cos(a0),
      radius * Math.sin(a0),
      radius * Math.cos(a1),
      radius * Math.sin(a1),
    );
  }
  return {
    topology: 'triangle-list' as const,
    vertexLayout: {
      stride: 8,
      attributes: { position: { format: 'float32x2' as const, shaderLocation: 0 } },
    },
    vertexData,
  };
}

export const demoKaleidoscope: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 12 },
    },
    domains: {
      petals: {
        capacity: 12,
        activeLanesSymbol: 'sys:active',
        fields: {
          rotation: { type: 'f32', clearValue: 0 },
          color_r: { type: 'f32', clearValue: 0.8 },
          color_g: { type: 'f32', clearValue: 0.8 },
          color_b: { type: 'f32', clearValue: 0.9 },
        },
      },
    },
    textures: {},
    shapeBank: {
      petal: petalShape(0.35, 0.055),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'kaleidoscope_update',
      sourceBlockIds: [],
      workgroupSize: [32, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'petals' },
      dependencies: { requiresGlobals: true, domains: { petals: 'read_write' }, textures: {} },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        {
          type: 'Let',
          name: 'base_angle',
          value: {
            type: 'BinaryOp',
            op: '*',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
            right: { type: 'LiteralF32', value: TAU / 12 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'petals:rotation',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'VarRef', name: 'base_angle' },
            right: {
              type: 'BinaryOp',
              op: '*',
              left: { type: 'VarRef', name: 'time' },
              right: { type: 'LiteralF32', value: 0.25 },
            },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'petals:color_r',
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
                args: [
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'VarRef', name: 'base_angle' },
                    right: { type: 'VarRef', name: 'time' },
                  },
                ],
              },
              right: { type: 'LiteralF32', value: 0.2 },
            },
            right: { type: 'LiteralF32', value: 0.55 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'petals:color_g',
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
                args: [
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: { type: 'VarRef', name: 'base_angle' },
                    right: { type: 'LiteralF32', value: 2.094 },
                  },
                ],
              },
              right: { type: 'LiteralF32', value: 0.15 },
            },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        { type: 'StoreField', symbolId: 'petals:color_b', index: { type: 'VarRef', name: 'gid' }, value: { type: 'LiteralF32', value: 0.9 } },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 12 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep_kaleidoscope', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw_kaleidoscope',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.03, 0.02, 0.04, 1] }] },
      drawCalls: [{
        intentId: 'kaleidoscope_intent',
        source: { type: 'Domain', domainId: 'petals', sourceKind: 'Topology', shapeId: 'petal' },
        pipelineState: { blendMode: 'alpha', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { petals: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'a', value: { type: 'LoadField', symbolId: 'petals:rotation', index: { type: 'VarRef', name: 'iid' } } },
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
          { type: 'Let', name: 'r', value: { type: 'LoadField', symbolId: 'petals:color_r', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'g', value: { type: 'LoadField', symbolId: 'petals:color_g', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'b', value: { type: 'LoadField', symbolId: 'petals:color_b', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [{ type: 'VarRef', name: 'rx' }, { type: 'VarRef', name: 'ry' }, { type: 'LiteralF32', value: 0 }, { type: 'LiteralF32', value: 1 }],
            },
            varyings: {
              color: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [{ type: 'VarRef', name: 'r' }, { type: 'VarRef', name: 'g' }, { type: 'VarRef', name: 'b' }, { type: 'LiteralF32', value: 0.8 }],
              },
            },
          },
        ],
        fragmentAst: [{ type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } }],
      }],
    },
  ],
};

export const demoConditionalVisibility: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
      'ui:threshold': { type: 'f32', isDynamic: false, defaultValue: 0.62 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 500 },
    },
    domains: {
      points: {
        capacity: 500,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          opacity: { type: 'f32', clearValue: 0 },
        },
      },
    },
    textures: {},
    shapeBank: {
      point: quadShape(0.006),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'visibility_update',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'points' },
      dependencies: { requiresGlobals: true, domains: { points: 'read_write' }, textures: {} },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        { type: 'Let', name: 'threshold', value: { type: 'LoadGlobal', symbolId: 'ui:threshold' } },
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
          name: 'v',
          value: {
            type: 'BinaryOp',
            op: '/',
            left: {
              type: 'Cast',
              targetType: 'f32',
              expr: {
                type: 'BinaryOp',
                op: '&',
                left: { type: 'BinaryOp', op: '>>', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralU32', value: 10 } },
                right: { type: 'LiteralU32', value: 1023 },
              },
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
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'u' }, right: { type: 'LiteralF32', value: 1.9 } },
            right: { type: 'LiteralF32', value: 0.95 },
          },
        },
        {
          type: 'Let',
          name: 'py',
          value: {
            type: 'BinaryOp',
            op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'v' }, right: { type: 'LiteralF32', value: 1.9 } },
            right: { type: 'LiteralF32', value: 0.95 },
          },
        },
        {
          type: 'Let',
          name: 'n',
          value: {
            type: 'CallBuiltin',
            func: 'noise_simplex_3d',
            args: [{
              type: 'Construct',
              dataType: 'vec3<f32>',
              args: [
                { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'px' }, right: { type: 'LiteralF32', value: 2.6 } },
                { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'py' }, right: { type: 'LiteralF32', value: 2.6 } },
                { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.25 } },
              ],
            }],
          },
        },
        {
          type: 'Let',
          name: 'noise01',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'n' }, right: { type: 'LiteralF32', value: 0.5 } },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'points:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'VarRef', name: 'px' },
        },
        {
          type: 'StoreField',
          symbolId: 'points:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'VarRef', name: 'py' },
        },
        {
          type: 'StoreField',
          symbolId: 'points:opacity',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'CallBuiltin',
            func: 'step',
            args: [{ type: 'VarRef', name: 'threshold' }, { type: 'VarRef', name: 'noise01' }],
          },
        },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 500 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep_conditional', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw_conditional',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.01, 0.01, 0.015, 1] }] },
      drawCalls: [{
        intentId: 'conditional_points',
        source: { type: 'Domain', domainId: 'points', sourceKind: 'Topology', shapeId: 'point' },
        pipelineState: { blendMode: 'alpha', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { points: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'points:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'points:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'op', value: { type: 'LoadField', symbolId: 'points:opacity', index: { type: 'VarRef', name: 'iid' } } },
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
              opacity: { type: 'VarRef', name: 'op' },
            },
          },
        ],
        fragmentAst: [{
          type: 'ReturnFragment',
          outputs: {
            color: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
                { type: 'LiteralF32', value: 0.88 },
                { type: 'LiteralF32', value: 0.94 },
                { type: 'LiteralF32', value: 1.0 },
                { type: 'VarRef', name: 'opacity' },
              ],
            },
          },
        }],
      }],
    },
  ],
};

export const demoAdditiveRippleRings: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 12 },
    },
    domains: {
      rings: {
        capacity: 12,
        activeLanesSymbol: 'sys:active',
        fields: {
          scale: { type: 'f32', clearValue: 0.2 },
          opacity: { type: 'f32', clearValue: 0.2 },
        },
      },
    },
    textures: {},
    shapeBank: {
      ring_quad: quadShape(0.5),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'ripples_update',
      sourceBlockIds: [],
      workgroupSize: [32, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'rings' },
      dependencies: { requiresGlobals: true, domains: { rings: 'read_write' }, textures: {} },
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
            right: { type: 'LiteralF32', value: 11 },
          },
        },
        {
          type: 'Let',
          name: 'phase',
          value: {
            type: 'BinaryOp',
            op: '*',
            left: { type: 'VarRef', name: 'rank' },
            right: { type: 'LiteralF32', value: 4.0 },
          },
        },
        {
          type: 'Let',
          name: 't',
          value: {
            type: 'CallBuiltin',
            func: 'fract',
            args: [{
              type: 'BinaryOp',
              op: '+',
              left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.5 } },
              right: { type: 'VarRef', name: 'phase' },
            }],
          },
        },
        {
          type: 'StoreField',
          symbolId: 'rings:scale',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 't' }, right: { type: 'LiteralF32', value: 1.8 } },
            right: { type: 'LiteralF32', value: 0.15 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'rings:opacity',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '*',
            left: {
              type: 'BinaryOp',
              op: '-',
              left: { type: 'LiteralF32', value: 1.0 },
              right: { type: 'VarRef', name: 't' },
            },
            right: { type: 'LiteralF32', value: 0.6 },
          },
        },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 12 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep_ripples', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw_ripples',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0, 0.01, 0.03, 1] }] },
      drawCalls: [{
        intentId: 'ripple_rings',
        source: { type: 'Domain', domainId: 'rings', sourceKind: 'Topology', shapeId: 'ring_quad' },
        pipelineState: { blendMode: 'additive', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { rings: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'scale', value: { type: 'LoadField', symbolId: 'rings:scale', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'opacity', value: { type: 'LoadField', symbolId: 'rings:opacity', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'lx', value: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' } },
          { type: 'Let', name: 'ly', value: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' } },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
                { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'lx' }, right: { type: 'VarRef', name: 'scale' } },
                { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'ly' }, right: { type: 'VarRef', name: 'scale' } },
                { type: 'LiteralF32', value: 0 },
                { type: 'LiteralF32', value: 1 },
              ],
            },
            varyings: {
              local: {
                type: 'Construct',
                dataType: 'vec2<f32>',
                args: [{ type: 'VarRef', name: 'lx' }, { type: 'VarRef', name: 'ly' }],
              },
              opacity: { type: 'VarRef', name: 'opacity' },
            },
          },
        ],
        fragmentAst: [
          {
            type: 'Let',
            name: 'dist',
            value: {
              type: 'CallBuiltin',
              func: 'length',
              args: [{ type: 'VarRef', name: 'local' }],
            },
          },
          {
            type: 'Let',
            name: 'outer',
            value: {
              type: 'BinaryOp',
              op: '-',
              left: { type: 'LiteralF32', value: 1.0 },
              right: {
                type: 'CallBuiltin',
                func: 'smoothstep',
                args: [
                  { type: 'LiteralF32', value: 0.46 },
                  { type: 'LiteralF32', value: 0.5 },
                  { type: 'VarRef', name: 'dist' },
                ],
              },
            },
          },
          {
            type: 'Let',
            name: 'inner',
            value: {
              type: 'CallBuiltin',
              func: 'smoothstep',
              args: [
                { type: 'LiteralF32', value: 0.35 },
                { type: 'LiteralF32', value: 0.4 },
                { type: 'VarRef', name: 'dist' },
              ],
            },
          },
          {
            type: 'Let',
            name: 'ring_alpha',
            value: {
              type: 'BinaryOp',
              op: '*',
              left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'outer' }, right: { type: 'VarRef', name: 'inner' } },
              right: { type: 'VarRef', name: 'opacity' },
            },
          },
          {
            type: 'ReturnFragment',
            outputs: {
              color: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [
                  { type: 'LiteralF32', value: 0.3 },
                  { type: 'LiteralF32', value: 0.65 },
                  { type: 'LiteralF32', value: 1.0 },
                  { type: 'VarRef', name: 'ring_alpha' },
                ],
              },
            },
          },
        ],
      }],
    },
  ],
};

export const demoTwistedParametricRibbon: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 128 },
    },
    domains: {
      ribbon: {
        capacity: 128,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          angle: { type: 'f32', clearValue: 0 },
          hue: { type: 'f32', clearValue: 0 },
        },
      },
    },
    textures: {},
    shapeBank: {
      segment: quadShape(0.013),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'ribbon_update',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'ribbon' },
      dependencies: { requiresGlobals: true, domains: { ribbon: 'read_write' }, textures: {} },
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
            right: { type: 'LiteralF32', value: 127 },
          },
        },
        {
          type: 'Let',
          name: 'phase',
          value: {
            type: 'BinaryOp',
            op: '*',
            left: { type: 'VarRef', name: 'rank' },
            right: { type: 'LiteralF32', value: TAU },
          },
        },
        {
          type: 'Let',
          name: 'x',
          value: {
            type: 'BinaryOp',
            op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: 1.8 } },
            right: { type: 'LiteralF32', value: 0.9 },
          },
        },
        {
          type: 'Let',
          name: 'y',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: {
              type: 'BinaryOp',
              op: '*',
              left: {
                type: 'CallBuiltin',
                func: 'sin',
                args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'phase' }, right: { type: 'LiteralF32', value: 2.0 } }, right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.2 } } }],
              },
              right: { type: 'LiteralF32', value: 0.24 },
            },
            right: {
              type: 'BinaryOp',
              op: '*',
              left: {
                type: 'CallBuiltin',
                func: 'sin',
                args: [{ type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'phase' }, right: { type: 'LiteralF32', value: 5.0 } }],
              },
              right: { type: 'LiteralF32', value: 0.09 },
            },
          },
        },
        {
          type: 'Let',
          name: 'dy',
          value: {
            type: 'BinaryOp',
            op: '+',
            left: {
              type: 'BinaryOp',
              op: '*',
              left: {
                type: 'CallBuiltin',
                func: 'cos',
                args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'phase' }, right: { type: 'LiteralF32', value: 2.0 } }, right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.2 } } }],
              },
              right: { type: 'LiteralF32', value: 0.48 },
            },
            right: {
              type: 'BinaryOp',
              op: '*',
              left: {
                type: 'CallBuiltin',
                func: 'cos',
                args: [{ type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'phase' }, right: { type: 'LiteralF32', value: 5.0 } }],
              },
              right: { type: 'LiteralF32', value: 0.45 },
            },
          },
        },
        {
          type: 'Let',
          name: 'twist',
          value: {
            type: 'BinaryOp',
            op: '*',
            left: {
              type: 'CallBuiltin',
              func: 'sin',
              args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'phase' }, right: { type: 'LiteralF32', value: 6.0 } }, right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 1.5 } } }],
            },
            right: { type: 'LiteralF32', value: 0.7 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'ribbon:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'VarRef', name: 'x' },
        },
        {
          type: 'StoreField',
          symbolId: 'ribbon:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'VarRef', name: 'y' },
        },
        {
          type: 'StoreField',
          symbolId: 'ribbon:angle',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: {
              type: 'CallBuiltin',
              func: 'atan2',
              args: [{ type: 'VarRef', name: 'dy' }, { type: 'LiteralF32', value: 1.8 }],
            },
            right: { type: 'VarRef', name: 'twist' },
          },
        },
        { type: 'StoreField', symbolId: 'ribbon:hue', index: { type: 'VarRef', name: 'gid' }, value: { type: 'VarRef', name: 'rank' } },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 128 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep_ribbon', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw_ribbon',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.015, 0.012, 0.02, 1] }] },
      drawCalls: [{
        intentId: 'twisted_ribbon',
        source: { type: 'Domain', domainId: 'ribbon', sourceKind: 'Topology', shapeId: 'segment' },
        pipelineState: { blendMode: 'alpha', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { ribbon: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'ribbon:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'ribbon:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'a', value: { type: 'LoadField', symbolId: 'ribbon:angle', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'h', value: { type: 'LoadField', symbolId: 'ribbon:hue', index: { type: 'VarRef', name: 'iid' } } },
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
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
                { type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 'rx' }, right: { type: 'VarRef', name: 'px' } },
                { type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 'ry' }, right: { type: 'VarRef', name: 'py' } },
                { type: 'LiteralF32', value: 0 },
                { type: 'LiteralF32', value: 1 },
              ],
            },
            varyings: {
              color: {
                type: 'Construct',
                dataType: 'vec4<f32>',
                args: [
                  {
                    type: 'BinaryOp',
                    op: '+',
                    left: {
                      type: 'BinaryOp',
                      op: '*',
                      left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'h' }, right: { type: 'LiteralF32', value: TAU } }] },
                      right: { type: 'LiteralF32', value: 0.5 },
                    },
                    right: { type: 'LiteralF32', value: 0.5 },
                  },
                  {
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
                  {
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
                  { type: 'LiteralF32', value: 0.95 },
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

export const demoVelocityStretchedParticles: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 400 },
    },
    domains: {
      particles: {
        capacity: 400,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          vel_x: { type: 'f32', clearValue: 0 },
          vel_y: { type: 'f32', clearValue: 0 },
          speed: { type: 'f32', clearValue: 0 },
        },
      },
    },
    textures: {},
    shapeBank: {
      particle: quadShape(0.01),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'particle_update',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'particles' },
      dependencies: { requiresGlobals: true, domains: { particles: 'read_write' }, textures: {} },
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
            right: { type: 'LiteralF32', value: 399 },
          },
        },
        {
          type: 'Let',
          name: 'phase',
          value: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'rank' }, right: { type: 'LiteralF32', value: TAU } },
        },
        {
          type: 'Let',
          name: 'vx',
          value: {
            type: 'BinaryOp',
            op: '*',
            left: {
              type: 'CallBuiltin',
              func: 'cos',
              args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 1.7 } }, right: { type: 'VarRef', name: 'phase' } }],
            },
            right: { type: 'LiteralF32', value: 1.7 },
          },
        },
        {
          type: 'Let',
          name: 'vy',
          value: {
            type: 'BinaryOp',
            op: '*',
            left: {
              type: 'CallBuiltin',
              func: 'sin',
              args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 1.19 } }, right: { type: 'VarRef', name: 'phase' } }],
            },
            right: { type: 'LiteralF32', value: 0.9 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'particles:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '*',
            left: {
              type: 'CallBuiltin',
              func: 'sin',
              args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 1.7 } }, right: { type: 'VarRef', name: 'phase' } }],
            },
            right: { type: 'LiteralF32', value: 0.75 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'particles:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '*',
            left: {
              type: 'CallBuiltin',
              func: 'cos',
              args: [{ type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 1.19 } }, right: { type: 'VarRef', name: 'phase' } }],
            },
            right: { type: 'LiteralF32', value: 0.55 },
          },
        },
        { type: 'StoreField', symbolId: 'particles:vel_x', index: { type: 'VarRef', name: 'gid' }, value: { type: 'VarRef', name: 'vx' } },
        { type: 'StoreField', symbolId: 'particles:vel_y', index: { type: 'VarRef', name: 'gid' }, value: { type: 'VarRef', name: 'vy' } },
        {
          type: 'StoreField',
          symbolId: 'particles:speed',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'CallBuiltin',
            func: 'length',
            args: [{ type: 'Construct', dataType: 'vec2<f32>', args: [{ type: 'VarRef', name: 'vx' }, { type: 'VarRef', name: 'vy' }] }],
          },
        },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 400 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep_particles', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render',
      passId: 'draw_particles',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.005, 0.005, 0.01, 1] }] },
      drawCalls: [{
        intentId: 'velocity_stretched',
        source: { type: 'Domain', domainId: 'particles', sourceKind: 'Topology', shapeId: 'particle' },
        pipelineState: { blendMode: 'additive', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { particles: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'particles:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'particles:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'vx', value: { type: 'LoadField', symbolId: 'particles:vel_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'vy', value: { type: 'LoadField', symbolId: 'particles:vel_y', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'speed', value: { type: 'LoadField', symbolId: 'particles:speed', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'Let',
            name: 'a',
            value: {
              type: 'CallBuiltin',
              func: 'atan2',
              args: [{ type: 'VarRef', name: 'vy' }, { type: 'VarRef', name: 'vx' }],
            },
          },
          { type: 'Let', name: 'ca', value: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'VarRef', name: 'a' }] } },
          { type: 'Let', name: 'sa', value: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'a' }] } },
          {
            type: 'Let',
            name: 'stretch',
            value: {
              type: 'BinaryOp',
              op: '+',
              left: {
                type: 'BinaryOp',
                op: '*',
                left: { type: 'VarRef', name: 'speed' },
                right: { type: 'LiteralF32', value: 0.05 },
              },
              right: { type: 'LiteralF32', value: 1.0 },
            },
          },
          {
            type: 'Let',
            name: 'sx',
            value: {
              type: 'BinaryOp',
              op: '*',
              left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' },
              right: { type: 'VarRef', name: 'stretch' },
            },
          },
          {
            type: 'Let',
            name: 'sy',
            value: {
              type: 'BinaryOp',
              op: '*',
              left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' },
              right: { type: 'LiteralF32', value: 0.35 },
            },
          },
          {
            type: 'Let',
            name: 'rx',
            value: {
              type: 'BinaryOp',
              op: '-',
              left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'sx' }, right: { type: 'VarRef', name: 'ca' } },
              right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'sy' }, right: { type: 'VarRef', name: 'sa' } },
            },
          },
          {
            type: 'Let',
            name: 'ry',
            value: {
              type: 'BinaryOp',
              op: '+',
              left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'sx' }, right: { type: 'VarRef', name: 'sa' } },
              right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'sy' }, right: { type: 'VarRef', name: 'ca' } },
            },
          },
          {
            type: 'ReturnVertex',
            position: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
                { type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 'rx' }, right: { type: 'VarRef', name: 'px' } },
                { type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 'ry' }, right: { type: 'VarRef', name: 'py' } },
                { type: 'LiteralF32', value: 0 },
                { type: 'LiteralF32', value: 1 },
              ],
            },
            varyings: {
              speed: { type: 'VarRef', name: 'speed' },
            },
          },
        ],
        fragmentAst: [{
          type: 'ReturnFragment',
          outputs: {
            color: {
              type: 'Construct',
              dataType: 'vec4<f32>',
              args: [
                {
                  type: 'BinaryOp',
                  op: '+',
                  left: {
                    type: 'BinaryOp',
                    op: '*',
                    left: { type: 'VarRef', name: 'speed' },
                    right: { type: 'LiteralF32', value: 0.08 },
                  },
                  right: { type: 'LiteralF32', value: 0.25 },
                },
                {
                  type: 'BinaryOp',
                  op: '+',
                  left: {
                    type: 'BinaryOp',
                    op: '*',
                    left: { type: 'VarRef', name: 'speed' },
                    right: { type: 'LiteralF32', value: 0.06 },
                  },
                  right: { type: 'LiteralF32', value: 0.35 },
                },
                {
                  type: 'BinaryOp',
                  op: '+',
                  left: {
                    type: 'BinaryOp',
                    op: '*',
                    left: { type: 'VarRef', name: 'speed' },
                    right: { type: 'LiteralF32', value: 0.03 },
                  },
                  right: { type: 'LiteralF32', value: 0.75 },
                },
                { type: 'LiteralF32', value: 0.8 },
              ],
            },
          },
        }],
      }],
    },
  ],
};

export const demoNoiseDisplacedGrid: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: 400 },
    },
    domains: {
      points: {
        capacity: 400,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          color_r: { type: 'f32', clearValue: 0.5 },
          color_g: { type: 'f32', clearValue: 0.7 },
          color_b: { type: 'f32', clearValue: 1.0 },
        },
      },
    },
    textures: {},
    shapeBank: {
      dot: regularPolygonShape(0.008, 6),
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    {
      type: 'Compute',
      passId: 'noise_grid_update',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'points' },
      dependencies: { requiresGlobals: true, domains: { points: 'read_write' }, textures: {} },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        {
          type: 'Let',
          name: 'col',
          value: {
            type: 'Cast',
            targetType: 'f32',
            expr: { type: 'BinaryOp', op: '%', left: { type: 'VarRef', name: 'gid' }, right: { type: 'LiteralU32', value: 20 } },
          },
        },
        {
          type: 'Let',
          name: 'row',
          value: {
            type: 'Cast',
            targetType: 'f32',
            expr: { type: 'BinaryOp', op: '/', left: { type: 'VarRef', name: 'gid' }, right: { type: 'LiteralU32', value: 20 } },
          },
        },
        {
          type: 'Let',
          name: 'base_x',
          value: {
            type: 'BinaryOp',
            op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'col' }, right: { type: 'LiteralF32', value: 0.1 } },
            right: { type: 'LiteralF32', value: 0.95 },
          },
        },
        {
          type: 'Let',
          name: 'base_y',
          value: {
            type: 'BinaryOp',
            op: '-',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'row' }, right: { type: 'LiteralF32', value: 0.1 } },
            right: { type: 'LiteralF32', value: 0.95 },
          },
        },
        {
          type: 'Let',
          name: 'n',
          value: {
            type: 'CallBuiltin',
            func: 'noise_simplex_3d',
            args: [{
              type: 'Construct',
              dataType: 'vec3<f32>',
              args: [
                { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'base_x' }, right: { type: 'LiteralF32', value: 2.0 } },
                { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'base_y' }, right: { type: 'LiteralF32', value: 2.0 } },
                { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 0.6 } },
              ],
            }],
          },
        },
        {
          type: 'Let',
          name: 'amp',
          value: {
            type: 'BinaryOp',
            op: '*',
            left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'time' }] },
            right: { type: 'LiteralF32', value: 0.03 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'points:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'VarRef', name: 'base_x' },
            right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'n' }, right: { type: 'VarRef', name: 'amp' } },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'points:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'VarRef', name: 'base_y' },
            right: {
              type: 'BinaryOp',
              op: '*',
              left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'BinaryOp', op: '+', left: { type: 'VarRef', name: 'n' }, right: { type: 'LiteralF32', value: 1.57 } }] },
              right: { type: 'VarRef', name: 'amp' },
            },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'points:color_r',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'n' }, right: { type: 'LiteralF32', value: 0.25 } },
            right: { type: 'LiteralF32', value: 0.55 },
          },
        },
        {
          type: 'StoreField',
          symbolId: 'points:color_g',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp',
            op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'n' }, right: { type: 'LiteralF32', value: 0.12 } },
            right: { type: 'LiteralF32', value: 0.68 },
          },
        },
        { type: 'StoreField', symbolId: 'points:color_b', index: { type: 'VarRef', name: 'gid' }, value: { type: 'LiteralF32', value: 1.0 } },
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: 400 } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep_noise_grid', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 18 },
    {
      type: 'Render',
      passId: 'draw_noise_grid',
      sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.015, 0.015, 0.02, 1] }] },
      drawCalls: [{
        intentId: 'noise_grid_points',
        source: { type: 'Domain', domainId: 'points', sourceKind: 'Topology', shapeId: 'dot' },
        pipelineState: { blendMode: 'alpha', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
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
                args: [{ type: 'VarRef', name: 'r' }, { type: 'VarRef', name: 'g' }, { type: 'VarRef', name: 'b' }, { type: 'LiteralF32', value: 0.9 }],
              },
            },
          },
        ],
        fragmentAst: [{ type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } }],
      }],
    },
  ],
};
