/**
 * Expression DSL Type Checker
 *
 * Performs bottom-up type inference and validation.
 * Annotates AST nodes with inferred types.
 *
 * Type rules reference: .agent_planning/expression-dsl/TYPE-RULES.md
 * Function signatures: src/expr/FUNCTIONS.md
 */

import type { ExprNode, Position } from './ast';
import { withType } from './ast';
import type { PayloadType } from '../core/canonical-types';

/**
 * Type error with position and suggestion.
 */
export class TypeError extends Error {
  constructor(
    message: string,
    public readonly pos: Position,
    public readonly expected?: PayloadType[],
    public readonly got?: PayloadType,
    public readonly suggestion?: string
  ) {
    super(message);
    this.name = 'TypeError';
  }
}

/**
 * Input type environment (maps identifier names to types).
 */
export type TypeEnv = ReadonlyMap<string, PayloadType>;

/**
 * Function signature catalog.
 */
interface FunctionSignature {
  readonly params: readonly PayloadType[];
  readonly returnType: PayloadType;
  readonly polymorphic?: boolean; // For min/max/abs that work on int or float
}

/**
 * Built-in function signatures (from FUNCTIONS.md).
 */
const FUNCTION_SIGNATURES: Record<string, FunctionSignature> = {
  // Trigonometric
  sin: { params: ['float'], returnType: 'float' },
  cos: { params: ['float'], returnType: 'float' },
  tan: { params: ['float'], returnType: 'float' },

  // Unary
  abs: { params: ['float'], returnType: 'float', polymorphic: true },
  sqrt: { params: ['float'], returnType: 'float' },
  floor: { params: ['float'], returnType: 'int' },
  ceil: { params: ['float'], returnType: 'int' },
  round: { params: ['float'], returnType: 'int' },

  // Binary
  min: { params: ['float', 'float'], returnType: 'float', polymorphic: true },
  max: { params: ['float', 'float'], returnType: 'float', polymorphic: true },

  // Interpolation
  lerp: { params: ['float', 'float', 'float'], returnType: 'float' },
  mix: { params: ['float', 'float', 'float'], returnType: 'float' }, // Alias
  smoothstep: { params: ['float', 'float', 'float'], returnType: 'float' },
  clamp: { params: ['float', 'float', 'float'], returnType: 'float' },

  // Phase
  wrap: { params: ['float'], returnType: 'phase' },
  fract: { params: ['float'], returnType: 'float' },
};

/**
 * Type check expression and return annotated AST.
 * @param node AST node to type check
 * @param env Input type environment
 * @returns Annotated AST node with type information
 * @throws TypeError if type checking fails
 */
export function typecheck(node: ExprNode, env: TypeEnv): ExprNode {
  switch (node.kind) {
    case 'literal':
      return typecheckLiteral(node);

    case 'identifier':
      return typecheckIdentifier(node, env);

    case 'unary':
      return typecheckUnary(node, env);

    case 'binary':
      return typecheckBinary(node, env);

    case 'ternary':
      return typecheckTernary(node, env);

    case 'call':
      return typecheckCall(node, env);

    default:
      const _exhaustive: never = node;
      throw new Error(`Unknown node kind: ${(_exhaustive as any).kind}`);
  }
}

/**
 * Type check literal node.
 * Uses the `raw` field to determine if literal was originally int or float.
 */
function typecheckLiteral(node: ExprNode & { kind: 'literal' }): ExprNode {
  // Check raw token string for decimal point
  const hasDecimalPoint = node.raw.includes('.');
  const type: PayloadType = hasDecimalPoint ? 'float' : 'int';
  return withType(node, type);
}

/**
 * Type check identifier node.
 */
function typecheckIdentifier(node: ExprNode & { kind: 'identifier' }, env: TypeEnv): ExprNode {
  const type = env.get(node.name);
  if (!type) {
    const available = Array.from(env.keys()).join(', ');
    const suggestion = findClosestMatch(node.name, Array.from(env.keys()));
    throw new TypeError(
      `Undefined input '${node.name}'. Available inputs: ${available}${suggestion ? `. Did you mean '${suggestion}'?` : ''}`,
      node.pos
    );
  }
  return withType(node, type);
}

