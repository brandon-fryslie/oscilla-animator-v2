/**
 * ESLint rule: no-default-source-in-lower
 *
 * Disallows accessing the `defaultSource` property inside `lower` functions.
 * Default source resolution is a graph-level concern handled before lowering.
 * Lower functions receive fully resolved inputs and should never inspect
 * how those inputs were sourced.
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow accessing defaultSource inside lower functions. Source resolution is a graph-level concern.',
    },
    messages: {
      noDefaultSource:
        'Do not access defaultSource inside lower(). Source resolution happens before lowering — lower receives fully resolved inputs.',
    },
    schema: [],
  },
  create(context) {
    let insideLower = false;

    function isLowerProperty(node) {
      return (
        node.type === 'Property' &&
        node.key.type === 'Identifier' &&
        node.key.name === 'lower'
      );
    }

    return {
      'Property > ArrowFunctionExpression'(node) {
        if (isLowerProperty(node.parent)) insideLower = true;
      },
      'Property > ArrowFunctionExpression:exit'(node) {
        if (isLowerProperty(node.parent)) insideLower = false;
      },
      'Property > FunctionExpression'(node) {
        if (isLowerProperty(node.parent)) insideLower = true;
      },
      'Property > FunctionExpression:exit'(node) {
        if (isLowerProperty(node.parent)) insideLower = false;
      },

      MemberExpression(node) {
        if (!insideLower) return;
        if (
          node.property.type === 'Identifier' &&
          node.property.name === 'defaultSource'
        ) {
          context.report({ node: node.property, messageId: 'noDefaultSource' });
        }
      },
    };
  },
};
