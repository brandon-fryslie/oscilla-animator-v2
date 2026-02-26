/**
 * Expression DSL IR Compiler
 *
 * Compiles typed AST to IR expressions using IRBuilder.
 * Maps AST nodes to IR primitives (constant, mapAuto, zipAuto, etc.).
 *
 * IR mapping reference: src/expr/FUNCTIONS.md
 */

import type { ExprNode } from './ast';
import type { BlockIRBuilder } from '../compiler/ir/BlockIRBuilder';
import type { ValueExprId } from '../compiler/ir/Indices';
import { OpCode } from '../compiler/ir/types';
import {
  canonicalType,
  canonicalConst,
  type PayloadType,
  type CanonicalType,
  type Extent,
  extentsEqual,
  requireInst,
  floatConst,
  intConst,
} from '../core/canonical-types';
import { FLOAT, INT, BOOL } from '../core/canonical-types';
import { isVectorType, swizzleResultType, componentIndex } from './swizzle';
import { resolveExpressionConstant } from './constants';

/**
 * Compilation context.
 * Maps identifier names to their IR value expressions.
 */
export interface CompileContext {
  readonly builder: BlockIRBuilder;
  readonly inputs: ReadonlyMap<string, ValueExprId>;
  /** Block reference values by shorthand name (optional - for member access support) */
  readonly blockRefs?: ReadonlyMap<string, ValueExprId>;
}

/**
 * Compile typed AST to IR.
 * Assumes AST is already type-checked (all nodes have `type` field).
 *
 * @param node Typed AST node
 * @param ctx Compilation context
 * @returns IR value expression ID
 */
export function compile(node: ExprNode, ctx: CompileContext): ValueExprId {
  // All nodes must be typed at this point
  if (!node.type) {
    throw new Error(`Cannot compile untyped AST node: ${node.kind}`);
  }

  switch (node.kind) {
    case 'literal':
      return compileLiteral(node, ctx);

    case 'identifier':
      return compileIdentifier(node, ctx);

    case 'unary':
      return compileUnary(node, ctx);

    case 'binary':
      return compileBinary(node, ctx);

    case 'ternary':
      return compileTernary(node, ctx);

    case 'call':
      return compileCall(node, ctx);

    case 'member':
      return compileMemberAccess(node, ctx);

    default:
      const _exhaustive: never = node;
      throw new Error(`Unknown node kind: ${_exhaustive}`);
  }
}

/**
 * Compile literal node to constant expression.
 */
function compileLiteral(node: ExprNode & { kind: 'literal' }, ctx: CompileContext): ValueExprId {
  // [LAW:one-source-of-truth] Literal values are cardinality-zero constants in IR.
  const type = canonicalConst(node.type as PayloadType);

  // Create the correct ConstValue based on the node's payload type
  let constValue;
  if ((node.type as PayloadType).kind === 'int') {
    constValue = intConst(node.value);
  } else if ((node.type as PayloadType).kind === 'bool') {
    constValue = intConst(node.value); // bool is 0 or 1
  } else {
    // float or other numeric types default to float
    constValue = floatConst(node.value);
  }

  return ctx.builder.constant(constValue, type);
}

/**
 * Compile identifier node to input expression reference.
 */
function compileIdentifier(node: ExprNode & { kind: 'identifier' }, ctx: CompileContext): ValueExprId {
  const inputExpr = ctx.inputs.get(node.name);
  if (inputExpr !== undefined) {
    return inputExpr;
  }

  const constant = resolveExpressionConstant(node.name);
  if (constant) {
    return ctx.builder.constant(floatConst(constant.value), canonicalConst(FLOAT));
  }

  throw new Error(`Undefined identifier '${node.name}' during compilation (should have been caught by type checker)`);
}

/**
 * Compile unary operator node.
 */
