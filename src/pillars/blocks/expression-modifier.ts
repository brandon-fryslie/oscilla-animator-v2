/**
 * src/pillars/blocks/expression-modifier.ts
 *
 * ExpressionModifier — Modifier (Pillar 2). Applies a text expression DSL
 * program to a primary SourceBundle, returning a new bundle with some
 * fields replaced.
 */

import { applyExpression } from '../block-dsl/expression/compile';
import type {
  BlockDefinition,
  Diagnostic,
  LoweredBlock,
  LoweringContext,
  ManifestContribution,
} from '../block-api';

interface ExpressionModifierConfig {
  readonly expression: string;
}

type ExpressionModifierLowerArgs = ExpressionModifierConfig;

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

function lower(args: ExpressionModifierLowerArgs, ctx: LoweringContext): LoweredBlock {
  const primary = ctx.inputBundles.primary;
  if (!primary) {
    throw new Error('[ExpressionModifier] requires a primary input bundle');
  }
  let output;
  try {
    output = applyExpression(args.expression, primary, ctx.inputBundles);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[ExpressionModifier]:\n${message}`);
  }
  return { kind: 'bundle', output };
}

export const ExpressionModifierBlock: BlockDefinition<
  ExpressionModifierConfig,
  ExpressionModifierLowerArgs
> = {
  type: 'ExpressionModifier',
  readConfig,
  buildManifestContribution,
  buildLowerArgs: (config) => config,
  lower,
};
