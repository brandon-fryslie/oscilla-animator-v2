/**
 * spirograph-trace: 1000 points tracing a hypotrochoid (Spirograph curve).
 *
 * A hypotrochoid is the curve traced by a pen on a disc of radius r
 * rolling inside a fixed ring of radius R:
 *   x(t) = (R-r)*cos(t) + d*cos((R-r)/r * t)
 *   y(t) = (R-r)*sin(t) - d*sin((R-r)/r * t)
 *
 * With R=21, r=8, d=5: produces 21 petals over 8 full revolutions,
 * creating the dense overlapping-loop pattern of a real Spirograph toy.
 *
 * From DEMO-PATCHES.md "Spirograph Trace": rank as phase offset,
 * emergent complex geometry from simple circular motion.
 */

import type { PipelineInstallPayload } from '../boundary-contract';

const TAU = Math.PI * 2;
const INSTANCE_COUNT = 1000;

// ── Hypotrochoid parameters ──
// R/r = 21/8 → 21 petals, curve closes after 8 revolutions
const BIG_R = 21;
const SMALL_R = 8;
const PEN_D = 5;

// Precompute normalized constants for the shader
// The curve's max extent is (R-r) + d; normalize to fit in [-1, 1]
const DIFF = BIG_R - SMALL_R;           // 13
const FREQ = DIFF / SMALL_R;            // 13/8 = 1.625
const MAX_EXTENT = DIFF + PEN_D;        // 18
const A = DIFF / MAX_EXTENT;            // 13/18 ≈ 0.722  (orbit arm)
const B = PEN_D / MAX_EXTENT;           // 5/18  ≈ 0.278  (pen arm)
const NUM_REVS = SMALL_R;               // 8 full revolutions to close

// Scale to fill canvas
const RADIUS = 0.82;

// Tiny quads act as "points"
const POINT_SIZE = 0.005;

