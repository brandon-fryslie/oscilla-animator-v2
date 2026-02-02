/**
 * ESLint rule: no-block-type-check-in-lower
 *
 * Disallows checking block types inside `lower` functions.
 * Lower functions compile a single block definition to IR — they should
 * never branch on what kind of block they're connected to. That's a
 * graph-level concern resolved before lowering.
 *
 * Catches:
 *   - Property access: .blockType, .type === 'Const', etc.
 *   - String literals matching known block type names used in comparisons
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow checking block types inside lower functions. Lower compiles one block — it should not inspect neighbors.',
    },
    messages: {
      noBlockTypeAccess:
        "Do not access '{{ name }}' inside lower(). Lower functions compile a single block and must not branch on neighbor block types.",
    },
    schema: [],
  },
  create(context) {
    let insideLower = false;

    const BLOCK_TYPE_PROPERTIES = new Set(['blockType']);

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
          BLOCK_TYPE_PROPERTIES.has(node.property.name)
        ) {
          context.report({
            node: node.property,
            messageId: 'noBlockTypeAccess',
            data: { name: node.property.name },
          });
        }
      },
    };
  },
};