function compileUnary(node: ExprNode & { kind: 'unary' }, ctx: CompileContext): ValueExprId {
  const arg = compile(node.arg, ctx);
  const argType = getExprType(ctx, arg);
  const type = withExtent(node.type as PayloadType, argType.extent);

  switch (node.op) {
    case '!': {
      // Logical NOT: Use comparison to false (0)
      const zero = ctx.builder.constant(intConst(0), canonicalConst(INT));
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.zipAuto([arg, zero], eqFn, type);
    }

    case '-': {
      // Negation: Use Neg opcode
      const negFn = ctx.builder.opcode(OpCode.Neg);
      return ctx.builder.mapAuto(arg, negFn, type);
    }

    case '+': {
      // Unary plus: No-op, return argument
      return arg;
    }

    default:
      const _exhaustive: never = node.op;
      throw new Error(`Unknown unary operator: ${_exhaustive}`);
  }
}

/**
 * Compile binary operator node.
 */
function compileBinary(node: ExprNode & { kind: 'binary' }, ctx: CompileContext): ValueExprId {
  const left = compile(node.left, ctx);
  const right = compile(node.right, ctx);
  const outExtent = zipOutputExtent(ctx, [left, right], `operator '${node.op}'`);
  const type = withExtent(node.type as PayloadType, outExtent);
  const boolType = withExtent(BOOL, outExtent);

  // Handle operators that need synthesis
  switch (node.op) {
    // Direct OpCode mappings
    case '+':
    case '-':
    case '*':
    case '/':
    case '%':
    case '<':
    case '>':
    case '==': {
      const opcode = binaryOpToOpCode(node.op);
      const opFn = ctx.builder.opcode(opcode);
      return ctx.builder.zipAuto([left, right], opFn, type);
    }

    // Synthesized operators
    case '<=': {
      // a <= b → !(a > b)
      const gtFn = ctx.builder.opcode(OpCode.Gt);
      const gt = ctx.builder.zipAuto([left, right], gtFn, boolType);
      const zero = ctx.builder.constant(intConst(0), canonicalConst(INT));
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.zipAuto([gt, zero], eqFn, type);
    }

    case '>=': {
      // a >= b → !(a < b)
      const ltFn = ctx.builder.opcode(OpCode.Lt);
      const lt = ctx.builder.zipAuto([left, right], ltFn, boolType);
      const zero = ctx.builder.constant(intConst(0), canonicalConst(INT));
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.zipAuto([lt, zero], eqFn, type);
    }

    case '!=': {
      // a != b → !(a == b)
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      const eq = ctx.builder.zipAuto([left, right], eqFn, boolType);
      const zero = ctx.builder.constant(intConst(0), canonicalConst(INT));
      const eqZeroFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.zipAuto([eq, zero], eqZeroFn, type);
    }

    case '&&': {
      // a && b → a * b (since bool is 0 or 1)
      const mulFn = ctx.builder.opcode(OpCode.Mul);
      return ctx.builder.zipAuto([left, right], mulFn, type);
    }

    case '||': {
      // a || b → min(a + b, 1)
      const addFn = ctx.builder.opcode(OpCode.Add);
      const intOutType = withExtent(INT, outExtent);
      const sum = ctx.builder.zipAuto([left, right], addFn, intOutType);
      const one = ctx.builder.constant(intConst(1), canonicalConst(INT));
      const minFn = ctx.builder.opcode(OpCode.Min);
      return ctx.builder.zipAuto([sum, one], minFn, type);
    }

    default:
      const _exhaustive: never = node.op;
      throw new Error(`Unknown binary operator: ${_exhaustive}`);
  }
}

/**
 * Compile ternary conditional node.
 * Ternary: cond ? then : else
 * IR: Synthesized using multiplication and addition:
 *   result = cond * then + (1 - cond) * else
 *
 * This works because cond is bool (0 or 1 after comparison).
 */
