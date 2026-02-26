/**
 * Expression DSL Type Checker
 *
 * Performs bottom-up type inference and validation.
 * Annotates AST nodes with inferred types.
 *
 * Type rules reference: .agent_planning/expression-dsl/TYPE-RULES.md
 * Function signatures: src/expr/FUNCTIONS.md
 *
 * Note: 'phase' and 'unit' are no longer PayloadTypes. They are 'float' with
 * unit annotations (handled by the canonical type system, not the expression DSL).
 * The expression DSL only deals with PayloadType.
 */

import type { ExprNode, Position } from './ast';
import { withType } from './ast';
import type { PayloadType } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, VEC4 } from '../core/canonical-types';
import { isVectorType, validateSwizzle, swizzleResultType } from './swizzle';
import { getExpressionConstants, resolveExpressionConstant } from './constants';


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
 * Block reference context for resolving member access expressions.
 *
 * When provided, enables block output references (e.g., Circle1.radius).
 * When absent, member access expressions produce type errors.
 */
export interface BlockReferenceContext {
  /** Resolved payload type by shorthand (e.g. "osc.out"). */
  readonly typesByName: ReadonlyMap<string, PayloadType>;
}

/**
 * Type checking context.
 */
export interface TypeCheckContext {
  /** Input variables (from expression inputs) */
  readonly inputs: TypeEnv;
  /** Block reference context (optional - enables member access) */
  readonly blockRefs?: BlockReferenceContext;
}


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
 *
 * Note: wrap() now returns 'float' (not 'phase'). The unit system handles
 * the semantic distinction between phase and float.
 */
const FUNCTION_SIGNATURES: Record<string, FunctionSignature> = {
  // Trigonometric
  sin: { params: [FLOAT], returnType: FLOAT },
  cos: { params: [FLOAT], returnType: FLOAT },
  tan: { params: [FLOAT], returnType: FLOAT },

  // Unary
  abs: { params: [FLOAT], returnType: FLOAT, polymorphic: true },
  sqrt: { params: [FLOAT], returnType: FLOAT },
  floor: { params: [FLOAT], returnType: INT },
  ceil: { params: [FLOAT], returnType: INT },
  round: { params: [FLOAT], returnType: INT },

  // Binary
  min: { params: [FLOAT, FLOAT], returnType: FLOAT, polymorphic: true },
  max: { params: [FLOAT, FLOAT], returnType: FLOAT, polymorphic: true },

  // Interpolation
  lerp: { params: [FLOAT, FLOAT, FLOAT], returnType: FLOAT },
  mix: { params: [FLOAT, FLOAT, FLOAT], returnType: FLOAT }, // Alias
  smoothstep: { params: [FLOAT, FLOAT, FLOAT], returnType: FLOAT },
  clamp: { params: [FLOAT, FLOAT, FLOAT], returnType: FLOAT },

  // Phase (now returns float - unit annotation happens at higher level)
  wrap: { params: [FLOAT], returnType: FLOAT },
  fract: { params: [FLOAT], returnType: FLOAT },

  // Constructors
  vec2: { params: [FLOAT, FLOAT], returnType: VEC2 },
  vec3: { params: [FLOAT, FLOAT, FLOAT], returnType: VEC3 },
  vec4: { params: [FLOAT, FLOAT, FLOAT, FLOAT], returnType: VEC4 },

  // Field operators (validated with custom rule in typecheckCall)
  mapField: { params: [FLOAT, FLOAT], returnType: FLOAT },
};

/**
 * Type check expression and return annotated AST.
 * @param node AST node to type check
 * @param ctx Type checking context
 * @returns Annotated AST node with type information
 * @throws TypeError if type checking fails
 */
export function typecheck(node: ExprNode, ctx: TypeCheckContext): ExprNode {
  switch (node.kind) {
    case 'literal':
      return typecheckLiteral(node);

    case 'identifier':
      return typecheckIdentifier(node, ctx);

    case 'unary':
      return typecheckUnary(node, ctx);

    case 'binary':
      return typecheckBinary(node, ctx);

    case 'ternary':
      return typecheckTernary(node, ctx);

    case 'call':
      return typecheckCall(node, ctx);

    case 'member':
      return typecheckMemberAccess(node, ctx);

    default:
      const _exhaustive: never = node;
      throw new Error(`Unknown node kind: ${_exhaustive}`);
  }
}

