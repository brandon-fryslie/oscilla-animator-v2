/**
 * Expression DSL IR Compiler
 *
 * Compiles typed AST to IR expressions using IRBuilder.
 * Maps AST nodes to IR primitives (sigConst, sigMap, sigZip, etc.).
 *
 * IR mapping reference: src/expr/FUNCTIONS.md
 */

import type { ExprNode } from './ast';
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import type { SigExprId } from '../compiler/ir/types';
import { OpCode } from '../compiler/ir/types';
import { signalType, type PayloadType } from '../core/canonical-types';

/**
 * Compilation context.
 * Maps identifier names to their IR signal expressions.
 */
export interface CompileContext {
  readonly builder: IRBuilder;
  readonly inputs: ReadonlyMap<string, SigExprId>;
}

/**
 * Compile typed AST to IR.
 * Assumes AST is already type-checked (all nodes have `type` field).
 *
 * @param node Typed AST node
 * @param ctx Compilation context
 * @returns IR signal expression ID
 */
export function compile(node: ExprNode, ctx: CompileContext): SigExprId {
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

    default:
      const _exhaustive: never = node;
      throw new Error(`Unknown node kind: ${(_exhaustive as any).kind}`);
  }
}

/**
 * Compile literal node to constant signal.
 */
function compileLiteral(node: ExprNode & { kind: 'literal' }, ctx: CompileContext): SigExprId {
  const type = signalType(node.type as PayloadType);
  return ctx.builder.sigConst(node.value, type);
}

/**
 * Compile identifier node to input signal reference.
 */
function compileIdentifier(node: ExprNode & { kind: 'identifier' }, ctx: CompileContext): SigExprId {
  const sigId = ctx.inputs.get(node.name);
  if (!sigId) {
    throw new Error(`Undefined input '${node.name}' during compilation (should have been caught by type checker)`);
  }
  return sigId;
}

/**
 * Compile unary operator node.
 */
