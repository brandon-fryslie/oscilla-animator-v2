/**
 * ESLint rule: no-hot-path-alloc
 *
 * Bans heap allocations in hot-path files (render loop, schedule executor,
 * field kernels, render assembler). Every allocation in the per-frame loop
 * is GC pressure that causes jank.
 *
 * Enforcement scope: function bodies in hot-path files. Module-level setup
 * allocations are allowed; any allocation inside a function is rejected.
 * This prevents helper-based bypasses where allocations are moved out of loop
 * syntax but still execute in the render/frame hot path.
 *
 * Catches:
 *   - Object literals: { ... }
 *   - Array literals: [ ... ]
 *   - new expressions (except Error/TypeError/RangeError for fail-fast)
 *   - Spread into new containers: [...x], { ...x }
 *   - Allocating array methods: .map(), .filter(), .slice(), .concat(),
 *     .flat(), .flatMap(), .reduce() when returning new collections,
 *     Array.from(), Array.of(), Object.keys/values/entries/assign/create
 *   - Template literals (allocate a new string)
 *   - Closure creation: arrow functions / function expressions
 *
 * Escape hatch: // eslint-disable-next-line oscilla/no-hot-path-alloc -- <reason>
 */

const ALLOWED_NEW_TARGETS = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
]);

const ALLOCATING_ARRAY_METHODS = new Set([
  'map',
  'filter',
  'slice',
  'concat',
  'flat',
  'flatMap',
  'splice', // returns removed elements
  'toSorted',
  'toReversed',
  'toSpliced',
  'with',
]);

const ALLOCATING_STATIC_METHODS = new Set([
  // Array
  'Array.from',
  'Array.of',
  // Object
  'Object.keys',
  'Object.values',
  'Object.entries',
  'Object.assign',
  'Object.create',
  'Object.fromEntries',
  // String
  'String.raw',
]);

const FUNCTION_NODE_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function isInsideFunction(context, node) {
  // [LAW:verifiable-goals] The gate enforces a deterministic, machine-checkable
  // budget: no allocations in executable hot-path function bodies.
  const ancestors = context.getAncestors
    ? context.getAncestors()
    : context.sourceCode.getAncestors(node);
  return ancestors.some((ancestor) => FUNCTION_NODE_TYPES.has(ancestor.type));
}

function staticMethodName(node) {
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.property.type === 'Identifier'
  ) {
    return `${node.callee.object.name}.${node.callee.property.name}`;
  }
  return null;
}

function instanceMethodName(node) {
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier'
  ) {
    return node.callee.property.name;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow heap allocations inside function bodies in hot-path files. Allocations cause GC pauses and frame drops.',
    },
    messages: {
      objectLiteral:
        'Object literal allocates on heap. Use a pre-allocated buffer or pool in hot-path code.',
      arrayLiteral:
        'Array literal allocates on heap. Use a pre-allocated buffer or pool in hot-path code.',
      newExpression:
        "'new {{ name }}' allocates on heap. Use a pre-allocated instance or pool in hot-path code.",
      allocatingMethod:
        "'.{{ name }}()' allocates a new array/object. Use an in-place alternative in hot-path code.",
      allocatingStaticMethod:
        "'{{ name }}()' allocates on heap. Use a pre-allocated buffer in hot-path code.",
      templateLiteral:
        'Template literal allocates a new string. Use pre-built strings or numeric output in hot-path code.',
      closureCreation:
        'Function/closure creation allocates on heap. Hoist to module scope or use a pre-bound function in hot-path code.',
    },
    schema: [],
  },
  create(context) {
    return {
      // --- Object literals ---
      ObjectExpression(node) {
        if (!isInsideFunction(context, node)) return;
        context.report({ node, messageId: 'objectLiteral' });
      },

      // --- Array literals ---
      ArrayExpression(node) {
        if (!isInsideFunction(context, node)) return;
        context.report({ node, messageId: 'arrayLiteral' });
      },

      // --- new X() (except Error subtypes) ---
      NewExpression(node) {
        if (!isInsideFunction(context, node)) return;
        const name =
          node.callee.type === 'Identifier'
            ? node.callee.name
            : node.callee.type === 'MemberExpression' &&
                node.callee.property.type === 'Identifier'
              ? node.callee.property.name
              : '<unknown>';

        if (ALLOWED_NEW_TARGETS.has(name)) return;

        context.report({
          node,
          messageId: 'newExpression',
          data: { name },
        });
      },

      // --- Allocating method calls ---
      CallExpression(node) {
        if (!isInsideFunction(context, node)) return;
        // Static methods: Array.from(), Object.keys(), etc.
        const sName = staticMethodName(node);
        if (sName && ALLOCATING_STATIC_METHODS.has(sName)) {
          context.report({
            node,
            messageId: 'allocatingStaticMethod',
            data: { name: sName },
          });
          return;
        }

        // Instance methods: .map(), .filter(), .slice(), etc.
        const iName = instanceMethodName(node);
        if (iName && ALLOCATING_ARRAY_METHODS.has(iName)) {
          context.report({
            node,
            messageId: 'allocatingMethod',
            data: { name: iName },
          });
        }
      },

      // --- Template literals (allocate strings) ---
      TemplateLiteral(node) {
        if (!isInsideFunction(context, node)) return;
        // Only flag interpolated templates (plain `foo` without ${} is just a string literal)
        if (node.expressions.length > 0) {
          context.report({ node, messageId: 'templateLiteral' });
        }
      },

      // --- Closures ---
      ArrowFunctionExpression(node) {
        if (!isInsideFunction(context, node)) return;
        // Don't flag top-level (module scope) arrow functions —
        // only flag closures created inside other functions.
        // Exclude the immediate parent: a class method's FunctionExpression
        // has MethodDefinition as parent, but is on the prototype (not per-call).
        const ancestors = context.getAncestors ? context.getAncestors() : context.sourceCode.getAncestors(node);
        const ancestorsExceptParent = ancestors.slice(0, -1);
        const insideFunction = ancestorsExceptParent.some(
          (a) =>
            a.type === 'FunctionDeclaration' ||
            a.type === 'FunctionExpression' ||
            a.type === 'ArrowFunctionExpression',
        );
        if (insideFunction) {
          context.report({ node, messageId: 'closureCreation' });
        }
      },

      FunctionExpression(node) {
        if (!isInsideFunction(context, node)) return;
        // Exclude the immediate parent from ancestor check.
        // A class method body is a FunctionExpression with MethodDefinition parent —
        // it's on the prototype, not allocated per-call.
        const ancestors = context.getAncestors ? context.getAncestors() : context.sourceCode.getAncestors(node);
        const ancestorsExceptParent = ancestors.slice(0, -1);
        const insideFunction = ancestorsExceptParent.some(
          (a) =>
            a.type === 'FunctionDeclaration' ||
            a.type === 'FunctionExpression' ||
            a.type === 'ArrowFunctionExpression',
        );
        if (insideFunction) {
          context.report({ node, messageId: 'closureCreation' });
        }
      },
    };
  },
};
