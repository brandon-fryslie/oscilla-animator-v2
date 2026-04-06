/**
 * src/pillars/blocks/draw-bundle.ts
 *
 * DrawBundle — an Intent (Pillar 4) that consumes a primary SourceBundle and
 * emits the three roster entries needed to render it:
 *
 *   1. Compute pass: writes every bundle field into the domain's SoA storage
 *      via a StoreField per field key. The field set is discovered from the
 *      bundle's own keys — no hardcoded pos_x/pos_y enumeration.
 *
 *   2. System_DrawPrep pass: reads the domain's `active` scalar and writes
 *      it into the draw-indirect args.
 *
 *   3. Render pass: vertex shader loads each field from SoA and assembles
 *      a vec4 position + color; fragment shader outputs the color.
 *
 * The first slice uses a hardcoded fragment shader inside this Intent. A
 * dedicated Material pillar (Pillar 3) that supplies the fragment shader
 * comes in a follow-up slice.
 */

import type {
  ComputePassSpec,
  DrawCallSpec,
  PipelineStateSpec,
  RenderPassSpec,
  RosterEntry,
  StaticGeometrySpec,
  StatementIR,
  SystemPassSpec,
  GlobalSpec,
} from '../../render/rust/boundary-contract';
import {
  binop,
  construct,
  intrinsic,
  let_,
  litF32,
  loadField,
  ref,
  returnFragment,
  returnVertex,
  storeField,
  swizzle,
} from '../../render/gpu-ir/ir-builders';
import { registerPillarBlock } from '../registry';
import type { ManifestContribution, PillarBlockDef, SourceBundle } from '../types';

interface DrawBundleConfig {
  readonly domainId: string;
  readonly shapeId: string;
  readonly quadScale: number;
}

function readConfig(raw: Readonly<Record<string, unknown>>): DrawBundleConfig {
  const domainId = raw.domainId;
  const shapeIdRaw = raw.shapeId;
  const quadScale = raw.quadScale ?? 0.03;
  if (typeof domainId !== 'string') {
    throw new Error("[DrawBundle] config.domainId must be a string");
  }
  const shapeId = typeof shapeIdRaw === 'string' ? shapeIdRaw : `${domainId}_quad`;
  if (typeof quadScale !== 'number') {
    throw new Error("[DrawBundle] config.quadScale must be a number");
  }
  return { domainId, shapeId, quadScale };
}