export const spirographTrace: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: INSTANCE_COUNT },
    },
    domains: {
      pts: {
        capacity: INSTANCE_COUNT,
        activeLanesSymbol: 'sys:active',
        fields: {
          pos_x:   { type: 'f32', clearValue: 0 },
          pos_y:   { type: 'f32', clearValue: 0 },
          color_r: { type: 'f32', clearValue: 1 },
          color_g: { type: 'f32', clearValue: 1 },
          color_b: { type: 'f32', clearValue: 1 },
        },
      },
    },
    textures: {},
    shapeBank: {
      point_quad: {
        topology: 'triangle-list',
        vertexLayout: {
          stride: 8,
          attributes: { position: { format: 'float32x2', shaderLocation: 0 } },
        },
        vertexData: [
          -POINT_SIZE, -POINT_SIZE,  POINT_SIZE, -POINT_SIZE,  POINT_SIZE,  POINT_SIZE,
          -POINT_SIZE, -POINT_SIZE,  POINT_SIZE,  POINT_SIZE, -POINT_SIZE,  POINT_SIZE,
        ],
      },
    },
    dataStreams: {},
    samplers: {},
  },
  roster: [
    // ── Pass 1: Compute ── place 1000 points on a hypotrochoid
    {
      type: 'Compute',
      passId: 'eval_spirograph',
      sourceBlockIds: [],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'pts' },
      dependencies: {
        requiresGlobals: true,
        domains: { pts: 'read_write' },
        textures: {},
      },
      ast: [
        // gid = thread index
        { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
        // time = elapsed seconds
        { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },

        // rank = f32(gid) / f32(INSTANCE_COUNT)  — normalized [0, 1)
        {
          type: 'Let', name: 'rank', value: {
            type: 'BinaryOp', op: '/',
            left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
            right: { type: 'LiteralF32', value: INSTANCE_COUNT },
          },
        },

        // t = rank * TAU * NUM_REVS + time
        // Each instance samples a different point along the full hypotrochoid.
        // Adding time makes points flow along the curve.
        {
          type: 'Let', name: 't', value: {
            type: 'BinaryOp', op: '+',
            left: {
              type: 'BinaryOp', op: '*',
              left: { type: 'VarRef', name: 'rank' },
              right: { type: 'LiteralF32', value: TAU * NUM_REVS },
            },
            right: { type: 'VarRef', name: 'time' },
          },
        },

        // inner = FREQ * t  (the pen's angular position)
        {
          type: 'Let', name: 'inner', value: {
            type: 'BinaryOp', op: '*',
            left: { type: 'LiteralF32', value: FREQ },
            right: { type: 'VarRef', name: 't' },
          },
        },

        // Hypotrochoid:
        //   x = A*cos(t) + B*cos(inner)
        //   y = A*sin(t) - B*sin(inner)
        // Scaled by RADIUS to fill the canvas.

        // pos_x = (A * cos(t) + B * cos(inner)) * RADIUS
        {
          type: 'StoreField', symbolId: 'pts:pos_x',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '*',
            left: {
              type: 'BinaryOp', op: '+',
              left: {
                type: 'BinaryOp', op: '*',
                left: { type: 'LiteralF32', value: A },
                right: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'VarRef', name: 't' }] },
              },
              right: {
                type: 'BinaryOp', op: '*',
                left: { type: 'LiteralF32', value: B },
                right: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'VarRef', name: 'inner' }] },
              },
            },
            right: { type: 'LiteralF32', value: RADIUS },
          },
        },

        // pos_y = (A * sin(t) - B * sin(inner)) * RADIUS
        {
          type: 'StoreField', symbolId: 'pts:pos_y',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '*',
            left: {
              type: 'BinaryOp', op: '-',
              left: {
                type: 'BinaryOp', op: '*',
                left: { type: 'LiteralF32', value: A },
                right: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 't' }] },
              },
              right: {
                type: 'BinaryOp', op: '*',
                left: { type: 'LiteralF32', value: B },
                right: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'inner' }] },
              },
            },
            right: { type: 'LiteralF32', value: RADIUS },
          },
        },

        // Rainbow color from rank: R/G/B = sin(rank*TAU + offset) * 0.5 + 0.5
        {
          type: 'Let', name: 'hue_angle', value: {
            type: 'BinaryOp', op: '*',
            left: { type: 'VarRef', name: 'rank' },
            right: { type: 'LiteralF32', value: TAU },
          },
        },
        // R channel
        {
          type: 'StoreField', symbolId: 'pts:color_r',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: {
              type: 'BinaryOp', op: '*',
              left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'hue_angle' }] },
              right: { type: 'LiteralF32', value: 0.5 },
            },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        // G channel (120° offset)
        {
          type: 'StoreField', symbolId: 'pts:color_g',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: {
              type: 'BinaryOp', op: '*',
              left: {
                type: 'CallBuiltin', func: 'sin', args: [{
                  type: 'BinaryOp', op: '+',
                  left: { type: 'VarRef', name: 'hue_angle' },
                  right: { type: 'LiteralF32', value: 2.094 },
                }],
              },
              right: { type: 'LiteralF32', value: 0.5 },
            },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },
        // B channel (240° offset)
        {
          type: 'StoreField', symbolId: 'pts:color_b',
          index: { type: 'VarRef', name: 'gid' },
          value: {
            type: 'BinaryOp', op: '+',
            left: {
              type: 'BinaryOp', op: '*',
              left: {
                type: 'CallBuiltin', func: 'sin', args: [{
                  type: 'BinaryOp', op: '+',
                  left: { type: 'VarRef', name: 'hue_angle' },
                  right: { type: 'LiteralF32', value: 4.189 },
                }],
              },
              right: { type: 'LiteralF32', value: 0.5 },
            },
            right: { type: 'LiteralF32', value: 0.5 },
          },
        },

        // Write active count for DrawPrep
        { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: INSTANCE_COUNT } },
      ],
    },

    // ── Pass 2: DrawPrep ──
    {
      type: 'System_DrawPrep',
      passId: 'prep_pts',
      sourceBlockIds: [],
      activeLanesSymbol: 'sys:active',
      vertexCount: 6,
    },

    // ── Pass 3: Render ──
    {
      type: 'Render',
      passId: 'draw_pts',
      sourceBlockIds: [],
      targets: {
        colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0.02, 0.02, 0.04, 1] }],
      },
      drawCalls: [{
        intentId: 'pts_fill',
        source: { type: 'Domain', domainId: 'pts', sourceKind: 'Topology', shapeId: 'point_quad' },
        pipelineState: { blendMode: 'alpha', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: { requiresGlobals: false, domains: { pts: 'read' }, textures: {} },
        vertexAst: [
          { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
          { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'pts:pos_x', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'pts:pos_y', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'cr', value: { type: 'LoadField', symbolId: 'pts:color_r', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'cg', value: { type: 'LoadField', symbolId: 'pts:color_g', index: { type: 'VarRef', name: 'iid' } } },
          { type: 'Let', name: 'cb', value: { type: 'LoadField', symbolId: 'pts:color_b', index: { type: 'VarRef', name: 'iid' } } },
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
                  { type: 'VarRef', name: 'cr' },
                  { type: 'VarRef', name: 'cg' },
                  { type: 'VarRef', name: 'cb' },
                  { type: 'LiteralF32', value: 0.85 },
                ],
              },
            },
          },
        ],
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
