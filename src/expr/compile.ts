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
import { canonicalType, type PayloadType, floatConst, intConst, boolConst } from '../core/canonical-types';
import { FLOAT, INT, BOOL } from '../core/canonical-types';
import { isVectorType, componentIndex, swizzleResultType } from './swizzle';

/**
 * Compilation context.
 * Maps identifier names to their IR signal expressions.
 */
export interface CompileContext {
  readonly builder: IRBuilder;
  readonly inputs: ReadonlyMap<string, SigExprId>;
  /** Block reference signals by canonical address (optional - for member access support) */
  readonly blockRefs?: ReadonlyMap<string, SigExprId>;
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

    case 'member':
      return compileMemberAccess(node, ctx);

    default:
      const _exhaustive: never = node;
      throw new Error(`Unknown node kind: ${_exhaustive}`);
  }
}

/**
 * Compile literal node to constant signal.
 */
function compileLiteral(node: ExprNode & { kind: 'literal' }, ctx: CompileContext): SigExprId {
  const type = canonicalType(node.type as PayloadType);
  
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
 * Compile identifier node to input signal reference.
 */
function compileIdentifier(node: ExprNode & { kind: 'identifier' }, ctx: CompileContext): SigExprId {
  if (!ctx.inputs.has(node.name)) {
    throw new Error(`Undefined input '${node.name}' during compilation (should have been caught by type checker)`);
  }
  return ctx.inputs.get(node.name)!;
}

/**
 * Compile unary operator node.
 */
function compileUnary(node: ExprNode & { kind: 'unary' }, ctx: CompileContext): SigExprId {
  const arg = compile(node.arg, ctx);
  const type = canonicalType(node.type as PayloadType);

  switch (node.op) {
    case '!': {
      // Logical NOT: Use comparison to false (0)
      const zero = ctx.builder.constant(intConst(0), canonicalType(INT));
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.kernelZip([arg, zero], eqFn, type);
    }

    case '-': {
      // Negation: Use Neg opcode
      const negFn = ctx.builder.opcode(OpCode.Neg);
      return ctx.builder.kernelMap(arg, negFn, type);
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
  const type = canonicalType(node.type as PayloadType);

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
      return ctx.builder.kernelZip([left, right], opFn, type);
    }

    // Synthesized operators
    case '<=': {
      // a <= b → !(a > b)
      const gtFn = ctx.builder.opcode(OpCode.Gt);
      const gt = ctx.builder.kernelZip([left, right], gtFn, canonicalType(BOOL));
      const zero = ctx.builder.constant(intConst(0), canonicalType(INT));
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.kernelZip([gt, zero], eqFn, type);
    }

    case '>=': {
      // a >= b → !(a < b)
      const ltFn = ctx.builder.opcode(OpCode.Lt);
      const lt = ctx.builder.kernelZip([left, right], ltFn, canonicalType(BOOL));
      const zero = ctx.builder.constant(intConst(0), canonicalType(INT));
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.kernelZip([lt, zero], eqFn, type);
    }

    case '!=': {
      // a != b → !(a == b)
      const eqFn = ctx.builder.opcode(OpCode.Eq);
      const eq = ctx.builder.kernelZip([left, right], eqFn, canonicalType(BOOL));
      const zero = ctx.builder.constant(intConst(0), canonicalType(INT));
      const eqZeroFn = ctx.builder.opcode(OpCode.Eq);
      return ctx.builder.kernelZip([eq, zero], eqZeroFn, type);
    }

    case '&&': {
      // a && b → a * b (since bool is 0 or 1)
      const mulFn = ctx.builder.opcode(OpCode.Mul);
      return ctx.builder.kernelZip([left, right], mulFn, type);
    }

    case '||': {
      // a || b → min(a + b, 1)
      const addFn = ctx.builder.opcode(OpCode.Add);
      const sum = ctx.builder.kernelZip([left, right], addFn, canonicalType(INT));
      const one = ctx.builder.constant(intConst(1), canonicalType(INT));
      const minFn = ctx.builder.opcode(OpCode.Min);
      return ctx.builder.kernelZip([sum, one], minFn, type);
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
  const type = canonicalType(node.type as PayloadType);

  // cond * then
  const mulFn = ctx.builder.opcode(OpCode.Mul);
  const condThen = ctx.builder.kernelZip([cond, thenBranch], mulFn, type);

  // 1 - cond
  const one = ctx.builder.constant(intConst(1), canonicalType(INT));
  const subFn = ctx.builder.opcode(OpCode.Sub);
  const oneMinusCond = ctx.builder.kernelZip([one, cond], subFn, canonicalType(INT));

  // (1 - cond) * else
  const condElse = ctx.builder.kernelZip([oneMinusCond, elseBranch], mulFn, type);

  // result = condThen + condElse
  const addFn = ctx.builder.opcode(OpCode.Add);
  return ctx.builder.kernelZip([condThen, condElse], addFn, type);
}

/**
 * Compile function call node.
 */
function compileCall(node: ExprNode & { kind: 'call' }, ctx: CompileContext): SigExprId {
  const args = node.args.map(arg => compile(arg, ctx));
  const type = canonicalType(node.type as PayloadType);

  // Map function name to implementation
  switch (node.fn) {
    // Trigonometric
    case 'sin': {
      const fn = ctx.builder.opcode(OpCode.Sin);
      return ctx.builder.kernelMap(args[0], fn, type);
    }

    case 'cos': {
      const fn = ctx.builder.opcode(OpCode.Cos);
      return ctx.builder.kernelMap(args[0], fn, type);
    }

    case 'tan': {
      const fn = ctx.builder.opcode(OpCode.Tan);
      return ctx.builder.kernelMap(args[0], fn, type);
    }

    // Unary functions
    case 'abs': {
      const fn = ctx.builder.opcode(OpCode.Abs);
      return ctx.builder.kernelMap(args[0], fn, type);
    }

    case 'sqrt': {
      const fn = ctx.builder.opcode(OpCode.Sqrt);
      return ctx.builder.kernelMap(args[0], fn, type);
    }

    case 'floor': {
      const fn = ctx.builder.opcode(OpCode.Floor);
      return ctx.builder.kernelMap(args[0], fn, type);
    }

    case 'ceil': {
      const fn = ctx.builder.opcode(OpCode.Ceil);
      return ctx.builder.kernelMap(args[0], fn, type);
    }

    case 'round': {
      const fn = ctx.builder.opcode(OpCode.Round);
      return ctx.builder.kernelMap(args[0], fn, type);
    }

    // Binary functions
    case 'min': {
      const fn = ctx.builder.opcode(OpCode.Min);
      return ctx.builder.kernelZip(args, fn, type);
    }

    case 'max': {
      const fn = ctx.builder.opcode(OpCode.Max);
      return ctx.builder.kernelZip(args, fn, type);
    }

    // Interpolation functions
    case 'lerp':
    case 'mix': {
      const fn = ctx.builder.opcode(OpCode.Lerp);
      return ctx.builder.kernelZip(args, fn, type);
    }

    case 'smoothstep': {
      // Synthesize: t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t)
      // For simplicity, use kernel 'smoothstep'
      const fn = ctx.builder.kernel('smoothstep');
      return ctx.builder.kernelZip(args, fn, type);
    }

    case 'clamp': {
      const fn = ctx.builder.opcode(OpCode.Clamp);
      return ctx.builder.kernelZip(args, fn, type);
    }

    // Phase functions
    case 'wrap': {
      const fn = ctx.builder.opcode(OpCode.Wrap01);
      return ctx.builder.kernelMap(args[0], fn, type);
    }

    case 'fract': {
      const fn = ctx.builder.opcode(OpCode.Wrap01);
      return ctx.builder.kernelMap(args[0], fn, type);
    }

    default:
      throw new Error(`Unknown function '${node.fn}' during compilation (should have been caught by type checker)`);
  }
}

/**
 * Compile member access node (component access or block output reference).
 */
function compileMemberAccess(node: ExprNode & { kind: 'member' }, ctx: CompileContext): SigExprId {
  // Type is already validated by type checker
  const objectSig = compile(node.object, ctx);
  const objectType = node.object.type!;

  // Case 1: Component access on vector type
  if (isVectorType(objectType)) {
    const pattern = node.member;
    const resultType = canonicalType(swizzleResultType(pattern));

    if (pattern.length === 1) {
      // Single component extraction
      const kernelName = getExtractionKernel(objectType, pattern);
      const fn = ctx.builder.kernel(kernelName);
      return ctx.builder.kernelMap(objectSig, fn, resultType);
    } else {
      // Multi-component swizzle: extract each component and combine
      /**
       * @DEPRECATED: must remove reference to SigExprId
       */
      const componentSigs: SigExprId[] = [];
      for (const char of pattern) {
        const kernelName = getExtractionKernel(objectType, char);
        const fn = ctx.builder.kernel(kernelName);
        const componentSig = ctx.builder.kernelMap(objectSig, fn, canonicalType(FLOAT));
        componentSigs.push(componentSig);
      }

      // Combine components into result vector
      const combineKernel = getCombineKernel(pattern.length);
      const combineFn = ctx.builder.kernel(combineKernel);
      return ctx.builder.kernelZip(componentSigs, combineFn, resultType);
    }
  }

  // Case 2: Block output reference (existing logic)
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

/**
 * Get extraction kernel name for a component.
 */
function getExtractionKernel(sourceType: PayloadType, component: string): string {
  const idx = componentIndex(component);
  if (sourceType.kind === 'color') {
    return ['colorExtractR', 'colorExtractG', 'colorExtractB', 'colorExtractA'][idx];
  } else {
    // vec2 or vec3
    return ['vec3ExtractX', 'vec3ExtractY', 'vec3ExtractZ'][idx];
  }
}

/**
 * Get combine kernel name for constructing a vector.
 */
function getCombineKernel(componentCount: number): string {
  switch (componentCount) {
    case 2: return 'makeVec2Sig';
    case 3: return 'makeVec3Sig';
    case 4: return 'makeColorSig';
    default: throw new Error(`Invalid component count: ${componentCount}`);
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