/**
 * Type check unary operator node.
 */
function typecheckUnary(node: ExprNode & { kind: 'unary' }, env: TypeEnv): ExprNode {
  const arg = typecheck(node.arg, env);
  const argType = arg.type!;

  switch (node.op) {
    case '!': {
      // Logical NOT requires bool
      if (argType !== 'bool') {
        throw new TypeError(
          `Logical NOT requires bool operand, got ${argType}`,
          node.pos,
          ['bool'],
          argType,
          argType === 'float' || argType === 'int' ? 'Use comparison operators (>, <, ==, !=) to get bool' : undefined
        );
      }
      return withType({ ...node, arg }, 'bool');
    }

    case '-': {
      // Negation: numeric types only
      if (!isNumeric(argType)) {
        throw new TypeError(
          `Unary negation requires numeric operand, got ${argType}`,
          node.pos,
          ['int', 'float', 'phase'],
          argType
        );
      }
      // Negating unit is not allowed
      if (argType === 'unit') {
        throw new TypeError(
          `Cannot negate unit type (produces negative values, violating [0,1] constraint)`,
          node.pos
        );
      }
      return withType({ ...node, arg }, argType);
    }

    case '+': {
      // Unary plus: numeric types only, no-op
      if (!isNumeric(argType)) {
        throw new TypeError(
          `Unary plus requires numeric operand, got ${argType}`,
          node.pos,
          ['int', 'float', 'phase', 'unit'],
          argType
        );
      }
      return withType({ ...node, arg }, argType);
    }

    default:
      const _exhaustive: never = node.op;
      throw new Error(`Unknown unary operator: ${_exhaustive}`);
  }
}

/**
 * Type check binary operator node.
 */
function typecheckBinary(node: ExprNode & { kind: 'binary' }, env: TypeEnv): ExprNode {
  const left = typecheck(node.left, env);
  const right = typecheck(node.right, env);
  const leftType = left.type!;
  const rightType = right.type!;

  switch (node.op) {
    // Arithmetic operators
    case '+':
    case '-':
    case '*':
    case '/':
    case '%': {
      return typecheckArithmetic(node, left, right, leftType, rightType);
    }

    // Comparison operators
    case '<':
    case '>':
    case '<=':
    case '>=':
    case '==':
    case '!=': {
      return typecheckComparison(node, left, right, leftType, rightType);
    }

    // Logical operators
    case '&&':
    case '||': {
      return typecheckLogical(node, left, right, leftType, rightType);
    }

    default:
      const _exhaustive: never = node.op;
      throw new Error(`Unknown binary operator: ${_exhaustive}`);
  }
}

/**
 * Type check arithmetic operators.
 */
function typecheckArithmetic(
  node: ExprNode & { kind: 'binary' },
  left: ExprNode,
  right: ExprNode,
  leftType: PayloadType,
  rightType: PayloadType
): ExprNode {
  // Phase arithmetic restrictions
  if (leftType === 'phase' && rightType === 'phase') {
    throw new TypeError(
      `Cannot ${opToVerb(node.op)} phase + phase. Use phase + float for offset.`,
      node.pos
    );
  }

  // Both must be numeric
  if (!isNumeric(leftType) || !isNumeric(rightType)) {
    throw new TypeError(
      `Arithmetic operator '${node.op}' requires numeric operands, got ${leftType} ${node.op} ${rightType}`,
      node.pos
    );
  }

  // Determine result type
  const resultType = unifyNumeric(leftType, rightType);
  return withType({ ...node, left, right }, resultType);
}

/**
 * Type check comparison operators.
 */
function typecheckComparison(
  node: ExprNode & { kind: 'binary' },
  left: ExprNode,
  right: ExprNode,
  leftType: PayloadType,
  rightType: PayloadType
): ExprNode {
  // Ordering comparisons (<, >, <=, >=) require numeric types
  if (node.op !== '==' && node.op !== '!=') {
    if (!isNumeric(leftType) || !isNumeric(rightType)) {
      throw new TypeError(
        `Comparison operator '${node.op}' requires numeric operands, got ${leftType} ${node.op} ${rightType}`,
        node.pos
      );
    }
  }

  // Equality comparisons (==, !=) allow bool or numeric
  if (node.op === '==' || node.op === '!=') {
    if (leftType === 'bool' && rightType !== 'bool') {
      throw new TypeError(
        `Cannot compare ${leftType} with ${rightType}`,
        node.pos
      );
    }
    if (leftType !== 'bool' && rightType === 'bool') {
      throw new TypeError(
        `Cannot compare ${leftType} with ${rightType}`,
        node.pos
      );
    }
  }

  return withType({ ...node, left, right }, 'bool');
}