function compileTernary(node: ExprNode & { kind: 'ternary' }, ctx: CompileContext): ValueExprId {
  const cond = compile(node.cond, ctx);
  const thenBranch = compile(node.then, ctx);
  const elseBranch = compile(node.else, ctx);
  const outExtent = zipOutputExtent(ctx, [cond, thenBranch, elseBranch], 'ternary');
  const type = withExtent(node.type as PayloadType, outExtent);
  // [LAW:dataflow-not-control-flow] Lower ternary as data-select (no control-flow branching).
  return ctx.builder.zipAuto([cond, thenBranch, elseBranch], ctx.builder.opcode(OpCode.Select), type);
}

/**
 * Compile function call node.
 */
function compileCall(node: ExprNode & { kind: 'call' }, ctx: CompileContext): ValueExprId {
  const args = node.args.map(arg => compile(arg, ctx));

  // Map function name to implementation
  switch (node.fn) {
    // Trigonometric
    case 'sin': {
      const fn = ctx.builder.opcode(OpCode.Sin);
      const type = withExtent(node.type as PayloadType, getExprType(ctx, args[0]).extent);
      return ctx.builder.mapAuto(args[0], fn, type);
    }

    case 'cos': {
      const fn = ctx.builder.opcode(OpCode.Cos);
      const type = withExtent(node.type as PayloadType, getExprType(ctx, args[0]).extent);
      return ctx.builder.mapAuto(args[0], fn, type);
    }

    case 'tan': {
      const fn = ctx.builder.opcode(OpCode.Tan);
      const type = withExtent(node.type as PayloadType, getExprType(ctx, args[0]).extent);
      return ctx.builder.mapAuto(args[0], fn, type);
    }

    // Unary functions
    case 'abs': {
      const fn = ctx.builder.opcode(OpCode.Abs);
      const type = withExtent(node.type as PayloadType, getExprType(ctx, args[0]).extent);
      return ctx.builder.mapAuto(args[0], fn, type);
    }

    case 'sqrt': {
      const fn = ctx.builder.opcode(OpCode.Sqrt);
      const type = withExtent(node.type as PayloadType, getExprType(ctx, args[0]).extent);
      return ctx.builder.mapAuto(args[0], fn, type);
    }

    case 'floor': {
      const fn = ctx.builder.opcode(OpCode.Floor);
      const type = withExtent(node.type as PayloadType, getExprType(ctx, args[0]).extent);
      return ctx.builder.mapAuto(args[0], fn, type);
    }

    case 'ceil': {
      const fn = ctx.builder.opcode(OpCode.Ceil);
      const type = withExtent(node.type as PayloadType, getExprType(ctx, args[0]).extent);
      return ctx.builder.mapAuto(args[0], fn, type);
    }

    case 'round': {
      const fn = ctx.builder.opcode(OpCode.Round);
      const type = withExtent(node.type as PayloadType, getExprType(ctx, args[0]).extent);
      return ctx.builder.mapAuto(args[0], fn, type);
    }

    // Binary functions
    case 'min': {
      const fn = ctx.builder.opcode(OpCode.Min);
      const type = withExtent(node.type as PayloadType, zipOutputExtent(ctx, args, `function '${node.fn}'`));
      return ctx.builder.zipAuto(args, fn, type);
    }

    case 'max': {
      const fn = ctx.builder.opcode(OpCode.Max);
      const type = withExtent(node.type as PayloadType, zipOutputExtent(ctx, args, `function '${node.fn}'`));
      return ctx.builder.zipAuto(args, fn, type);
    }

    // Interpolation functions
    case 'lerp':
    case 'mix': {
      const fn = ctx.builder.opcode(OpCode.Lerp);
      const type = withExtent(node.type as PayloadType, zipOutputExtent(ctx, args, `function '${node.fn}'`));
      return ctx.builder.zipAuto(args, fn, type);
    }

    case 'smoothstep': {
      // Synthesize: t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t)
      // For simplicity, use kernel 'smoothstep'
      const fn = ctx.builder.kernel('smoothstep');
      const type = withExtent(node.type as PayloadType, zipOutputExtent(ctx, args, `function '${node.fn}'`));
      return ctx.builder.zipAuto(args, fn, type);
    }

    case 'clamp': {
      const fn = ctx.builder.opcode(OpCode.Clamp);
      const type = withExtent(node.type as PayloadType, zipOutputExtent(ctx, args, `function '${node.fn}'`));
      return ctx.builder.zipAuto(args, fn, type);
    }

    // Phase functions
    case 'wrap': {
      const fn = ctx.builder.opcode(OpCode.Wrap01);
      const type = withExtent(node.type as PayloadType, getExprType(ctx, args[0]).extent);
      return ctx.builder.mapAuto(args[0], fn, type);
    }

    case 'fract': {
      const fn = ctx.builder.opcode(OpCode.Wrap01);
      const type = withExtent(node.type as PayloadType, getExprType(ctx, args[0]).extent);
      return ctx.builder.mapAuto(args[0], fn, type);
    }

    case 'mapField': {
      if (args.length !== 2) {
        throw new Error(`Function 'mapField' expects 2 arguments, got ${args.length}`);
      }
      const valueId = args[0];
      const overId = args[1];
      const overType = getExprType(ctx, overId);
      const overCard = requireInst(overType.extent.cardinality, 'cardinality');
      if (overCard.kind !== 'many') {
        throw new Error(`Function 'mapField' requires second argument to be many-cardinality`);
      }
      const valueType = getExprType(ctx, valueId);
      const outType = withExtent(node.type as PayloadType, overType.extent);
      const valueCard = requireInst(valueType.extent.cardinality, 'cardinality');

      if (valueCard.kind === 'many') {
        assertExtentCompatible(overType.extent, valueType.extent, "function 'mapField'");
        return valueId;
      }

      return ctx.builder.broadcast(valueId, outType);
    }

    // Vector constructors
    case 'vec2':
    case 'vec3':
    case 'vec4': {
      const type = withExtent(node.type as PayloadType, zipOutputExtent(ctx, args, `function '${node.fn}'`));
      return ctx.builder.constructAuto(args, type);
    }

    default:
      throw new Error(`Unknown function '${node.fn}' during compilation (should have been caught by type checker)`);
  }
}

