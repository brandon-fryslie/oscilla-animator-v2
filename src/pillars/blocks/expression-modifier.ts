import type {
  BlockDefinition,
  Diagnostic,
  ManifestContribution,
} from '../block-api';

interface ExpressionModifierConfig {
  readonly expression: string;
}

function readConfig(
  raw: Readonly<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): ExpressionModifierConfig | null {
  const expression = raw.expression;
  if (typeof expression !== 'string') {
    diagnostics.push({
      severity: 'error',
      message: '[ExpressionModifier] config.expression must be a string',
    });
    return null;
  }
  return { expression };
}

function buildManifestContribution(): ManifestContribution {
  return {};
}

export const ExpressionModifierBlock: BlockDefinition<ExpressionModifierConfig> = {
  type: 'ExpressionModifier',
  readConfig,
  buildManifestContribution,
};