/**
 * Type check logical operators.
 */
function typecheckLogical(
  node: ExprNode & { kind: 'binary' },
  left: ExprNode,
  right: ExprNode,
  leftType: PayloadType,
  rightType: PayloadType
): ExprNode {
  // Both operands must be bool
  if (leftType !== 'bool') {
    throw new TypeError(
      `Logical ${node.op === '&&' ? 'AND' : 'OR'} requires bool operands. Left operand is ${leftType}.`,
      node.pos,
      ['bool'],
      leftType,
      leftType === 'float' || leftType === 'int' ? `Did you mean '... > 0 ${node.op} ...'?` : undefined
    );
  }
  if (rightType !== 'bool') {
    throw new TypeError(
      `Logical ${node.op === '&&' ? 'AND' : 'OR'} requires bool operands. Right operand is ${rightType}.`,
      node.pos,
      ['bool'],
      rightType,
      rightType === 'float' || rightType === 'int' ? `Did you mean '... ${node.op} ... > 0'?` : undefined
    );
  }

  return withType({ ...node, left, right }, 'bool');
}

/**
 * Type check ternary conditional node.
 */
function typecheckTernary(node: ExprNode & { kind: 'ternary' }, env: TypeEnv): ExprNode {
  const cond = typecheck(node.cond, env);
  const thenBranch = typecheck(node.then, env);
  const elseBranch = typecheck(node.else, env);

  const condType = cond.type!;
  const thenType = thenBranch.type!;
  const elseType = elseBranch.type!;

  // Condition must be bool
  if (condType !== 'bool') {
    throw new TypeError(
      `Ternary condition must be bool, got ${condType}`,
      cond.pos,
      ['bool'],
      condType
    );
  }

  // Branches must have compatible types
  const resultType = unifyTypes(thenType, elseType);
  if (!resultType) {
    throw new TypeError(
      `Ternary branches have incompatible types: ${thenType} and ${elseType}`,
      node.pos
    );
  }

  return withType({ ...node, cond, then: thenBranch, else: elseBranch }, resultType);
}

/**
 * Type check function call node.
 */
function typecheckCall(node: ExprNode & { kind: 'call' }, env: TypeEnv): ExprNode {
  const signature = FUNCTION_SIGNATURES[node.fn];

  // Check if function exists
  if (!signature) {
    const available = Object.keys(FUNCTION_SIGNATURES).join(', ');
    const suggestion = findClosestMatch(node.fn, Object.keys(FUNCTION_SIGNATURES));
    throw new TypeError(
      `Unknown function '${node.fn}'. Available functions: ${available}${suggestion ? `. Did you mean '${suggestion}'?` : ''}`,
      node.pos
    );
  }

  // Check arity
  if (node.args.length !== signature.params.length) {
    throw new TypeError(
      `Function '${node.fn}' expects ${signature.params.length} argument${signature.params.length === 1 ? '' : 's'}, got ${node.args.length}`,
      node.pos
    );
  }

  // Type check arguments
  const typedArgs = node.args.map(arg => typecheck(arg, env));

  // Validate argument types
  for (let i = 0; i < typedArgs.length; i++) {
    const argType = typedArgs[i].type!;
    const paramType = signature.params[i];

    // Polymorphic functions (min, max, abs)
    if (signature.polymorphic && i === 0) {
      // First argument determines the type
      if (!isNumeric(argType)) {
        throw new TypeError(
          `Function '${node.fn}' expects numeric type, got ${argType} for argument ${i + 1}`,
          typedArgs[i].pos,
          ['int', 'float'],
          argType
        );
      }
      continue;
    }

    if (signature.polymorphic && i === 1) {
      // Second argument must match first for min/max
      const firstArgType = typedArgs[0].type!;
      if (!canCoerceTo(argType, firstArgType)) {
        throw new TypeError(
          `Function '${node.fn}' arguments must have compatible types, got ${firstArgType} and ${argType}`,
          typedArgs[i].pos
        );
      }
      continue;
    }

    // Regular type checking with coercion
    if (!canCoerceTo(argType, paramType)) {
      throw new TypeError(
        `Function '${node.fn}' expects ${paramType} for argument ${i + 1}, got ${argType}`,
        typedArgs[i].pos,
        [paramType],
        argType
      );
    }
  }

  // Determine return type (for polymorphic functions, use first arg type)
  let returnType = signature.returnType;
  if (signature.polymorphic) {
    const firstArgType = typedArgs[0].type!;
    returnType = firstArgType === 'int' ? 'int' : 'float';
  }

  return withType({ ...node, args: typedArgs }, returnType);
}

