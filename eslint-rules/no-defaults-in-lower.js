/**
 * ESLint rule: no-defaults-in-lower
 *
 * Disallows using ?? or || to set default values inside `lower` functions.
 * Default values belong in block input definitions (defaultValue), not in
 * the lowering code path.
 *
 * Catches patterns like:
 *   const x = (config?.foo as number) ?? 1.0;
 *   const x = config?.foo ?? 'default';
 *   const x = config?.foo || fallback;
 *
 * Does NOT flag logical expressions used in conditions (if/ternary/etc.)
 * or where neither side involves config access.
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow default values via ?? or || inside lower functions. Defaults belong in block input definitions.',
    },
    messages: {
      noDefault:
        'Do not set default values inside lower(). Defaults belong in the block input definition (defaultValue), not in lowering code.',
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
      // Track entering a `lower:` property value (the function)
      'Property > ArrowFunctionExpression'(node) {
        if (isLowerProperty(node.parent)) {
          insideLower = true;
        }
      },
      'Property > ArrowFunctionExpression:exit'(node) {
        if (isLowerProperty(node.parent)) {
          insideLower = false;
        }
      },
      'Property > FunctionExpression'(node) {
        if (isLowerProperty(node.parent)) {
          insideLower = true;
        }
      },
      'Property > FunctionExpression:exit'(node) {
        if (isLowerProperty(node.parent)) {
          insideLower = false;
        }
      },

      // Flag ?? unconditionally (it's always a default-value pattern).
      // Flag || only when used as a default in assignment/initialization context,
      // not in conditions (if, ternary test, while, etc.).
      LogicalExpression(node) {
        if (!insideLower) return;

        if (node.operator === '??') {
          context.report({ node, messageId: 'noDefault' });
          return;
        }

        if (node.operator === '||') {
          // Only flag || when it's being used as a default value
          // (i.e. in a variable declarator init or assignment RHS),
          // not when used as a boolean condition.
          const parent = node.parent;
          if (!parent) return;

          const isInAssignment =
            (parent.type === 'VariableDeclarator' && parent.init === node) ||
            (parent.type === 'AssignmentExpression' && parent.right === node) ||
            // Handle: (config?.x as T) || default — TSAsExpression wraps it
            (parent.type === 'TSAsExpression' &&
              parent.parent &&
              ((parent.parent.type === 'VariableDeclarator' && parent.parent.init === parent) ||
                (parent.parent.type === 'AssignmentExpression' && parent.parent.right === parent)));

          if (isInAssignment) {
            context.report({ node, messageId: 'noDefault' });
          }
        }
      },
    };
  },
};
