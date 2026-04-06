/**
 * src/pillars/blocks/expression-modifier.ts
 *
 * ExpressionModifier — a Modifier (Pillar 2) that takes a primary SourceBundle
 * and applies a text-based expression DSL program to produce a new
 * SourceBundle with some fields replaced.
 *
 * Config:
 *   expression: string — a multi-line expression DSL program. Each non-empty
 *     non-comment line is an assignment of the form `field = expression`
 *     where the RHS is a math expression over the input bundle's fields,
 *     numeric literals, operators (+ - * / %), unary minus, parentheses,
 *     and built-in math function calls (sin, cos, sqrt, clamp, ...).
 *
 * Grammar and compilation rules are documented in src/pillars/expression/ast.ts
 * and src/pillars/expression/compile.ts respectively.
 *
 * The block's behavior is pure: parse + compile happen at graph compile time
 * (inside lower()), producing a new SourceBundle record. Fields not mentioned
 * by any assignment pass through unchanged from the upstream bundle.
 *
 * Design reference: design-docs/B2-source-bundle/01-engineering-design.md §5.1.
 */

import { registerPillarBlock } from '../registry';
import { applyExpression } from '../expression/compile';
import type { PillarBlockDef, PillarLoweringContext } from '../types';

function readExpression(ctx: PillarLoweringContext): string {
  const raw = ctx.config.expression;
  if (typeof raw !== 'string') {
    throw new Error(
      `[ExpressionModifier] Block '${ctx.blockId}': config.expression must be a string`,
    );
  }
  return raw;
}

const def: PillarBlockDef = {
  kind: 'modifier',

  // No manifest contributions — the domain and its field set are declared
  // by the upstream Generator. A Modifier only operates on fields that the
  // Generator already declared.

  lower: (ctx) => {
    const primary = ctx.inputBundles.primary;
    if (!primary) {
      throw new Error(
        `[ExpressionModifier] Block '${ctx.blockId}' requires a primary input bundle`,
      );
    }

    const expressionText = readExpression(ctx);
    // applyExpression throws on parse or compile errors with a fully
    // formatted message (file-like path info would be added here if the
    // block tracked source locations).
    let output;
    try {
      output = applyExpression(expressionText, primary);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`[ExpressionModifier] Block '${ctx.blockId}':\n${message}`);
    }

    return { kind: 'bundle', output };
  },
};

registerPillarBlock('ExpressionModifier', def);
