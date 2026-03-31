/**
 * GPU-IR DSL: TypeScript AST → ExprIR/StatementIR walker.
 *
 * Parses arrow function source via fn.toString() + ts.createSourceFile(),
 * then walks the TS AST to produce ExprIR/StatementIR arrays.
 *
 * Well-known $-prefixed objects (resolved by the walker, not by name-magic):
 *   $global.X         → LoadGlobal('sys:X')
 *   $scalar.X         → LoadScalar('sys:X') / StoreScalar
 *   $domains.D.F[idx] → LoadField('D:F', idx) / StoreField
 *   $domains.D.$active→ LoadScalar / StoreScalar for domain's activeLanesSymbol
 *   $thread.x/y/z     → Intrinsic('global_invocation_id.x/y/z')
 *   $instance.index   → Intrinsic('instance_index')
 *   $vertex.index     → Intrinsic('vertex_index')
 *
 * [LAW:one-source-of-truth] All IR nodes are constructed via ir-builders.
 */

import ts from 'typescript';
import type { ExprIR, StatementIR, BuiltinMathFunc, BinaryOp, WgslType, MemoryManifest } from '../rust/boundary-contract';
import * as B from './ir-builders';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type ShaderStage = 'compute' | 'vertex' | 'fragment';

export interface ShaderContext {
  readonly stage: ShaderStage;
  readonly manifest: MemoryManifest;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const BUILTIN_NAMES = new Set<string>([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'exp', 'log', 'pow', 'sqrt',
  'abs', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
  'sign', 'fract', 'ceil', 'floor', 'round',
  'length', 'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract',
  'fwidth', 'dpdx', 'dpdy',
  'hash_u32', 'noise_simplex_2d', 'noise_simplex_3d',
]);

const CAST_NAMES = new Set(['f32', 'u32', 'i32']);

const CONSTRUCT_MAP: Record<string, WgslType> = {
  vec2: 'vec2<f32>', vec3: 'vec3<f32>', vec4: 'vec4<f32>',
  vec2i: 'vec2<i32>', vec3i: 'vec3<i32>', vec4i: 'vec4<i32>',
  vec2u: 'vec2<u32>', vec3u: 'vec3<u32>', vec4u: 'vec4<u32>',
};

/** Names that are $-prefixed well-known roots — never treated as free variables */
const WELL_KNOWN_ROOTS = new Set(['$global', '$scalar', '$domains', '$thread', '$instance', '$vertex']);

export function compileShaderBody(fn: Function, ctx: ShaderContext): StatementIR[] {
  const source = fn.toString();
  const sf = ts.createSourceFile('shader.ts', source, ts.ScriptTarget.Latest, true);

  const arrow = findArrow(sf);
  if (!arrow) throw new Error('compileShaderBody: no arrow function found in source');

  // Collect param names as shader-scope locals (vertex position, fragment varyings)
  const localBindings = new Set<string>();
  collectParamNames(arrow.parameters, localBindings);

  const walkCtx: WalkContext = { ...ctx, localBindings };

  if (ts.isBlock(arrow.body)) {
    return walkBlock(arrow.body, walkCtx);
  }
  return [walkReturnExpr(arrow.body, walkCtx)];
}

// ---------------------------------------------------------------------------
// Internal walk context
// ---------------------------------------------------------------------------

interface WalkContext extends ShaderContext {
  localBindings: Set<string>;
}

// ---------------------------------------------------------------------------
// TS AST helpers
// ---------------------------------------------------------------------------

function findArrow(sf: ts.SourceFile): ts.ArrowFunction | undefined {
  let result: ts.ArrowFunction | undefined;
  ts.forEachChild(sf, function visit(node) {
    if (result) return;
    if (ts.isArrowFunction(node)) { result = node; return; }
    ts.forEachChild(node, visit);
  });
  return result;
}

function collectParamNames(params: ts.NodeArray<ts.ParameterDeclaration>, scope: Set<string>): void {
  for (const p of params) {
    if (ts.isIdentifier(p.name)) {
      scope.add(p.name.text);
    } else if (ts.isObjectBindingPattern(p.name)) {
      for (const el of p.name.elements) {
        if (ts.isIdentifier(el.name)) scope.add(el.name.text);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Statement walking
// ---------------------------------------------------------------------------

function walkBlock(block: ts.Block, ctx: WalkContext): StatementIR[] {
  const stmts: StatementIR[] = [];
  for (const s of block.statements) stmts.push(...walkStatement(s, ctx));
  return stmts;
}

function walkStatement(node: ts.Statement, ctx: WalkContext): StatementIR[] {
  // const x = expr → Let
  // let x = expr → Var
  if (ts.isVariableStatement(node)) {
    const stmts: StatementIR[] = [];
    for (const decl of node.declarationList.declarations) {
      const name = (decl.name as ts.Identifier).text;
      ctx.localBindings.add(name);
      const isLet = (node.declarationList.flags & ts.NodeFlags.Let) !== 0;
      if (isLet) {
        const dataType = decl.type ? typeAnnotationToWgsl(decl.type) : undefined;
        stmts.push(B.var_(name, dataType, decl.initializer ? walkExpr(decl.initializer, ctx) : undefined));
      } else {
        stmts.push(B.let_(name, walkExpr(decl.initializer!, ctx)));
      }
    }
    return stmts;
  }

  // expression statement: assignment or standalone call
  if (ts.isExpressionStatement(node)) {
    return walkExpressionStatement(node.expression, ctx);
  }

  // return vertex(...) or return fragment(...)
  if (ts.isReturnStatement(node) && node.expression) {
    return [walkReturnExpr(node.expression, ctx)];
  }

  if (ts.isForStatement(node)) return [walkForStatement(node, ctx)];
  if (ts.isIfStatement(node)) return [walkIfStatement(node, ctx)];
  if (ts.isBreakStatement(node)) return [B.break_()];
  if (ts.isContinueStatement(node)) return [B.continue_()];

  throw new Error(`Unsupported statement: ${ts.SyntaxKind[node.kind]}`);
}

function walkExpressionStatement(expr: ts.Expression, ctx: WalkContext): StatementIR[] {
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return [walkAssignment(expr, ctx)];
  }
  throw new Error(`Unsupported expression statement: ${ts.SyntaxKind[expr.kind]}`);
}

function walkAssignment(expr: ts.BinaryExpression, ctx: WalkContext): StatementIR {
  const lhs = expr.left;
  const value = walkExpr(expr.right, ctx);

  // $domains.D.F[idx] = value → StoreField
  if (ts.isElementAccessExpression(lhs)) {
    const resolved = tryResolveDollarChain(lhs.expression, ctx);
    if (resolved) {
      if (resolved.kind !== 'domainField') throw new Error(`Cannot index-access ${resolved.kind}`);
      const index = walkExprAsIndex(lhs.argumentExpression, ctx);
      return B.storeField(resolved.symbolId, index, value);
    }
    // Fallback: generic element access (shouldn't happen for well-formed DSL)
    throw new Error('Assignment to unresolved element access');
  }

  // $scalar.X = value → StoreScalar
  // $domains.D.$active = value → StoreScalar
  if (ts.isPropertyAccessExpression(lhs)) {
    const resolved = tryResolveDollarChain(lhs, ctx);
    if (resolved) {
      if (resolved.kind === 'scalar' || resolved.kind === 'domainActive') {
        return B.storeScalar(resolved.symbolId, value);
      }
      throw new Error(`Cannot assign to ${resolved.kind}: ${resolved.symbolId}`);
    }
  }

  // x = value → Assign (mutable var)
  if (ts.isIdentifier(lhs)) {
    return B.assign(B.ref(lhs.text), value);
  }

  throw new Error(`Unsupported assignment target: ${ts.SyntaxKind[lhs.kind]}`);
}

function walkReturnExpr(expr: ts.Expression, ctx: WalkContext): StatementIR {
  if (!ts.isCallExpression(expr)) throw new Error('Return must call vertex() or fragment()');
  const fnName = ts.isIdentifier(expr.expression) ? expr.expression.text : '';

  if (fnName === 'vertex') {
    const posExpr = walkExpr(expr.arguments[0], ctx);
    const varyings: Record<string, ExprIR> = {};
    if (expr.arguments.length > 1 && ts.isObjectLiteralExpression(expr.arguments[1])) {
      for (const prop of expr.arguments[1].properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          varyings[prop.name.text] = walkExpr(prop.initializer, ctx);
        }
        if (ts.isShorthandPropertyAssignment(prop)) {
          varyings[prop.name.text] = walkExpr(prop.name, ctx);
        }
      }
    }
    return B.returnVertex(posExpr, varyings);
  }

  if (fnName === 'fragment') {
    const outputs: Record<string, ExprIR> = {};
    if (ts.isObjectLiteralExpression(expr.arguments[0])) {
      for (const prop of expr.arguments[0].properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          outputs[prop.name.text] = walkExpr(prop.initializer, ctx);
        }
        if (ts.isShorthandPropertyAssignment(prop)) {
          outputs[prop.name.text] = walkExpr(prop.name, ctx);
        }
      }
    }
    return B.returnFragment(outputs);
  }

  throw new Error(`Return must call vertex() or fragment(), got: ${fnName}`);
}

function walkForStatement(node: ts.ForStatement, ctx: WalkContext): StatementIR {
  const childCtx: WalkContext = { ...ctx, localBindings: new Set(ctx.localBindings) };

  let init: StatementIR;
  if (node.initializer && ts.isVariableDeclarationList(node.initializer)) {
    const decl = node.initializer.declarations[0];
    const name = (decl.name as ts.Identifier).text;
    childCtx.localBindings.add(name);
    const dataType = decl.type ? typeAnnotationToWgsl(decl.type) : undefined;
    init = B.var_(name, dataType, decl.initializer ? walkExpr(decl.initializer, childCtx) : undefined);
  } else {
    throw new Error('For loop init must be a variable declaration');
  }

  const condition = walkExpr(node.condition!, childCtx);

  let update: StatementIR;
  if (node.incrementor && ts.isBinaryExpression(node.incrementor)) {
    update = B.assign(walkExpr(node.incrementor.left, childCtx), walkExpr(node.incrementor.right, childCtx));
  } else if (node.incrementor && (ts.isPostfixUnaryExpression(node.incrementor) || ts.isPrefixUnaryExpression(node.incrementor))) {
    const operand = node.incrementor.operand as ts.Identifier;
    const op = ('operator' in node.incrementor && node.incrementor.operator === ts.SyntaxKind.PlusPlusToken) ? '+' : '-';
    update = B.assign(B.ref(operand.text), B.binop(op as BinaryOp, B.ref(operand.text), B.litU32(1)));
  } else {
    throw new Error('Unsupported for-loop update expression');
  }

  const body = node.statement && ts.isBlock(node.statement)
    ? walkBlock(node.statement, childCtx)
    : walkStatement(node.statement, childCtx);

  return B.for_(init, condition, update, body);
}

function walkIfStatement(node: ts.IfStatement, ctx: WalkContext): StatementIR {
  const condition = walkExpr(node.expression, ctx);
  const accept = ts.isBlock(node.thenStatement)
    ? walkBlock(node.thenStatement, ctx)
    : walkStatement(node.thenStatement, ctx);
  const reject = node.elseStatement
    ? (ts.isBlock(node.elseStatement) ? walkBlock(node.elseStatement, ctx) : walkStatement(node.elseStatement, ctx))
    : [];
  return B.if_(condition, accept, reject);
}

// ---------------------------------------------------------------------------
// Expression walking
// ---------------------------------------------------------------------------

function walkExpr(node: ts.Expression, ctx: WalkContext): ExprIR {
  if (ts.isNumericLiteral(node)) return B.litF32(Number(node.text));
  if (ts.isParenthesizedExpression(node)) return walkExpr(node.expression, ctx);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return B.litBool(true);
  if (node.kind === ts.SyntaxKind.FalseKeyword) return B.litBool(false);

  // Identifier
  if (ts.isIdentifier(node)) {
    const name = node.text;
    if (ctx.localBindings.has(name)) return B.ref(name);
    if (WELL_KNOWN_ROOTS.has(name)) return B.ref(name); // intermediate — resolved by property access
    // Free variable → JS constant placeholder (NaN replaced by compile.ts)
    return { type: 'LiteralF32', value: NaN } as ExprIR;
  }

  // Binary expression
  if (ts.isBinaryExpression(node)) {
    return B.binop(binaryTokenToOp(node.operatorToken.kind), walkExpr(node.left, ctx), walkExpr(node.right, ctx));
  }

  // Prefix unary
  if (ts.isPrefixUnaryExpression(node)) {
    // Special case: -numericLiteral → negative LiteralF32
    if (node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
      return B.litF32(-Number(node.operand.text));
    }
    return B.unaryOp(prefixTokenToOp(node.operator), walkExpr(node.operand, ctx));
  }

  // Call expression
  if (ts.isCallExpression(node)) return walkCallExpr(node, ctx);

  // Property access — try $-prefixed resolution first
  if (ts.isPropertyAccessExpression(node)) {
    const resolved = tryResolveDollarChain(node, ctx);
    if (resolved) {
      if (resolved.kind === 'global') return B.loadGlobal(resolved.symbolId);
      if (resolved.kind === 'scalar') return B.loadScalar(resolved.symbolId);
      if (resolved.kind === 'domainActive') return B.loadScalar(resolved.symbolId);
      if (resolved.kind === 'intrinsic') return B.intrinsic(resolved.symbolId as any);
      // domainField without index → error (need [idx])
      throw new Error(`Domain field requires index: ${resolved.symbolId}`);
    }
    // Fallback: swizzle (position.x, position.xy)
    return B.swizzle(walkExpr(node.expression, ctx), node.name.text);
  }

  // Element access — try $-prefixed resolution first
  if (ts.isElementAccessExpression(node)) {
    const resolved = tryResolveDollarChain(node.expression, ctx);
    if (resolved && resolved.kind === 'domainField') {
      return B.loadField(resolved.symbolId, walkExprAsIndex(node.argumentExpression, ctx));
    }
    return B.indexAccess(walkExpr(node.expression, ctx), walkExpr(node.argumentExpression, ctx));
  }

  throw new Error(`Unsupported expression: ${ts.SyntaxKind[node.kind]}`);
}

function walkCallExpr(node: ts.CallExpression, ctx: WalkContext): ExprIR {
  const callee = node.expression;
  if (!ts.isIdentifier(callee)) throw new Error(`Unsupported call target: ${ts.SyntaxKind[callee.kind]}`);

  const name = callee.text;
  const args = node.arguments.map(a => walkExpr(a, ctx));

  // Cast: f32(x), u32(x), i32(x) — optimize literal args to typed literals
  if (CAST_NAMES.has(name) && args.length === 1) {
    const arg = node.arguments[0];
    if (ts.isNumericLiteral(arg)) {
      const v = Number(arg.text);
      if (name === 'u32') return B.litU32(v);
      if (name === 'i32') return B.litI32(v);
      return B.litF32(v);
    }
    return B.cast(name as WgslType, args[0]);
  }

  // Constructor: vec4(a,b,c,d), vec2i(x,y), etc.
  if (name in CONSTRUCT_MAP) return B.construct(CONSTRUCT_MAP[name], args);

  // Builtin math: sin(x), cos(x), etc.
  if (BUILTIN_NAMES.has(name)) return B.callBuiltin(name as BuiltinMathFunc, args);

  throw new Error(`Unknown function call: ${name}`);
}

/** Walk expression in index context — bare numeric literals become LiteralU32 */
function walkExprAsIndex(node: ts.Expression, ctx: WalkContext): ExprIR {
  if (ts.isNumericLiteral(node)) return B.litU32(Number(node.text));
  return walkExpr(node, ctx);
}

// ---------------------------------------------------------------------------
// $-prefixed chain resolution
// ---------------------------------------------------------------------------

interface ResolvedChain {
  kind: 'global' | 'scalar' | 'domainField' | 'domainActive' | 'intrinsic';
  symbolId: string;
}

/**
 * Try to resolve a property access chain rooted at a $-prefixed well-known object.
 * Returns null if the expression isn't a $-chain.
 */
function tryResolveDollarChain(node: ts.Expression, ctx: WalkContext): ResolvedChain | null {
  // $global.X → LoadGlobal('sys:X')
  if (ts.isPropertyAccessExpression(node) && isIdent(node.expression, '$global')) {
    return { kind: 'global', symbolId: `sys:${node.name.text}` };
  }

  // $scalar.X → LoadScalar('sys:X') / StoreScalar
  if (ts.isPropertyAccessExpression(node) && isIdent(node.expression, '$scalar')) {
    return { kind: 'scalar', symbolId: `sys:${node.name.text}` };
  }

  // $thread.x/y/z → Intrinsic
  if (ts.isPropertyAccessExpression(node) && isIdent(node.expression, '$thread')) {
    const map: Record<string, string> = {
      x: 'global_invocation_id.x', y: 'global_invocation_id.y', z: 'global_invocation_id.z',
    };
    const intrinsic = map[node.name.text];
    if (!intrinsic) throw new Error(`Unknown $thread property: ${node.name.text}`);
    return { kind: 'intrinsic', symbolId: intrinsic };
  }

  // $instance.index → Intrinsic
  if (ts.isPropertyAccessExpression(node) && isIdent(node.expression, '$instance')) {
    if (node.name.text === 'index') return { kind: 'intrinsic', symbolId: 'instance_index' };
    throw new Error(`Unknown $instance property: ${node.name.text}`);
  }

  // $vertex.index → Intrinsic
  if (ts.isPropertyAccessExpression(node) && isIdent(node.expression, '$vertex')) {
    if (node.name.text === 'index') return { kind: 'intrinsic', symbolId: 'vertex_index' };
    throw new Error(`Unknown $vertex property: ${node.name.text}`);
  }

  // $domains.D.F → domainField or $domains.D.$active → domainActive
  if (ts.isPropertyAccessExpression(node)) {
    const inner = node.expression;
    // Check for $domains.D.PROP pattern
    if (ts.isPropertyAccessExpression(inner) && isIdent(inner.expression, '$domains')) {
      const domainId = inner.name.text;
      const prop = node.name.text;

      // $domains.D.$active → domain's activeLanesSymbol
      if (prop === '$active') {
        const domain = ctx.manifest.domains[domainId];
        if (!domain) throw new Error(`Unknown domain: ${domainId}`);
        return { kind: 'domainActive', symbolId: domain.activeLanesSymbol };
      }

      // $domains.D.F → domain field
      return { kind: 'domainField', symbolId: `${domainId}:${prop}` };
    }
  }

  return null;
}

function isIdent(node: ts.Expression, name: string): boolean {
  return ts.isIdentifier(node) && node.text === name;
}

// ---------------------------------------------------------------------------
// Operator mapping
// ---------------------------------------------------------------------------

function binaryTokenToOp(kind: ts.SyntaxKind): BinaryOp {
  switch (kind) {
    case ts.SyntaxKind.PlusToken: return '+';
    case ts.SyntaxKind.MinusToken: return '-';
    case ts.SyntaxKind.AsteriskToken: return '*';
    case ts.SyntaxKind.SlashToken: return '/';
    case ts.SyntaxKind.PercentToken: return '%';
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
    case ts.SyntaxKind.EqualsEqualsToken: return '==';
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
    case ts.SyntaxKind.ExclamationEqualsToken: return '!=';
    case ts.SyntaxKind.LessThanToken: return '<';
    case ts.SyntaxKind.GreaterThanToken: return '>';
    case ts.SyntaxKind.LessThanEqualsToken: return '<=';
    case ts.SyntaxKind.GreaterThanEqualsToken: return '>=';
    case ts.SyntaxKind.AmpersandAmpersandToken: return '&&';
    case ts.SyntaxKind.BarBarToken: return '||';
    case ts.SyntaxKind.AmpersandToken: return '&';
    case ts.SyntaxKind.BarToken: return '|';
    case ts.SyntaxKind.CaretToken: return '^';
    case ts.SyntaxKind.LessThanLessThanToken: return '<<';
    case ts.SyntaxKind.GreaterThanGreaterThanToken: return '>>';
    default: throw new Error(`Unsupported binary operator: ${ts.SyntaxKind[kind]}`);
  }
}

function prefixTokenToOp(op: ts.PrefixUnaryOperator): '-' | '!' | '~' {
  switch (op) {
    case ts.SyntaxKind.MinusToken: return '-';
    case ts.SyntaxKind.ExclamationToken: return '!';
    case ts.SyntaxKind.TildeToken: return '~';
    default: throw new Error(`Unsupported prefix operator: ${ts.SyntaxKind[op]}`);
  }
}

// ---------------------------------------------------------------------------
// Type annotation helpers
// ---------------------------------------------------------------------------

function typeAnnotationToWgsl(typeNode: ts.TypeNode): WgslType | undefined {
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const name = typeNode.typeName.text;
    const map: Record<string, WgslType> = {
      f32: 'f32', u32: 'u32', i32: 'i32', bool: 'bool',
      vec2f: 'vec2<f32>', vec3f: 'vec3<f32>', vec4f: 'vec4<f32>',
      vec2i: 'vec2<i32>', vec3i: 'vec3<i32>',
      vec2u: 'vec2<u32>', vec3u: 'vec3<u32>',
    };
    return map[name];
  }
  return undefined;
}
