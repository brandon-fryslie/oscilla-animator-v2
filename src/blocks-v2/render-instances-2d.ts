/**
 * C1 Block: RenderInstances2D
 *
 * Sink block that renders instanced 2D geometry.
 *
 * Config:
 *   domainId: string  (e.g. 'dots')
 *   capacity: number  (e.g. 64)
 *   quadScale: number (default 0.03)
 *
 * Input ports (all optional — unwired fields keep their clearValue):
 *   pos_x, pos_y: per-instance position
 *   color_r, color_g, color_b: per-instance color (default 1.0)
 *   time: animation time (for backward compat with spinning-ring fixture)
 *
 * Produces 3 roster entries: Compute (field writes), System_DrawPrep, Render.
 */

import { registerC1Block } from './index';
import type { ManifestContribution, C1LoweredBlock } from '../compiler/backend-v2/types';
import type {
  ComputePassSpec,
  RenderPassSpec,
  SystemPassSpec,
  StatementIR,
  StaticGeometrySpec,
} from '../render/rust/boundary-contract';
import {
  intrinsic, loadField, storeField, construct, binop, litF32,
  callBuiltin, ref, let_, returnVertex, returnFragment, swizzle, cast,
} from '../render/gpu-ir/ir-builders';

// ---------------------------------------------------------------------------
// Unit quad geometry (6 vertices, 2 triangles)
// ---------------------------------------------------------------------------

function quad(scale: number): StaticGeometrySpec {
  const s = scale;
  return {
    topology: 'triangle-list',
    vertexLayout: {
      stride: 8,
      attributes: {
        position: { format: 'float32x2', shaderLocation: 0 },
      },
    },
    vertexData: [
      -s, -s,  s, -s,  s,  s,
      -s, -s,  s,  s, -s,  s,
    ],
  };
}

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

const FIELD_PORTS = ['pos_x', 'pos_y', 'color_r', 'color_g', 'color_b'] as const;

const FIELD_CLEAR_VALUES: Record<string, number> = {
  pos_x: 0, pos_y: 0,
  color_r: 1, color_g: 1, color_b: 1,
};

// ---------------------------------------------------------------------------
// Block registration
// ---------------------------------------------------------------------------

registerC1Block('RenderInstances2D', {
  isSink: true,

  manifestRequirements: (ctx): ManifestContribution => {
    const domainId = (ctx.config.domainId as string) ?? 'dots';
    const capacity = (ctx.config.capacity as number) ?? 64;
    const quadScale = (ctx.config.quadScale as number) ?? 0.03;
    const activeSymbol = `${domainId}:active`;

    const fields: Record<string, { type: 'f32'; clearValue: number }> = {};
    for (const field of FIELD_PORTS) {
      fields[field] = { type: 'f32', clearValue: FIELD_CLEAR_VALUES[field] };
    }

    return {
      globals: {
        'sys:camera': { type: 'mat4x4', isDynamic: false, defaultValue: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
      },
      arenaScalars: {
        [activeSymbol]: { type: 'u32', clearValue: capacity },
      },
      domains: {
        [domainId]: {
          capacity,
          activeLanesSymbol: activeSymbol,
          fields,
        },
      },
      shapes: {
        [`${domainId}_quad`]: quad(quadScale),
      },
    };
  },

  lower: (ctx): C1LoweredBlock => {
    const domainId = (ctx.config.domainId as string) ?? 'dots';
    const activeSymbol = `${domainId}:active`;
    const shapeId = `${domainId}_quad`;

    // --- Compute pass: write per-instance fields from upstream expressions ---
    const computeAst: StatementIR[] = [
      let_('gid', intrinsic('global_invocation_id.x')),
    ];

    // [LAW:dataflow-not-control-flow] Emit a storeField for every wired input port.
    // Unwired ports are not stored — field keeps its clearValue from manifest.
    for (const field of FIELD_PORTS) {
      const inputExpr = ctx.inputsById[field];
      if (inputExpr) {
        computeAst.push(storeField(`${domainId}:${field}`, ref('gid'), inputExpr));
      }
    }

    const computePass: ComputePassSpec = {
      type: 'Compute',
      passId: `${domainId}_eval`,
      sourceBlockIds: [ctx.blockId],
      workgroupSize: [64, 1, 1],
      dispatch: { mode: 'Domain', domainId },
      dependencies: { requiresGlobals: false, domains: {}, textures: {} },
      ast: computeAst,
    };

    // --- System_DrawPrep pass ---
    const drawPrepPass: SystemPassSpec = {
      type: 'System_DrawPrep',
      passId: `${domainId}_prep`,
      sourceBlockIds: [ctx.blockId],
      activeLanesSymbol: activeSymbol,
      vertexCount: 6,
    };

    // --- Render pass: vertex + fragment shaders ---
    const vertexAst: StatementIR[] = [
      let_('iid', intrinsic('instance_index')),
      let_('px', loadField(`${domainId}:pos_x`, ref('iid'))),
      let_('py', loadField(`${domainId}:pos_y`, ref('iid'))),
      let_('cr', loadField(`${domainId}:color_r`, ref('iid'))),
      let_('cg', loadField(`${domainId}:color_g`, ref('iid'))),
      let_('cb', loadField(`${domainId}:color_b`, ref('iid'))),
      returnVertex(
        construct('vec4<f32>', [
          binop('+', swizzle(ref('position'), 'x'), ref('px')),
          binop('+', swizzle(ref('position'), 'y'), ref('py')),
          litF32(0),
          litF32(1),
        ]),
        { color: construct('vec4<f32>', [ref('cr'), ref('cg'), ref('cb'), litF32(1)]) },
      ),
    ];

    const fragmentAst: StatementIR[] = [
      returnFragment({ color: ref('color') }),
    ];

    const renderPass: RenderPassSpec = {
      type: 'Render',
      passId: `${domainId}_draw`,
      sourceBlockIds: [ctx.blockId],
      targets: {
        colors: [{
          textureId: 'canvas',
          loadOp: 'clear',
          clearColor: [0.05, 0.05, 0.07, 1],
        }],
      },
      drawCalls: [{
        intentId: `${domainId}_fill`,
        source: { type: 'Domain', domainId, sourceKind: 'Topology', shapeId },
        pipelineState: { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' },
        dependencies: {
          requiresGlobals: false,
          cameraRef: 'sys:camera',
          domains: { [domainId]: 'read' },
          textures: {},
        },
        vertexAst,
        fragmentAst,
      }],
    };

    return {
      kind: 'sink',
      injectedPasses: [computePass, drawPrepPass, renderPass],
    };
  },
});