function compileUnary(node: ExprNode & { kind: 'unary' }, ctx: CompileContext): SigExprId {
  const arg = compile(node.arg, ctx);
  const type = signalType(node.type as PayloadType);

  switch (node.op) {
    case '!': {
      // Logical NOT: Use comparison to false (0)
      const zero = ctx.builder.sigConst(0, signalType('int'));
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.sigZip([arg, zero], eqFn, type);
    }

    case '-': {
      // Negation: Use Neg opcode
      const negFn = ctx.builder.opcode(OpCode.Neg);
      return ctx.builder.sigMap(arg, negFn, type);
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
function compileBinary(node: ExprNode & { kind: 'binary' }, ctx: CompileContext): SigExprId {
  const left = compile(node.left, ctx);
  const right = compile(node.right, ctx);
  const type = signalType(node.type as PayloadType);

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
      return ctx.builder.sigZip([left, right], opFn, type);
    }

    // Synthesized operators
    case '<=': {
      // a <= b → !(a > b)
      const gtFn = ctx.builder.opcode(OpCode.Gt);
      const gt = ctx.builder.sigZip([left, right], gtFn, signalType('bool'));
      const zero = ctx.builder.sigConst(0, signalType('int'));
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.sigZip([gt, zero], eqFn, type);
    }

    case '>=': {
      // a >= b → !(a < b)
      const ltFn = ctx.builder.opcode(OpCode.Lt);
      const lt = ctx.builder.sigZip([left, right], ltFn, signalType('bool'));
      const zero = ctx.builder.sigConst(0, signalType('int'));
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.sigZip([lt, zero], eqFn, type);
    }

    case '!=': {
      // a != b → !(a == b)
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      const eq = ctx.builder.sigZip([left, right], eqFn, signalType('bool'));
      const zero = ctx.builder.sigConst(0, signalType('int'));
      const eqZeroFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.sigZip([eq, zero], eqZeroFn, type);
    }

    case '&&': {
      // a && b → a * b (since bool is 0 or 1)
      const mulFn = ctx.builder.opcode(OpCode.Mul);
      return ctx.builder.sigZip([left, right], mulFn, type);
    }

    case '||': {
      // a || b → min(a + b, 1)
      const addFn = ctx.builder.opcode(OpCode.Add);
      const sum = ctx.builder.sigZip([left, right], addFn, signalType('int'));
      const one = ctx.builder.sigConst(1, signalType('int'));
      const minFn = ctx.builder.opcode(OpCode.Min);
      return ctx.builder.sigZip([sum, one], minFn, type);
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
function compileTernary(node: ExprNode & { kind: 'ternary' }, ctx: CompileContext): SigExprId {
  const cond = compile(node.cond, ctx);
  const thenBranch = compile(node.then, ctx);
  const elseBranch = compile(node.else, ctx);
  const type = signalType(node.type as PayloadType);

  // cond * then
  const mulFn = ctx.builder.opcode(OpCode.Mul);
  const condThen = ctx.builder.sigZip([cond, thenBranch], mulFn, type);

  // 1 - cond
  const one = ctx.builder.sigConst(1, signalType('int'));
  const subFn = ctx.builder.opcode(OpCode.Sub);
  const oneMinusCond = ctx.builder.sigZip([one, cond], subFn, signalType('int'));

  // (1 - cond) * else
  const condElse = ctx.builder.sigZip([oneMinusCond, elseBranch], mulFn, type);

  // result = condThen + condElse
  const addFn = ctx.builder.opcode(OpCode.Add);
  return ctx.builder.sigZip([condThen, condElse], addFn, type);
}

/**
 * Compile function call node.
 */
function compileCall(node: ExprNode & { kind: 'call' }, ctx: CompileContext): SigExprId {
  const args = node.args.map(arg => compile(arg, ctx));
  const type = signalType(node.type as PayloadType);

  // Map function name to implementation
  switch (node.fn) {
    // Trigonometric
    case 'sin': {
      const fn = ctx.builder.opcode(OpCode.Sin);
      return ctx.builder.sigMap(args[0], fn, type);
    }

    case 'cos': {
      const fn = ctx.builder.opcode(OpCode.Cos);
      return ctx.builder.sigMap(args[0], fn, type);
    }

    case 'tan': {
      const fn = ctx.builder.opcode(OpCode.Tan);
      return ctx.builder.sigMap(args[0], fn, type);
    }

    // Unary functions
    case 'abs': {
      const fn = ctx.builder.opcode(OpCode.Abs);
      return ctx.builder.sigMap(args[0], fn, type);
    }

    case 'sqrt': {
      // Synthesize: x ** 0.5
      // For now, use a simple approximation or require Sqrt opcode
      // Since OpCode doesn't have Sqrt, we'll use kernel 'sqrt'
      const fn = ctx.builder.kernel('sqrt');
      return ctx.builder.sigMap(args[0], fn, type);
    }

    case 'floor': {
      // Floor opcode doesn't exist in current OpCode enum
      // Use kernel 'floor'
      const fn = ctx.builder.kernel('floor');
      return ctx.builder.sigMap(args[0], fn, type);
    }

    case 'ceil': {
      const fn = ctx.builder.kernel('ceil');
      return ctx.builder.sigMap(args[0], fn, type);
    }

    case 'round': {
      const fn = ctx.builder.kernel('round');
      return ctx.builder.sigMap(args[0], fn, type);
    }

    // Binary functions
    case 'min': {
      const fn = ctx.builder.opcode(OpCode.Min);
      return ctx.builder.sigZip(args, fn, type);
    }

    case 'max': {
      const fn = ctx.builder.opcode(OpCode.Max);
      return ctx.builder.sigZip(args, fn, type);
    }

    // Interpolation functions
    case 'lerp':
    case 'mix': {
      const fn = ctx.builder.opcode(OpCode.Lerp);
      return ctx.builder.sigZip(args, fn, type);
    }

    case 'smoothstep': {
      // Synthesize: t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t)
      // For simplicity, use kernel 'smoothstep'
      const fn = ctx.builder.kernel('smoothstep');
      return ctx.builder.sigZip(args, fn, type);
    }

    case 'clamp': {
      const fn = ctx.builder.opcode(OpCode.Clamp);
      return ctx.builder.sigZip(args, fn, type);
    }

    // Phase functions
    case 'wrap': {
      const fn = ctx.builder.opcode(OpCode.Wrap01);
      return ctx.builder.sigMap(args[0], fn, type);
    }

    case 'fract': {
      const fn = ctx.builder.opcode(OpCode.Wrap01);
      return ctx.builder.sigMap(args[0], fn, type);
    }

    default:
      throw new Error(`Unknown function '${node.fn}' during compilation (should have been caught by type checker)`);
  }
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