// =============================================================================
// Type Unification and Coercion
// =============================================================================

/**
 * Check if a type is numeric.
 */
function isNumeric(type: PayloadType): boolean {
  return type === 'int' || type === 'float' || type === 'phase' || type === 'unit';
}

/**
 * Unify two numeric types (for arithmetic operations).
 * Returns most general type or throws if incompatible.
 */
function unifyNumeric(left: PayloadType, right: PayloadType): PayloadType {
  // int + int → int
  if (left === 'int' && right === 'int') return 'int';

  // int + float → float (coerce int)
  if ((left === 'int' && right === 'float') || (left === 'float' && right === 'int')) {
    return 'float';
  }

  // float + float → float
  if (left === 'float' && right === 'float') return 'float';

  // phase + float → phase (phase offset)
  if ((left === 'phase' && right === 'float') || (left === 'float' && right === 'phase')) {
    return 'phase';
  }

  // phase + int → phase (int coerced to float)
  if ((left === 'phase' && right === 'int') || (left === 'int' && right === 'phase')) {
    return 'phase';
  }

  // unit + anything → float (loses unit constraint)
  if (left === 'unit' || right === 'unit') {
    return 'float';
  }

  // Fallback to float for other numeric combinations
  if (isNumeric(left) && isNumeric(right)) {
    return 'float';
  }

  throw new Error(`Cannot unify types: ${left} and ${right}`);
}

/**
 * Unify two types (for ternary branches).
 * Returns common type or undefined if incompatible.
 */
function unifyTypes(left: PayloadType, right: PayloadType): PayloadType | undefined {
  // Same type
  if (left === right) return left;

  // int + float → float
  if ((left === 'int' && right === 'float') || (left === 'float' && right === 'int')) {
    return 'float';
  }

  // phase + float → phase
  if ((left === 'phase' && right === 'float') || (left === 'float' && right === 'phase')) {
    return 'phase';
  }

  // unit + float → unit
  if ((left === 'unit' && right === 'float') || (left === 'float' && right === 'unit')) {
    return 'unit';
  }

  // Incompatible
  return undefined;
}

/**
 * Check if a type can be coerced to another type.
 */
function canCoerceTo(from: PayloadType, to: PayloadType): boolean {
  // Same type
  if (from === to) return true;

  // int → float (safe)
  if (from === 'int' && to === 'float') return true;

  // int → phase (safe, with wrap)
  if (from === 'int' && to === 'phase') return true;

  // int → unit (safe, with clamp)
  if (from === 'int' && to === 'unit') return true;

  // phase → float (allowed implicitly)
  if (from === 'phase' && to === 'float') return true;

  // unit → float (allowed implicitly)
  if (from === 'unit' && to === 'float') return true;

  return false;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert operator to verb for error messages.
 */
function opToVerb(op: string): string {
  switch (op) {
    case '+': return 'add';
    case '-': return 'subtract';
    case '*': return 'multiply';
    case '/': return 'divide';
    case '%': return 'modulo';
    default: return op;
  }
}

/**
 * Find closest string match using simple edit distance.
 */
function findClosestMatch(input: string, candidates: string[]): string | undefined {
  let bestMatch: string | undefined;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance && distance <= 2) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
