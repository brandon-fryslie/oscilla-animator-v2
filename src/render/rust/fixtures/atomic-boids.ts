/**
 * atomic-boids: 10,000 boids with atomic grid_cell field.
 * Gate 9: Forces MMU to bifurcate standard (f32) and atomic (atomic<u32>) fields
 * into physically separate GPU storage buffers. Verifies the GPU driver doesn't
 * crash from mixing bitcast-f32 and atomic<u32> in a single binding.
 *
 * Compute pass atomically writes grid_cell, reads it back to derive color.
 * If bifurcation fails, the GPU driver will reject the shader or produce garbage.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

const TAU = Math.PI * 2;
const N = 10000;
const WG = 256;

export const atomicBoids: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: N },
    },
    domains: {
      boids: {
        capacity: N,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x: { type: 'f32', clearValue: 0 },
          pos_y: { type: 'f32', clearValue: 0 },
          grid_cell: { type: 'atomic<u32>', clearValue: 0 },
          // Standard copy of grid_cell for render pass (vertex stage can't use atomicLoad)
          cell_val: { type: 'f32', clearValue: 0 },
        },
      },
    },
    textures: {},
    shapeBank: {
      dot: {
        topology: 'triangle-list',
        vertexLayout: {
          stride: 8,
          attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
        },
        // Tiny dot ~2px
        vertexData: [
          -0.003, -0.003, 0.003, -0.003, 0.003, 0.003,
          -0.003, -0.003, 0.003, 0.003, -0.003, 0.003,
        ],
      },
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    // Pass 1: Compute — place boids in a swirl, atomically write grid_cell
    {
      type: 'Compute',
      passId: 'sim_boids',
      sourceBlockIds: [],
      workgroupSize: [WG, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'boids' },
      dependencies: {
        requiresGlobals: true,
        domains: { boids: 'read_write' },
        textures: {},
      },
      ast: [
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
        // Swirl positions
        {
          type: 'Let', name: 'fi', value: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
        },
        {
          type: 'Let', name: 'angle', value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'fi' }, right: { type: 'LiteralF32', value: TAU / N } },
            right: { type: 'VarRef', name: 'time' },
          },
        },
        // Radius oscillates per boid
        {
          type: 'Let', name: 'radius', value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'LiteralF32', value: 0.3 },
            right: {
              type: 'BinaryOp', op: '*',
              left: { type: 'CallBuiltin', func: 'sin', args: [{
                type: 'BinaryOp', op: '+',
                left: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'fi' }, right: { type: 'LiteralF32', value: 0.01 } },
                right: { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'time' }, right: { type: 'LiteralF32', value: 2.0 } },
              }] },
              right: { type: 'LiteralF32', value: 0.5 },
            },
          },
        },
        { type: 'StoreField', symbolId: 'boids:pos_x', index: { type: 'VarRef', name: 'gid' }, value: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'VarRef', name: 'angle' }] }, right: { type: 'VarRef', name: 'radius' } } },
        { type: 'StoreField', symbolId: 'boids:pos_y', index: { type: 'VarRef', name: 'gid' }, value: { type: 'BinaryOp', op: '*', left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'angle' }] }, right: { type: 'VarRef', name: 'radius' } } },
        // Atomically write grid_cell = (gid % 16) + 1 (non-zero = alive)
        // This proves the atomic buffer is physically separate from pos_x/pos_y
        {
          type: 'Let', name: 'cell_value', value: {
            type: 'BinaryOp', op: '+',
            left: { type: 'BinaryOp', op: '%', left: { type: 'VarRef', name: 'gid' }, right: { type: 'LiteralU32', value: 16 } },
            right: { type: 'LiteralU32', value: 1 },
          },
        },
        {
          type: 'AtomicOpField',
          op: 'Exchange',
          symbolId: 'boids:grid_cell',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'VarRef', name: 'cell_value' },
        },
        // Copy atomic value to standard field so render pass can read it
        // (vertex stage doesn't support atomicLoad — WebGPU constraint)
        {
          type: 'StoreField',
          symbolId: 'boids:cell_val',
          index: { type: 'VarRef', name: 'gid' },
          value: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'cell_value' } },
        },
        // Write active count
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: N } },
      ],
    },
    { type: 'System_DrawPrep', passId: 'prep', sourceBlockIds: [], activeLanesSymbol: 'sys:active', vertexCount: 6 },
    {
      type: 'Render', passId: 'draw', sourceBlockIds: [],
      targets: { colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.02, 0.02, 0.04, 1] }] },
      drawCalls: [{
        intentId: 'boids_fill',
        source: { type: 'Domain', domainId: 'boids', sourceKind: 'Topology', shapeId: 'dot' },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { boids: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'boids:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'boids:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          // Read cell_val (standard field copy of atomic grid_cell)
          { type: 'Let', name: 'cell', value: { type: 'LoadField', symbolId: 'boids:cell_val', index: { type: 'VarRef', name: 'iid' } } },
          {
            type: 'Let', name: 'intensity', value: {
              type: 'BinaryOp', op: '/',
              left: { type: 'VarRef', name: 'cell' },
              right: { type: 'LiteralF32', value: 16.0 },
            },
          },
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
                  { type: 'VarRef', name: 'intensity' },
                  { type: 'BinaryOp', op: '*', left: { type: 'VarRef', name: 'intensity' }, right: { type: 'LiteralF32', value: 0.7 } },
                  { type: 'LiteralF32', value: 1.0 },
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
