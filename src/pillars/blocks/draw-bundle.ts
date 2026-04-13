import type {
  BlockDefinition,
  Diagnostic,
  ManifestContribution,
} from '../block-api';
import { makeUnitQuad } from '../block-dsl/geometry/unit-quad';
import { DEFAULT_CAMERA_GLOBAL } from '../block-dsl/presentation/default-camera';
import type { CanvasAttachment } from '../block-dsl/presentation/canvas-attachment';
import { clearCanvas } from '../block-dsl/presentation/canvas-attachment';

interface DrawBundleConfig {
  readonly domainId: string;
  readonly shapeId: string;
  readonly quadScale: number;
  readonly attachment: CanvasAttachment;
}

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

export const DrawBundleBlock: BlockDefinition<DrawBundleConfig> = {
  type: 'DrawBundle',
  readConfig,
  buildManifestContribution,
};
