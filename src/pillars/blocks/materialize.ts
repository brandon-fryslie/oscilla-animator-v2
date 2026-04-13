import type {
  BlockDefinition,
  Diagnostic,
  ManifestContribution,
} from '../block-api';
import { makeStorageTexture2D } from '../block-dsl/presentation/storage-texture';

interface MaterializeConfig {
  readonly textureId: string;
  readonly width: number;
  readonly height: number;
  readonly format: string;
}

function readConfig(
  raw: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): MaterializeConfig | null {
  let hadError = false;
  const push = (message: string): void => {
    diagnostics.push({ severity: 'error', message });
    hadError = true;
  };

  const textureId = raw.textureId;
  if (typeof textureId !== 'string') push('[Materialize] config.textureId must be a string');

  const width = raw.width;
  if (typeof width !== 'number' || width <= 0 || !Number.isInteger(width)) {
    push('[Materialize] config.width must be a positive integer');
  }

  const height = raw.height;
  if (typeof height !== 'number' || height <= 0 || !Number.isInteger(height)) {
    push('[Materialize] config.height must be a positive integer');
  }

  const formatRaw = raw.format ?? 'rgba8unorm';
  if (typeof formatRaw !== 'string') push('[Materialize] config.format must be a string');

  if (hadError) return null;
  return {
    textureId: textureId as string,
    width: width as number,
    height: height as number,
    format: formatRaw as string,
  };
}

function buildManifestContribution(config: MaterializeConfig): ManifestContribution {
  return {
    textures: {
      [config.textureId]: makeStorageTexture2D(config.width, config.height, config.format),
    },
  };
}

export const MaterializeBlock: BlockDefinition<MaterializeConfig> = {
  type: 'Materialize',
  readConfig,
  buildManifestContribution,
};