/**
 * Type check literal node.
 * Uses the `raw` field to determine if literal was originally int or float.
 */
function typecheckLiteral(node: ExprNode & { kind: 'literal' }): ExprNode {
  // Check raw token string for decimal point
  const hasDecimalPoint = node.raw.includes('.');
  const type: PayloadType = hasDecimalPoint ? FLOAT : INT;
  return withType(node, type);
}

/**
 * Type check identifier node.
 */
function typecheckIdentifier(node: ExprNode & { kind: 'identifier' }, ctx: TypeCheckContext): ExprNode {
  const inputType = ctx.inputs.get(node.name);
  if (inputType) {
    return withType(node, inputType);
  }

  const constant = resolveExpressionConstant(node.name);
  if (constant) {
    return withType(node, constant.type);
  }

  const availableInputs = Array.from(ctx.inputs.keys());
  const availableConstants = getExpressionConstants().map((entry) => entry.name);
  const availableIdentifiers = [...availableInputs, ...availableConstants];
  const available = availableIdentifiers.length > 0 ? availableIdentifiers.join(', ') : '(none)';
  const suggestion = findClosestMatch(node.name, availableIdentifiers);
  throw new TypeError(
    `Undefined identifier '${node.name}'. Available identifiers: ${available}${suggestion ? `. Did you mean '${suggestion}'?` : ''}`,
    node.pos
  );
}

/**
 * Type check unary operator node.
 */
