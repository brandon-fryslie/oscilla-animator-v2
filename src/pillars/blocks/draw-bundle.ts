/**
 * src/pillars/blocks/draw-bundle.ts
 *
 * DrawBundle — Intent (Pillar 4). Consumes a primary SourceBundle and emits
 * the three roster entries needed to render it: a compute pass, a
 * System_DrawPrep pass, and a render pass targeting the canvas.
 *
 * The block is now an orchestrator: every concern (geometry, camera,
 * compute pass body, draw call construction, canvas attachment) lives in
 * its own block-dsl module, and the color composition (the Material,
 * Pillar 3) arrives as a resolved MaterialSpec on `ctx.inputMaterials`
 * rather than being built inline. Variation between fixtures comes from
 * data flowing through `attachment` and the wired material, never from a
 * flag this block inspects.
 */

import type {
  RenderPassSpec,
  RosterEntry,
} from '../../render/rust/boundary-contract';
import type {
  BlockDefinition,
  Diagnostic,
  LoweredBlock,
  LoweringContext,
  ManifestContribution,
} from '../block-api';
import { makeUnitQuad } from '../block-dsl/geometry/unit-quad';
import {
  DEFAULT_CAMERA_GLOBAL,
  SYS_CAMERA_SYMBOL,
} from '../block-dsl/presentation/default-camera';
import type { CanvasAttachment } from '../block-dsl/presentation/canvas-attachment';
import { clearCanvas } from '../block-dsl/presentation/canvas-attachment';
import { consumeMaterial } from '../block-dsl/materials/consume-material';
import { buildComputePassFromBundle } from '../block-dsl/pass-builders/compute-from-bundle';
import { buildDrawPrepPass } from '../block-dsl/pass-builders/draw-prep-pass';
import { buildDrawCall } from '../block-dsl/pass-builders/draw-call';
import { buildCanvasRenderPass } from '../block-dsl/pass-builders/canvas-render-pass';

interface DrawBundleConfig {
  readonly domainId: string;
  readonly shapeId: string;
  readonly quadScale: number;
  readonly attachment: CanvasAttachment;
}

type DrawBundleLowerArgs = DrawBundleConfig;

const DEFAULT_CLEAR_COLOR: readonly [number, number, number, number] = [
  0.05, 0.05, 0.07, 1,
];

function readConfig(
  raw: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): DrawBundleConfig | null {
  let hadError = false;
  const push = (message: string): void => {
    diagnostics.push({ severity: 'error', message });
    hadError = true;
  };

  const domainId = raw.domainId;
  if (typeof domainId !== 'string') push('[DrawBundle] config.domainId must be a string');

  const quadScale = raw.quadScale ?? 0.03;
  if (typeof quadScale !== 'number') push('[DrawBundle] config.quadScale must be a number');

  const shapeIdRaw = raw.shapeId;
  const shapeId =
    typeof shapeIdRaw === 'string'
      ? shapeIdRaw
      : typeof domainId === 'string'
        ? `${domainId}_quad`
        : '';

  const attachmentRaw = raw.attachment;
  const attachment: CanvasAttachment =
    attachmentRaw &&
    typeof attachmentRaw === 'object' &&
    typeof (attachmentRaw as { textureId?: unknown }).textureId === 'string'
      ? (attachmentRaw as CanvasAttachment)
      : clearCanvas(DEFAULT_CLEAR_COLOR);

  if (hadError) return null;
  return {
    domainId: domainId as string,
    shapeId,
    quadScale: quadScale as number,
    attachment,
  };
}

function buildManifestContribution(config: DrawBundleConfig): ManifestContribution {
  return {
    globals: { 'sys:camera': DEFAULT_CAMERA_GLOBAL },
    shapes: { [config.shapeId]: makeUnitQuad(config.quadScale) },
  };
}

function lower(args: DrawBundleLowerArgs, ctx: LoweringContext): LoweredBlock {
  const primary = ctx.inputBundles.primary;
  if (!primary) {
    throw new Error('[DrawBundle] requires a primary input bundle');
  }
  if (Object.keys(primary).length === 0) {
    throw new Error('[DrawBundle] primary input bundle has no fields');
  }

  // The material is the single source of truth for both how color composes
  // and what fields the bundle must contain; the sink only forwards it.
  // [LAW:one-source-of-truth] [LAW:single-enforcer]
  const material = consumeMaterial(ctx, 'material', primary, 'DrawBundle');

  const computePass = buildComputePassFromBundle({
    passId: `${args.domainId}_eval`,
    sourceBlockId: args.domainId,
    domainId: args.domainId,
    bundle: primary,
  });

  const drawPrepPass = buildDrawPrepPass({
    passId: `${args.domainId}_prep`,
    sourceBlockId: args.domainId,
    domainId: args.domainId,
    vertexCount: 6,
  });

  const drawCall = buildDrawCall({
    intentId: `${args.domainId}_fill`,
    domainId: args.domainId,
    shapeId: args.shapeId,
    vertexAst: material.vertexAst,
    fragmentAst: material.fragmentAst,
    pipelineState: material.pipelineState,
    cameraRef: SYS_CAMERA_SYMBOL,
  });

  const renderPass: RenderPassSpec = buildCanvasRenderPass({
    passId: `${args.domainId}_draw`,
    sourceBlockId: args.domainId,
    drawCall,
    attachment: args.attachment,
  });

  const passes: RosterEntry[] = [computePass, drawPrepPass, renderPass];
  return { kind: 'intent', passes };
}

export const DrawBundleBlock: BlockDefinition<DrawBundleConfig, DrawBundleLowerArgs> = {
  type: 'DrawBundle',
  readConfig,
  buildManifestContribution,
  buildLowerArgs: (config) => config,
  lower,
};