/**
 * Compile member access node (component access or block output reference).
 */
function compileMemberAccess(node: ExprNode & { kind: 'member' }, ctx: CompileContext): ValueExprId {
  // Handle block output refs first; object identifier may not be in ctx.inputs.
  if (
    node.object.kind === 'identifier'
    && !ctx.inputs.has(node.object.name)
    && ctx.blockRefs
  ) {
    const blockName = node.object.name;
    const portName = node.member;
    const shorthand = `${blockName}.${portName}`;
    const sigId = ctx.blockRefs.get(shorthand);
    if (sigId === undefined) {
      throw new Error(`Block reference ${shorthand} not found in context - internal error (should have been caught by type checker)`);
    }
    return sigId;
  }

  // Type is already validated by type checker
  const objectSig = compile(node.object, ctx);
  const objectType = node.object.type!;
  const objectExprType = getExprType(ctx, objectSig);

  // Case 1: Component access on vector type
  if (isVectorType(objectType)) {
    const pattern = node.member;
    const resultType = withExtent(swizzleResultType(pattern, objectType), objectExprType.extent);

    if (pattern.length === 1) {
      // Single component extraction: extract(input, componentIndex, resultType)
      const idx = componentIndex(pattern);
      return ctx.builder.extract(objectSig, idx, resultType);
    } else {
      // Multi-component swizzle: extract each component and construct result
      const componentSigs: ValueExprId[] = [];
      for (const char of pattern) {
        const idx = componentIndex(char);
        const componentSig = ctx.builder.extract(objectSig, idx, withExtent(FLOAT, objectExprType.extent));
        componentSigs.push(componentSig);
      }

      // Combine components into result vector using construct
      return ctx.builder.constructAuto(componentSigs, resultType);
    }
  }

  // Case 2: Block output reference (existing logic)
  if (node.object.kind === 'identifier' && ctx.inputs.has(node.object.name)) {
    throw new Error(`Cannot access member '${node.member}' on typed input '${node.object.name}'`);
  }

  if (!ctx.blockRefs) {
    throw new Error('Block references not available - internal error (should have been caught by type checker)');
  }

  if (node.object.kind !== 'identifier') {
    throw new Error('Invalid member access object - should have been caught by type checker');
  }

  const blockName = node.object.name;
  const portName = node.member;
  const shorthand = `${blockName}.${portName}`;

  const sigId = ctx.blockRefs.get(shorthand);
  if (sigId === undefined) {
    throw new Error(`Block reference ${shorthand} not found in context - internal error (should have been caught by type checker)`);
  }

  return sigId;
}

