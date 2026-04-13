import type {
  BlockDefinition,
  Diagnostic,
  ManifestContribution,
} from '../block-api';

interface TextureGridConfig {
  readonly width: number;
  readonly height: number;
}

function readConfig(
  raw: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): TextureGridConfig | null {
  let hadError = false;
  const push = (message: string): void => {
    diagnostics.push({ severity: 'error', message });
    hadError = true;
  };

  const width = raw.width;
  if (typeof width !== 'number' || width <= 0 || !Number.isInteger(width)) {
    push('[TextureGrid] config.width must be a positive integer');
  }
  const height = raw.height;
  if (typeof height !== 'number' || height <= 0 || !Number.isInteger(height)) {
    push('[TextureGrid] config.height must be a positive integer');
  }

  if (hadError) return null;
  return { width: width as number, height: height as number };
}

function buildManifestContribution(): ManifestContribution {
  return {};
}

export const TextureGridBlock: BlockDefinition<TextureGridConfig> = {
  type: 'TextureGrid',
  readConfig,
  buildManifestContribution,
};