// A unit quad built from two triangles. Screen-space offsets applied by the
// vertex shader add the per-instance position.
function unitQuad(scale: number): StaticGeometrySpec {
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

// Identity 4x4 camera matrix. Real camera support comes in a follow-up slice;
// for now we render in clip space directly.
const IDENTITY_MAT4: readonly number[] = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

const def: PillarBlockDef = {
  kind: 'intent',

  manifestRequirements: (ctx): ManifestContribution => {
    const config = readConfig(ctx.config);

    const cameraGlobal: GlobalSpec = {
      type: 'mat4x4',
      isDynamic: false,
      defaultValue: IDENTITY_MAT4,
    };

    return {
      globals: { 'sys:camera': cameraGlobal },
      shapes: { [config.shapeId]: unitQuad(config.quadScale) },
    };
  },

  lower: (ctx) => {
    const config = readConfig(ctx.config);
    const domainId = config.domainId;
    const activeSymbol = `${domainId}:active`;

    const primary = ctx.inputBundles.primary;
    if (!primary) {
      throw new Error(`[DrawBundle] Block '${ctx.blockId}' requires a primary input bundle`);
    }

    const fieldNames = Object.keys(primary).sort();
    if (fieldNames.length === 0) {
      throw new Error(`[DrawBundle] Primary input bundle for block '${ctx.blockId}' has no fields`);
    }

    // --- Compute pass: one StoreField per bundle key -------------------------
    const computeAst: StatementIR[] = [let_('gid', intrinsic('global_invocation_id.x'))];
    for (const fieldName of fieldNames) {
      const expr = primary[fieldName];
      computeAst.push(
        storeField(
          `${domainId}:${fieldName}` as Parameters<typeof storeField>[0],
          ref('gid'),
          expr,
        ),
      );
    }

    const computePass: ComputePassSpec = {
      type: 'Compute',
      passId: `${domainId}_eval`,
      sourceBlockIds: [ctx.blockId],
      workgroupSize: [64, 1, 1],
      dispatch: {
        mode: 'Domain',
        domainId: domainId as ComputePassSpec['dispatch'] extends { mode: 'Domain'; domainId: infer D } ? D : never,
      },
      dependencies: {
        requiresGlobals: true,
        // The pass writes every field of the `dots` domain via StoreField;
        // the Rust translator checks this declaration before allowing the
        // field writes.
        domains: { [domainId]: 'read_write' } as ComputePassSpec['dependencies']['domains'],
        textures: {},
      },
      ast: computeAst,
    };

    // --- System_DrawPrep pass ---------------------------------------------
    const drawPrepPass: SystemPassSpec = {
      type: 'System_DrawPrep',
      passId: `${domainId}_prep`,
      sourceBlockIds: [ctx.blockId],
      activeLanesSymbol: activeSymbol as SystemPassSpec['activeLanesSymbol'],
      vertexCount: 6,
    };

    // --- Render pass ------------------------------------------------------
    // Vertex shader: load pos_x/pos_y/color_* from SoA, assemble the instance
    // position (unit quad + per-instance offset), pass color as a varying.
    //
    // We require the bundle to contain pos_x, pos_y, color_r, color_g, color_b
    // for the slice because the vertex shader template is hardcoded for these
    // specific fields. A future slice with a Material pillar makes this
    // data-driven.
    const requiredFields = ['pos_x', 'pos_y', 'color_r', 'color_g', 'color_b'];
    for (const req of requiredFields) {
      if (!(req in primary)) {
        throw new Error(
          `[DrawBundle] Primary bundle is missing required field '${req}' (hardcoded vertex shader template). ` +
          `Found fields: ${fieldNames.join(', ')}`,
        );
      }
    }

    const vertexAst: StatementIR[] = [
      let_('iid', intrinsic('instance_index')),
      let_('px', loadField(`${domainId}:pos_x` as Parameters<typeof loadField>[0], ref('iid'))),
      let_('py', loadField(`${domainId}:pos_y` as Parameters<typeof loadField>[0], ref('iid'))),
      let_('cr', loadField(`${domainId}:color_r` as Parameters<typeof loadField>[0], ref('iid'))),
      let_('cg', loadField(`${domainId}:color_g` as Parameters<typeof loadField>[0], ref('iid'))),
      let_('cb', loadField(`${domainId}:color_b` as Parameters<typeof loadField>[0], ref('iid'))),
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

    const pipelineState: PipelineStateSpec = {
      blendMode: 'opaque',
      cullMode: 'none',
      depthWrite: false,
      depthCompare: 'always',
    };

    const drawCall: DrawCallSpec = {
      intentId: `${domainId}_fill`,
      source: {
        type: 'Domain',
        domainId: domainId as DrawCallSpec['source'] extends { type: 'Domain'; domainId: infer D } ? D : never,
        sourceKind: 'Topology',
        shapeId: config.shapeId as DrawCallSpec['source'] extends { type: 'Domain'; shapeId: infer S } ? S : never,
      },
      pipelineState,
      dependencies: {
        requiresGlobals: true,
        cameraRef: 'sys:camera' as DrawCallSpec['dependencies']['cameraRef'],
        domains: { [domainId]: 'read' } as DrawCallSpec['dependencies']['domains'],
        textures: {},
      },
      vertexAst,
      fragmentAst,
    };

    const renderPass: RenderPassSpec = {
      type: 'Render',
      passId: `${domainId}_draw`,
      sourceBlockIds: [ctx.blockId],
      // The canvas attachment is configured for 4x MSAA by the renderer shell;
      // render passes targeting the canvas must match this sample count.
      sampleCount: 4,
      targets: {
        colors: [{
          textureId: 'canvas',
          loadOp: 'clear',
          clearColor: [0.05, 0.05, 0.07, 1],
        }],
      },
      viewport: { x: 0, y: 0, width: 640, height: 480, minDepth: 0, maxDepth: 1 },
      scissorRect: { x: 0, y: 0, width: 640, height: 480 },
      drawCalls: [drawCall],
    };

    const passes: RosterEntry[] = [computePass, drawPrepPass, renderPass];
    return { kind: 'intent', passes };
  },
};

registerPillarBlock('DrawBundle', def);