// =============================================================================
// Operator Mapping
// =============================================================================

/**
 * Map binary operator to OpCode (for direct mappings only).
 */
function binaryOpToOpCode(op: string): OpCode {
  switch (op) {
    // Arithmetic
    case '+': return OpCode.Add;
    case '-': return OpCode.Sub;
    case '*': return OpCode.Mul;
    case '/': return OpCode.Div;
    case '%': return OpCode.Mod;

    // Comparison
    case '<': return OpCode.Lt;
    case '>': return OpCode.Gt;
    case '==': return OpCode.Eq;

    default:
      throw new Error(`Operator ${op} has no direct OpCode mapping`);
  }
}

// =============================================================================
// Type/Extent Helpers
// =============================================================================

function getExprType(ctx: CompileContext, id: ValueExprId): CanonicalType {
  const expr = ctx.builder.getValueExpr(id) as { type?: CanonicalType } | undefined;
  if (!expr?.type) {
    throw new Error(`Value expression ${id} has no type (compiler bug)`);
  }
  return expr.type;
}

function withExtent(payload: PayloadType, extent: Extent): CanonicalType {
  return canonicalType(payload, undefined, extent);
}

function zipOutputExtent(ctx: CompileContext, inputs: readonly ValueExprId[], opName: string): Extent {
  if (inputs.length === 0) {
    throw new Error(`Cannot resolve output extent for ${opName}: no inputs`);
  }

  const inputTypes = inputs.map((id) => getExprType(ctx, id));
  const manyTypes = inputTypes.filter((t) => requireInst(t.extent.cardinality, 'cardinality').kind === 'many');
  if (manyTypes.length > 0) {
    const base = manyTypes[0].extent;
    for (const t of inputTypes.slice(1)) {
      assertExtentCompatible(base, t.extent, opName);
    }
    return base;
  }

  const oneType = inputTypes.find((t) => requireInst(t.extent.cardinality, 'cardinality').kind === 'one');
  if (oneType) {
    const base = oneType.extent;
    for (const t of inputTypes) {
      assertExtentCompatible(base, t.extent, opName);
    }
    return base;
  }

  return inputTypes[0].extent;
}

function assertExtentCompatible(base: Extent, other: Extent, opName: string): void {
  const baseCard = requireInst(base.cardinality, 'cardinality').kind;
  const otherCard = requireInst(other.cardinality, 'cardinality').kind;

  if (baseCard === 'many' && otherCard === 'many' && !extentsEqual(base, other)) {
    throw new Error(`Incompatible field extents in ${opName}: many inputs must share instance context`);
  }

  // [LAW:dataflow-not-control-flow] For mixed one/zero/many inputs, use one compatibility rule:
  // non-cardinality extent axes must match; cardinality is resolved by zip/map semantics.
  if (!extentAxesMatchExcludingCardinality(base, other)) {
    throw new Error(`Incompatible extents in ${opName}: temporality/binding/perspective/branch mismatch`);
  }
}

function extentAxesMatchExcludingCardinality(a: Extent, b: Extent): boolean {
  return (
    JSON.stringify(a.temporality) === JSON.stringify(b.temporality)
    && JSON.stringify(a.binding) === JSON.stringify(b.binding)
    && JSON.stringify(a.perspective) === JSON.stringify(b.perspective)
    && JSON.stringify(a.branch) === JSON.stringify(b.branch)
  );
}
