/**
 * ESLint rule: no-nullish-coalescing-defaults
 *
 * Disallows using ?? to set default values in targeted files.
 * In data-path code (runtime evaluators, materializer, continuity,
 * compiler), a missing value indicates an upstream bug — silently
 * substituting a default hides it.
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow ?? in data-path files. Missing values are upstream bugs, not default opportunities.',
    },
    messages: {
      noNullishDefault:
        'Do not use ?? to set defaults in data-path code. A missing value here is an upstream bug — fail loudly instead of substituting a default.',
    },
    schema: [],
  },
  create(context) {
    return {
      LogicalExpression(node) {
        if (node.operator === '??') {
          context.report({ node, messageId: 'noNullishDefault' });
        }
      },
    };
  },
};