function typecheckUnary(node: ExprNode & { kind: 'unary' }, ctx: TypeCheckContext): ExprNode {
  const arg = typecheck(node.arg, ctx);
  const argType = arg.type!;

  switch (node.op) {
    case '!': {
      // Logical NOT requires bool
      if (argType.kind !== 'bool') {
        throw new TypeError(
          `Logical NOT requires bool operand, got ${argType}`,
          node.pos,
          [BOOL],
          argType,
          argType.kind === 'float' || argType.kind === 'int' ? 'Use comparison operators (>, <, ==, !=) to get bool' : undefined
        );
      }
      return withType({ ...node, arg }, BOOL);
    }

    case '-': {
      // Negation: numeric types only
      if (!isArithmeticType(argType)) {
        throw new TypeError(
          `Unary negation requires scalar/vector numeric operand, got ${argType}`,
          node.pos,
          [INT, FLOAT, VEC2, VEC3, VEC4],
          argType
        );
      }
      return withType({ ...node, arg }, argType);
    }

    case '+': {
      // Unary plus: numeric types only, no-op
      if (!isArithmeticType(argType)) {
        throw new TypeError(
          `Unary plus requires scalar/vector numeric operand, got ${argType}`,
          node.pos,
          [INT, FLOAT, VEC2, VEC3, VEC4],
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
function typecheckBinary(node: ExprNode & { kind: 'binary' }, ctx: TypeCheckContext): ExprNode {
  const left = typecheck(node.left, ctx);
  const right = typecheck(node.right, ctx);
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
  const resultType = unifyArithmetic(leftType, rightType);
  if (!resultType) {
    throw new TypeError(
      `Arithmetic operator '${node.op}' requires compatible scalar/vector numeric operands, got ${leftType} ${node.op} ${rightType}`,
      node.pos
    );
  }

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
    if (!isScalarNumeric(leftType) || !isScalarNumeric(rightType)) {
      throw new TypeError(
        `Comparison operator '${node.op}' requires scalar numeric operands, got ${leftType} ${node.op} ${rightType}`,
        node.pos
      );
    }
  }

  // Equality comparisons (==, !=) allow bool or numeric
  if (node.op === '==' || node.op === '!=') {
    if (isVectorType(leftType) || isVectorType(rightType)) {
      throw new TypeError(
        `Equality operators do not support vectors in expressions. Compare components explicitly.`,
        node.pos
      );
    }
    if (leftType.kind === 'bool' && rightType.kind !== 'bool') {
      throw new TypeError(
        `Cannot compare ${leftType} with ${rightType}`,
        node.pos
      );
    }
    if (leftType.kind !== 'bool' && rightType.kind === 'bool') {
      throw new TypeError(
        `Cannot compare ${leftType} with ${rightType}`,
        node.pos
      );
    }
  }

  return withType({ ...node, left, right }, BOOL);
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
  if (leftType.kind !== 'bool') {
    throw new TypeError(
      `Logical ${node.op === '&&' ? 'AND' : 'OR'} requires bool operands. Left operand is ${leftType}.`,
      node.pos,
      [BOOL],
      leftType,
      leftType.kind === 'float' || leftType.kind === 'int' ? `Did you mean '... > 0 ${node.op} ...'?` : undefined
    );
  }
  if (rightType.kind !== 'bool') {
    throw new TypeError(
      `Logical ${node.op === '&&' ? 'AND' : 'OR'} requires bool operands. Right operand is ${rightType}.`,
      node.pos,
      [BOOL],
      rightType,
      rightType.kind === 'float' || rightType.kind === 'int' ? `Did you mean '... ${node.op} ... > 0'?` : undefined
    );
  }

  return withType({ ...node, left, right }, BOOL);
}

/**
 * Type check ternary conditional node.
 */
function typecheckTernary(node: ExprNode & { kind: 'ternary' }, ctx: TypeCheckContext): ExprNode {
  const cond = typecheck(node.cond, ctx);
  const thenBranch = typecheck(node.then, ctx);
  const elseBranch = typecheck(node.else, ctx);

  const condType = cond.type!;
  const thenType = thenBranch.type!;
  const elseType = elseBranch.type!;

  // Condition must be bool
  if (condType.kind !== 'bool') {
    throw new TypeError(
      `Ternary condition must be bool, got ${condType}`,
      cond.pos,
      [BOOL],
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
function typecheckCall(node: ExprNode & { kind: 'call' }, ctx: TypeCheckContext): ExprNode {
  if (node.fn === 'mapField') {
    if (node.args.length !== 2) {
      throw new TypeError(
        `Function 'mapField' expects 2 arguments, got ${node.args.length}`,
        node.pos
      );
    }
    const typedArgs = node.args.map(arg => typecheck(arg, ctx));
    const valueType = typedArgs[0].type!;
    if (!isArithmeticType(valueType)) {
      throw new TypeError(
        `Function 'mapField' expects a float/vec value argument, got ${valueType}`,
        typedArgs[0].pos
      );
    }
    return withType({ ...node, args: typedArgs }, valueType);
  }

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
  const typedArgs = node.args.map(arg => typecheck(arg, ctx));

  // Validate argument types
  for (let i = 0; i < typedArgs.length; i++) {
    const argType = typedArgs[i].type!;
    const paramType = signature.params[i];

    // Polymorphic functions (min, max, abs)
    if (signature.polymorphic && i === 0) {
      // First argument determines the type
      if (!isScalarNumeric(argType)) {
        throw new TypeError(
          `Function '${node.fn}' expects numeric type, got ${argType} for argument ${i + 1}`,
          typedArgs[i].pos,
          [INT, FLOAT],
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
    returnType = firstArgType.kind === 'int' ? INT : FLOAT;
  }

  return withType({ ...node, args: typedArgs }, returnType);
}

/**
 * Type check member access node (component access or block output reference).
 */
function typecheckMemberAccess(node: ExprNode & { kind: 'member' }, ctx: TypeCheckContext): ExprNode {
  // [LAW:dataflow-not-control-flow] Resolve member access by data category:
  // typed input vectors use swizzle semantics; unresolved identifiers use block refs.
  if (node.object.kind === 'identifier') {
    const directType = ctx.inputs.get(node.object.name);
    if (!directType && ctx.blockRefs) {
      return resolveBlockOutputReference(node, ctx);
    }
  }

  // First, type-check the object expression
  const typedObject = typecheck(node.object, ctx);
  const objectType = typedObject.type!;

  // Case 1: Component access on vector type (vec2, vec3, color)
  if (isVectorType(objectType)) {
    const error = validateSwizzle(node.member, objectType);
    if (error) {
      throw new TypeError(error, node.pos, undefined, undefined,
        objectType.kind === 'vec3' ? 'Valid components: x, y, z (or r, g, b)' :
        objectType.kind === 'color' ? 'Valid components: r, g, b, a (or x, y, z, w)' :
        objectType.kind === 'vec4' ? 'Valid components: x, y, z, w (or r, g, b, a)' :
        objectType.kind === 'vec2' ? 'Valid components: x, y (or r, g)' : undefined
      );
    }
    const resultType = swizzleResultType(node.member, objectType);
    return withType({ ...node, object: typedObject }, resultType);
  }

  // Case 2: Block output reference
  if (node.object.kind === 'identifier' && ctx.inputs.has(node.object.name)) {
    throw new TypeError(
      `Cannot access member '${node.member}' on type '${objectType.kind}'`,
      node.pos,
      undefined,
      undefined,
      objectType.kind === 'float' || objectType.kind === 'int'
        ? 'Scalar types do not have components'
        : undefined
    );
  }

  if (!ctx.blockRefs) {
    throw new TypeError(
      `Cannot access member '${node.member}' on type '${objectType.kind}' (not a vector type, and block references not available)`,
      node.pos,
      undefined,
      undefined,
      objectType.kind === 'float' || objectType.kind === 'int' ?
        'Scalar types do not have components. Did you mean a block reference?' : undefined
    );
  }

  // The object must be an identifier (block name)
  if (node.object.kind !== 'identifier') {
    throw new TypeError(
      'Block reference must be in the form BlockName.port (e.g., Circle1.radius)',
      node.object.pos,
      undefined,
      undefined,
      'Only simple block references are supported'
    );
  }

  return resolveBlockOutputReference(node, ctx);
}

// =============================================================================
// Type Unification and Coercion
// =============================================================================

/**
 * Check if a type is numeric.
 */
function isScalarNumeric(type: PayloadType): boolean {
  return type.kind === 'int' || type.kind === 'float';
}

function isArithmeticType(type: PayloadType): boolean {
  return isScalarNumeric(type) || isVectorType(type);
}

/**
 * Unify two numeric types (for arithmetic operations).
 * Returns most general type or throws if incompatible.
 */
function unifyNumeric(left: PayloadType, right: PayloadType): PayloadType {
  // int + int → int
  if (left.kind === 'int' && right.kind === 'int') return INT;

  // int + float → float (coerce int)
  if ((left.kind === 'int' && right.kind === 'float') || (left.kind === 'float' && right.kind === 'int')) {
    return FLOAT;
  }

  // float + float → float
  if (left.kind === 'float' && right.kind === 'float') return FLOAT;

  // Fallback to float for other numeric combinations
  if (isScalarNumeric(left) && isScalarNumeric(right)) {
    return FLOAT;
  }

  throw new Error(`Cannot unify types: ${left} and ${right}`);
}

/**
 * Unify arithmetic operands (scalar/vector component-wise semantics).
 *
 * Allowed:
 * - scalar op scalar -> scalar (int/float widening)
 * - vecN op vecN -> vecN
 * - vecN op scalar -> vecN
 * - scalar op vecN -> vecN
 */
function unifyArithmetic(left: PayloadType, right: PayloadType): PayloadType | undefined {
  if (isScalarNumeric(left) && isScalarNumeric(right)) {
    return unifyNumeric(left, right);
  }
  if (isVectorType(left) && isVectorType(right)) {
    return left.kind === right.kind ? left : undefined;
  }
  if (isVectorType(left) && isScalarNumeric(right)) {
    return left;
  }
  if (isScalarNumeric(left) && isVectorType(right)) {
    return right;
  }
  return undefined;
}

/**
 * Unify two types (for ternary branches).
 * Returns common type or undefined if incompatible.
 */
function unifyTypes(left: PayloadType, right: PayloadType): PayloadType | undefined {
  // Same type
  if (left === right) return left;

  // int + float → float
  if ((left.kind === 'int' && right.kind === 'float') || (left.kind === 'float' && right.kind === 'int')) {
    return FLOAT;
  }

  // Same vector kind
  if (isVectorType(left) && isVectorType(right) && left.kind === right.kind) {
    return left;
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
  if (from.kind === 'int' && to.kind === 'float') return true;

  return false;
}

function resolveBlockOutputReference(node: ExprNode & { kind: 'member' }, ctx: TypeCheckContext): ExprNode {
  if (!ctx.blockRefs || node.object.kind !== 'identifier') {
    throw new TypeError(
      'Block reference must be in the form BlockName.port',
      node.object.pos
    );
  }

  const shorthand = `${node.object.name}.${node.member}`;
  // [LAW:single-enforcer] Expression block collect inputs are the only source for ref name typing.
  const payload = ctx.blockRefs.typesByName.get(shorthand);
  if (payload === undefined) {
    throw new TypeError(
      `Unknown reference: ${shorthand}`,
      node.pos,
      undefined,
      undefined,
      `Check that "${node.object.name}" is connected to this block's refs port with output "${node.member}"`
    );
  }

  return withType(node, payload);
}

// =============================================================================
// Utility Functions
// =============================================================================

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
