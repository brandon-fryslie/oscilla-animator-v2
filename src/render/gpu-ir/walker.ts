/**
 * GPU-IR DSL: Acorn (ESTree) → ExprIR/StatementIR walker.
 *
 * Parses arrow function source via acorn.parse(fn.toString()),
 * then walks the ESTree AST to produce ExprIR/StatementIR arrays.
 *
 * Replaces walker.ts (TypeScript compiler API, ~3MB) with acorn (~80KB).
 * Since esbuild strips type annotations before runtime, we only need
 * basic JS parsing — acorn suffices.
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
 * [LAW:one-source-of-truth] All symbol/operator tables from ir-node-rules.
 */

import * as acorn from 'acorn';
import type * as ESTree from 'estree';
import type { ExprIR, StatementIR, BuiltinMathFunc, BinaryOp, WgslType, AtomicOp, MemoryManifest } from '../rust/boundary-contract';
import * as B from './ir-builders';
import {
  BUILTIN_NAMES, CAST_NAMES, CONSTRUCT_MAP,
  DOLLAR_CHAIN_RULES, WELL_KNOWN_ROOTS,
  ESTREE_TO_BINOP,
} from './ir-node-rules';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type ShaderStage = 'compute' | 'vertex' | 'fragment';

export interface ShaderContext {
  readonly stage: ShaderStage;
  readonly manifest: MemoryManifest;
  /** Named constants: emitted as Let bindings at the top of the body, referenced as VarRef */
  readonly constants?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WalkerDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly source?: string;
}

export interface WalkerResult {
  readonly stmts: StatementIR[];
  readonly diagnostics: readonly WalkerDiagnostic[];
}

export function compileShaderBody(fn: Function, ctx: ShaderContext): WalkerResult {
  const source = fn.toString();
  const diagnostics: WalkerDiagnostic[] = [];

  let program: ESTree.Program;
  try {
    program = acorn.parse(source, {
      ecmaVersion: 2022,
      locations: true,
      sourceType: 'module',
    }) as unknown as ESTree.Program;
  } catch (e: unknown) {
    const err = e as { loc?: { line: number; column: number }; message?: string };
    diagnostics.push({
      severity: 'error',
      line: err.loc?.line ?? 1,
      column: err.loc?.column ?? 0,
      message: err.message ?? 'Parse error',
      source,
    });
    return { stmts: [], diagnostics };
  }

  const arrow = findArrow(program);
  if (!arrow) {
    diagnostics.push({ severity: 'error', line: 1, column: 0, message: 'No arrow function found in source' });
    return { stmts: [], diagnostics };
  }

  const localBindings = new Set<string>();
  collectParamNames(arrow.params, localBindings);

  // Emit Let bindings for named constants and add to local scope
  const preamble: StatementIR[] = [];
  if (ctx.constants) {
    for (const [name, value] of Object.entries(ctx.constants)) {
      localBindings.add(name);
      preamble.push(B.let_(name, B.litF32(value)));
    }
  }

  const walkCtx: WalkContext = { ...ctx, localBindings, diagnostics };

  const body = arrow.body.type === 'BlockStatement'
    ? walkBlock(arrow.body, walkCtx)
    : [walkReturnExpr(arrow.body, walkCtx)];

  return { stmts: [...preamble, ...body], diagnostics };
}

// ---------------------------------------------------------------------------
// Internal walk context
// ---------------------------------------------------------------------------

interface WalkContext extends ShaderContext {
  localBindings: Set<string>;
  diagnostics: WalkerDiagnostic[];
}

// ---------------------------------------------------------------------------
// Diagnostic helpers
// ---------------------------------------------------------------------------

function addError(ctx: WalkContext, node: ESTree.Node | null, message: string): void {
  const loc = node?.loc?.start;
  ctx.diagnostics.push({
    severity: 'error',
    line: loc?.line ?? 1,
    column: loc?.column ?? 0,
    message,
  });
}

/** Return a NaN sentinel so walk continues accumulating diagnostics */
function errorExpr(ctx: WalkContext, node: ESTree.Node | null, message: string): ExprIR {
  addError(ctx, node, message);
  return B.litF32(NaN);
}

// ---------------------------------------------------------------------------
// ESTree helpers
// ---------------------------------------------------------------------------

function findArrow(program: ESTree.Program): ESTree.ArrowFunctionExpression | null {
  for (const stmt of program.body) {
    const found = findArrowInNode(stmt);
    if (found) return found;
  }
  return null;
}

function findArrowInNode(node: ESTree.Node): ESTree.ArrowFunctionExpression | null {
  if (node.type === 'ArrowFunctionExpression') return node;
  if (node.type === 'ExpressionStatement') return findArrowInNode(node.expression);
  if (node.type === 'VariableDeclaration') {
    for (const decl of node.declarations) {
      if (decl.init) {
        const found = findArrowInNode(decl.init);
        if (found) return found;
      }
    }
  }
  if (node.type === 'AssignmentExpression') return findArrowInNode(node.right);
  return null;
}

function collectParamNames(params: ESTree.Pattern[], scope: Set<string>): void {
  for (const p of params) {
    if (p.type === 'Identifier') {
      scope.add(p.name);
    } else if (p.type === 'ObjectPattern') {
      for (const prop of p.properties) {
        if (prop.type === 'Property' && prop.value.type === 'Identifier') {
          scope.add(prop.value.name);
        }
      }
    }
  }
}

function isIdentNamed(node: ESTree.Expression, name: string): boolean {
  return node.type === 'Identifier' && node.name === name;
}

// ---------------------------------------------------------------------------
// Statement walking
// ---------------------------------------------------------------------------

function walkBlock(block: ESTree.BlockStatement, ctx: WalkContext): StatementIR[] {
  const stmts: StatementIR[] = [];
  for (const s of block.body) stmts.push(...walkStatement(s, ctx));
  return stmts;
}

function walkStatement(node: ESTree.Statement, ctx: WalkContext): StatementIR[] {
  // const x = expr → Let
  // let x = expr → Var
  if (node.type === 'VariableDeclaration') {
    const stmts: StatementIR[] = [];
    for (const decl of node.declarations) {
      const name = (decl.id as ESTree.Identifier).name;
      ctx.localBindings.add(name);
      // const x = atomicAdd(...) → AtomicOpField/Scalar with assignResultTo
      const atomicStmt = tryWalkAtomicAssignResult(decl.init, name, ctx);
      if (atomicStmt) {
        stmts.push(atomicStmt);
      } else if (node.kind === 'let') {
        const initExpr = decl.init ? walkExpr(decl.init, ctx) : undefined;
        stmts.push(B.var_(name, initExpr ? inferDataType(initExpr, ctx.manifest) : undefined, initExpr));
      } else {
        stmts.push(B.let_(name, walkExpr(decl.init!, ctx)));
      }
    }
    return stmts;
  }

  // expression statement: assignment or standalone call
  if (node.type === 'ExpressionStatement') {
    return walkExpressionStatement(node.expression, ctx);
  }

  // return vertex(...) or return fragment(...)
  if (node.type === 'ReturnStatement' && node.argument) {
    return [walkReturnExpr(node.argument, ctx)];
  }

  if (node.type === 'ForStatement') return [walkForStatement(node, ctx)];
  if (node.type === 'IfStatement') return [walkIfStatement(node, ctx)];
  if (node.type === 'BreakStatement') return [B.break_()];
  if (node.type === 'ContinueStatement') return [B.continue_()];

  addError(ctx, node, `Unsupported statement: ${node.type}`);
  return [];
}

function walkExpressionStatement(expr: ESTree.Expression, ctx: WalkContext): StatementIR[] {
  if (expr.type === 'AssignmentExpression' && expr.operator === '=') {
    return [walkAssignment(expr, ctx)];
  }
  // textureStore('textureId', coords, value) → TextureStore statement
  if (expr.type === 'CallExpression' && expr.callee.type === 'Identifier' && expr.callee.name === 'textureStore') {
    const textureId = extractStringArg(expr.arguments[0] as ESTree.Expression, ctx, 'textureStore');
    const coords = walkExpr(expr.arguments[1] as ESTree.Expression, ctx);
    const value = walkExpr(expr.arguments[2] as ESTree.Expression, ctx);
    return [B.textureStore_(textureId, coords, value)];
  }
  // atomicAdd/atomicExchange/etc. → AtomicOpField (3 args) or AtomicOpScalar (2 args)
  if (expr.type === 'CallExpression' && expr.callee.type === 'Identifier') {
    const atomicOp = ATOMIC_FUNC_TO_OP[expr.callee.name];
    if (atomicOp) {
      const symbolId = extractStringArg(expr.arguments[0] as ESTree.Expression, ctx, expr.callee.name);
      if (expr.arguments.length === 3) {
        const index = walkExpr(expr.arguments[1] as ESTree.Expression, ctx);
        const value = walkExpr(expr.arguments[2] as ESTree.Expression, ctx);
        return [B.atomicOpField(atomicOp, symbolId, index, value)];
      }
      const value = walkExpr(expr.arguments[1] as ESTree.Expression, ctx);
      return [B.atomicOpScalar(atomicOp, symbolId, value)];
    }
  }
  addError(ctx, expr, `Unsupported expression statement: ${expr.type}`);
  return [];
}

function walkAssignment(expr: ESTree.AssignmentExpression, ctx: WalkContext): StatementIR {
  const lhs = expr.left;
  const value = walkExpr(expr.right, ctx);

  // Try resolving the LHS as a $-chain (handles both dot and bracket notation)
  if (lhs.type === 'MemberExpression') {
    // $domains.D.F[idx] = value → StoreField (computed, domain field)
    if (lhs.computed) {
      const resolved = tryResolveDollarChain(lhs.object as ESTree.Expression, ctx);
      if (resolved && resolved.kind === 'domainField') {
        const index = walkExprAsIndex(lhs.property as ESTree.Expression, ctx);
        return B.storeField(resolved.symbolId, index, value);
      }
    }

    // $global.X = value, $global['cam:X'] = value → StoreGlobal
    // $scalar.X = value, $scalar['cam:vp'] = value → StoreScalar
    // $domains.D.$active = value → StoreScalar
    const resolved = tryResolveDollarChain(lhs as unknown as ESTree.Expression, ctx);
    if (resolved) {
      if (resolved.kind === 'global') {
        return B.storeGlobal(resolved.symbolId, value);
      }
      if (resolved.kind === 'scalar' || resolved.kind === 'domainActive') {
        return B.storeScalar(resolved.symbolId, value);
      }
      addError(ctx, lhs, `Cannot assign to ${resolved.kind}: ${resolved.symbolId}`);
      return B.assign(B.litF32(NaN), value);
    }

    if (lhs.computed) {
      addError(ctx, lhs, 'Assignment to unresolved element access');
      return B.assign(B.litF32(NaN), value);
    }
  }

  // x = value → Assign (mutable var)
  if (lhs.type === 'Identifier') {
    return B.assign(B.ref(lhs.name), value);
  }

  addError(ctx, expr, `Unsupported assignment target: ${lhs.type}`);
  return B.assign(B.litF32(NaN), value);
}

function walkReturnExpr(expr: ESTree.Expression, ctx: WalkContext): StatementIR {
  if (expr.type !== 'CallExpression' || expr.callee.type !== 'Identifier') {
    addError(ctx, expr, 'Return must call vertex() or fragment()');
    return B.returnFragment({});
  }

  const fnName = expr.callee.name;

  if (fnName === 'vertex') {
    const posExpr = walkExpr(expr.arguments[0] as ESTree.Expression, ctx);
    const varyings: Record<string, ExprIR> = {};
    if (expr.arguments.length > 1) {
      const arg1 = expr.arguments[1] as ESTree.Expression;
      if (arg1.type === 'ObjectExpression') {
        walkObjectProperties(arg1.properties, varyings, ctx);
      }
    }
    return B.returnVertex(posExpr, varyings);
  }

  if (fnName === 'fragment') {
    const outputs: Record<string, ExprIR> = {};
    const arg0 = expr.arguments[0] as ESTree.Expression;
    if (arg0.type === 'ObjectExpression') {
      walkObjectProperties(arg0.properties, outputs, ctx);
    }
    return B.returnFragment(outputs);
  }

  addError(ctx, expr, `Return must call vertex() or fragment(), got: ${fnName}`);
  return B.returnFragment({});
}

function walkObjectProperties(
  properties: (ESTree.Property | ESTree.SpreadElement)[],
  out: Record<string, ExprIR>,
  ctx: WalkContext,
): void {
  for (const prop of properties) {
    if (prop.type !== 'Property') continue;
    const key = prop.key.type === 'Identifier' ? prop.key.name : String((prop.key as ESTree.Literal).value);
    if (prop.shorthand && prop.value.type === 'Identifier') {
      // { color } shorthand — value is the identifier itself
      out[key] = walkExpr(prop.value, ctx);
    } else {
      out[key] = walkExpr(prop.value as ESTree.Expression, ctx);
    }
  }
}

function walkForStatement(node: ESTree.ForStatement, ctx: WalkContext): StatementIR {
  const childCtx: WalkContext = { ...ctx, localBindings: new Set(ctx.localBindings) };

  let init: StatementIR;
  if (node.init && node.init.type === 'VariableDeclaration') {
    const decl = node.init.declarations[0];
    const name = (decl.id as ESTree.Identifier).name;
    childCtx.localBindings.add(name);
    if (node.init.kind === 'let') {
      const initExpr = decl.init ? walkExpr(decl.init, childCtx) : undefined;
      init = B.var_(name, initExpr ? inferDataType(initExpr, ctx.manifest) : undefined, initExpr);
    } else {
      init = B.let_(name, walkExpr(decl.init!, childCtx));
    }
  } else {
    addError(ctx, node, 'For loop init must be a variable declaration');
    init = B.var_('_err', undefined, undefined);
  }

  const condition = walkExpr(node.test as ESTree.Expression, childCtx);

  let update: StatementIR;
  if (node.update) {
    if (node.update.type === 'AssignmentExpression') {
      update = B.assign(walkExpr(node.update.left as ESTree.Expression, childCtx), walkExpr(node.update.right, childCtx));
    } else if (node.update.type === 'UpdateExpression') {
      const operand = node.update.argument as ESTree.Identifier;
      const op: BinaryOp = node.update.operator === '++' ? '+' : '-';
      update = B.assign(B.ref(operand.name), B.binop(op, B.ref(operand.name), B.litU32(1)));
    } else {
      addError(ctx, node.update, 'Unsupported for-loop update expression');
      update = B.assign(B.ref('_err'), B.litF32(0));
    }
  } else {
    addError(ctx, node, 'For loop requires update expression');
    update = B.assign(B.ref('_err'), B.litF32(0));
  }

  const body = node.body.type === 'BlockStatement'
    ? walkBlock(node.body, childCtx)
    : walkStatement(node.body, childCtx);

  return B.for_(init, condition, update, body);
}

function walkIfStatement(node: ESTree.IfStatement, ctx: WalkContext): StatementIR {
  const condition = walkExpr(node.test, ctx);
  const accept = node.consequent.type === 'BlockStatement'
    ? walkBlock(node.consequent, ctx)
    : walkStatement(node.consequent, ctx);
  const reject = node.alternate
    ? (node.alternate.type === 'BlockStatement' ? walkBlock(node.alternate, ctx) : walkStatement(node.alternate, ctx))
    : [];
  return B.if_(condition, accept, reject);
}

// ---------------------------------------------------------------------------
// Expression walking
// ---------------------------------------------------------------------------

function walkExpr(node: ESTree.Expression, ctx: WalkContext): ExprIR {
  // Numeric literal
  if (node.type === 'Literal' && typeof node.value === 'number') {
    return B.litF32(node.value);
  }
  // Boolean literal
  if (node.type === 'Literal' && typeof node.value === 'boolean') {
    return B.litBool(node.value);
  }

  // Identifier
  if (node.type === 'Identifier') {
    const name = node.name;
    if (ctx.localBindings.has(name)) return B.ref(name);
    if (WELL_KNOWN_ROOTS.has(name)) return B.ref(name); // intermediate — resolved by property access
    // Free variable → JS constant placeholder (NaN replaced by compile.ts)
    return { type: 'LiteralF32', value: NaN } as ExprIR;
  }

  // Binary expression
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    const op = (ESTREE_TO_BINOP[node.operator] ?? node.operator) as BinaryOp;
    return B.binop(op, walkExpr(node.left as ESTree.Expression, ctx), walkExpr(node.right, ctx));
  }

  // Prefix unary
  if (node.type === 'UnaryExpression' && node.prefix) {
    // Special case: -numericLiteral → negative LiteralF32
    if (node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
      return B.litF32(-node.argument.value);
    }
    const op = node.operator as '-' | '!' | '~';
    return B.unaryOp(op, walkExpr(node.argument, ctx));
  }

  // Call expression
  if (node.type === 'CallExpression') return walkCallExpr(node, ctx);

  // Member access — try $-prefixed resolution first
  if (node.type === 'MemberExpression' && !node.computed) {
    const resolved = tryResolveDollarChain(node as unknown as ESTree.Expression, ctx);
    if (resolved) {
      if (resolved.kind === 'global') return B.loadGlobal(resolved.symbolId);
      if (resolved.kind === 'scalar') return B.loadScalar(resolved.symbolId);
      if (resolved.kind === 'domainActive') return B.loadScalar(resolved.symbolId);
      if (resolved.kind === 'intrinsic') return B.intrinsic(resolved.symbolId as any);
      // domainField without index → error (need [idx])
      return errorExpr(ctx, node, `Domain field requires index: ${resolved.symbolId}`);
    }
    // Fallback: swizzle (position.x, position.xy)
    const propName = (node.property as ESTree.Identifier).name;
    return B.swizzle(walkExpr(node.object as ESTree.Expression, ctx), propName);
  }

  // Computed member access — bracket notation
  if (node.type === 'MemberExpression' && node.computed) {
    // Try full chain resolution: $global['cam:X'] → LoadGlobal, $scalar['cam:vp'] → LoadScalar
    const fullResolved = tryResolveDollarChain(node as unknown as ESTree.Expression, ctx);
    if (fullResolved) {
      if (fullResolved.kind === 'global') return B.loadGlobal(fullResolved.symbolId);
      if (fullResolved.kind === 'scalar') return B.loadScalar(fullResolved.symbolId);
      if (fullResolved.kind === 'domainActive') return B.loadScalar(fullResolved.symbolId);
    }
    // $domains.D.F[idx] → LoadField
    const resolved = tryResolveDollarChain(node.object as ESTree.Expression, ctx);
    if (resolved && resolved.kind === 'domainField') {
      return B.loadField(resolved.symbolId, walkExprAsIndex(node.property as ESTree.Expression, ctx));
    }
    return B.indexAccess(walkExpr(node.object as ESTree.Expression, ctx), walkExpr(node.property as ESTree.Expression, ctx));
  }

  return errorExpr(ctx, node, `Unsupported expression: ${node.type}`);
}

function walkCallExpr(node: ESTree.CallExpression, ctx: WalkContext): ExprIR {
  if (node.callee.type !== 'Identifier') {
    return errorExpr(ctx, node, `Unsupported call target: ${node.callee.type}`);
  }

  const name = node.callee.name;

  // Texture ops — checked BEFORE generic arg walk because first arg is a string literal
  // [LAW:one-source-of-truth] textureLoad/textureSample walk their own args
  if (name === 'textureLoad') {
    const textureId = extractStringArg(node.arguments[0] as ESTree.Expression, ctx, 'textureLoad');
    const coords = walkExpr(node.arguments[1] as ESTree.Expression, ctx);
    return B.textureLoad(textureId, coords);
  }
  if (name === 'textureSample') {
    const textureId = extractStringArg(node.arguments[0] as ESTree.Expression, ctx, 'textureSample');
    const samplerId = extractStringArg(node.arguments[1] as ESTree.Expression, ctx, 'textureSample');
    const uv = walkExpr(node.arguments[2] as ESTree.Expression, ctx);
    return B.textureSample(textureId, samplerId, uv);
  }
  // atomicLoad('symbolId', index) → AtomicLoadField
  // atomicLoad('symbolId') → AtomicLoadScalar
  if (name === 'atomicLoad') {
    const symbolId = extractStringArg(node.arguments[0] as ESTree.Expression, ctx, 'atomicLoad');
    if (node.arguments.length >= 2) {
      const index = walkExpr(node.arguments[1] as ESTree.Expression, ctx);
      return B.atomicLoadField(symbolId, index);
    }
    return B.atomicLoadScalar(symbolId);
  }

  const args = (node.arguments as ESTree.Expression[]).map(a => walkExpr(a, ctx));

  // Cast: f32(x), u32(x), i32(x) — optimize literal args to typed literals
  if (CAST_NAMES.has(name) && args.length === 1) {
    const argNode = node.arguments[0] as ESTree.Expression;
    if (argNode.type === 'Literal' && typeof argNode.value === 'number') {
      if (name === 'u32') return B.litU32(argNode.value);
      if (name === 'i32') return B.litI32(argNode.value);
      return B.litF32(argNode.value);
    }
    return B.cast(name as WgslType, args[0]);
  }

  // Constructor: vec4(a,b,c,d), vec2i(x,y), etc.
  if (name in CONSTRUCT_MAP) return B.construct(CONSTRUCT_MAP[name], args);

  // Builtin math: sin(x), cos(x), etc.
  if (BUILTIN_NAMES.has(name)) return B.callBuiltin(name as BuiltinMathFunc, args);

  return errorExpr(ctx, node, `Unknown function call: ${name}`);
}

/** Try to walk `const name = atomicAdd(...)` as AtomicOpField/Scalar with assignResultTo.
 * Returns null if the init expression is not an atomic call. */
function tryWalkAtomicAssignResult(
  init: ESTree.Expression | null | undefined,
  name: string,
  ctx: WalkContext,
): StatementIR | null {
  if (!init || init.type !== 'CallExpression' || init.callee.type !== 'Identifier') return null;
  const atomicOp = ATOMIC_FUNC_TO_OP[init.callee.name];
  if (!atomicOp) return null;
  const symbolId = extractStringArg(init.arguments[0] as ESTree.Expression, ctx, init.callee.name);
  if (init.arguments.length === 3) {
    const index = walkExpr(init.arguments[1] as ESTree.Expression, ctx);
    const value = walkExpr(init.arguments[2] as ESTree.Expression, ctx);
    return B.atomicOpField(atomicOp, symbolId, index, value, name);
  }
  const value = walkExpr(init.arguments[1] as ESTree.Expression, ctx);
  return B.atomicOpScalar(atomicOp, symbolId, value, name);
}

/** DSL function name → AtomicOp enum value */
const ATOMIC_FUNC_TO_OP: Record<string, AtomicOp> = {
  atomicAdd: 'Add', atomicSub: 'Sub',
  atomicMax: 'Max', atomicMin: 'Min',
  atomicAnd: 'And', atomicOr: 'Or', atomicXor: 'Xor',
  atomicExchange: 'Exchange',
};

/** Extract a string literal argument (for textureId, samplerId references) */
function extractStringArg(node: ESTree.Expression, ctx: WalkContext, funcName: string): string {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  addError(ctx, node, `${funcName}() first argument must be a string literal`);
  return '';
}

/** Map GlobalSpec.type to WgslType */
const GLOBAL_TYPE_TO_WGSL: Record<string, WgslType> = {
  f32: 'f32', u32: 'u32', i32: 'i32',
  vec2: 'vec2<f32>', vec3: 'vec3<f32>', vec4: 'vec4<f32>',
  mat4x4: 'mat4x4<f32>',
};

/** Infer WGSL type from an ExprIR value — used for Var dataType derivation.
 * The Rust translator requires a concrete dataType on every Var statement.
 * Throws on unhandled expression types — no silent defaults. */
function inferDataType(expr: ExprIR, manifest: MemoryManifest): WgslType {
  switch (expr.type) {
    case 'LiteralF32': return 'f32';
    case 'LiteralU32': return 'u32';
    case 'LiteralI32': return 'i32';
    case 'LiteralBool': return 'bool';
    case 'Cast': return expr.targetType;
    case 'Construct': return expr.dataType;
    case 'Intrinsic': return 'u32';
    case 'CallBuiltin': return 'f32'; // all math builtins return f32
    case 'LoadGlobal': {
      const spec = manifest.globals[expr.symbolId];
      return GLOBAL_TYPE_TO_WGSL[spec?.type ?? 'f32'] ?? 'f32';
    }
    case 'LoadField': return 'f32';   // domain fields are f32
    case 'LoadScalar': {
      const spec = manifest.arenaScalars[expr.symbolId];
      return GLOBAL_TYPE_TO_WGSL[spec?.type ?? 'f32'] ?? 'f32';
    }
    case 'TextureLoad': return 'vec4<f32>';
    case 'TextureSample': return 'vec4<f32>';
    case 'AtomicLoadField': return 'u32';
    case 'AtomicLoadScalar': return 'u32';
    case 'Swizzle': return 'f32'; // single-component swizzle produces scalar
    case 'IndexAccess': return 'f32';
    case 'UnaryOp':
      if (expr.op === '!') return 'bool';
      return inferDataType(expr.expr, manifest); // - and ~ preserve operand type
    case 'BinaryOp': {
      if (expr.op === '==' || expr.op === '!=' || expr.op === '<' || expr.op === '>' || expr.op === '<=' || expr.op === '>=') return 'bool';
      if (expr.op === '&&' || expr.op === '||') return 'bool';
      // mat4x4 * vec4 → vec4
      if (expr.op === '*') {
        const leftType = inferDataType(expr.left, manifest);
        if (leftType === 'mat4x4<f32>') return 'vec4<f32>';
      }
      return inferDataType(expr.left, manifest); // arithmetic/bitwise preserves operand type
    }
    case 'VarRef':
      throw new Error(`inferDataType: cannot determine type of VarRef('${expr.name}') — Var declarations with VarRef initializers need explicit type annotations`);
    default:
      throw new Error(`inferDataType: unhandled expression type '${(expr as ExprIR).type}'`);
  }
}

/** Walk expression in index context — bare numeric literals become LiteralU32 */
function walkExprAsIndex(node: ESTree.Expression, ctx: WalkContext): ExprIR {
  if (node.type === 'Literal' && typeof node.value === 'number') return B.litU32(node.value);
  return walkExpr(node, ctx);
}

// ---------------------------------------------------------------------------
// $-prefixed chain resolution
// ---------------------------------------------------------------------------

interface ResolvedChain {
  kind: 'global' | 'scalar' | 'domainField' | 'domainActive' | 'intrinsic';
  symbolId: string;
}

function tryResolveDollarChain(node: ESTree.Expression, ctx: WalkContext): ResolvedChain | null {
  if (node.type !== 'MemberExpression') return null;

  // Support both dot notation ($global.X → 'sys:X') and bracket notation
  // with string literal ($global['cam:center_x'] → 'cam:center_x' as-is).
  // Bracket notation passes the string through as a fully-qualified symbol ID.
  let prop: string;
  let fullyQualified = false;
  if (!node.computed) {
    prop = (node.property as ESTree.Identifier).name;
  } else if (node.property.type === 'Literal' && typeof (node.property as ESTree.Literal).value === 'string') {
    prop = (node.property as ESTree.Literal).value as string;
    fullyQualified = true;
  } else {
    return null;
  }

  // Simple one-level chains: $global.X, $scalar.X, $thread.x, $instance.index, $vertex.index
  if (node.object.type === 'Identifier') {
    const rootName = node.object.name;
    const rule = DOLLAR_CHAIN_RULES[rootName as keyof typeof DOLLAR_CHAIN_RULES];
    if (rule) {
      // Bracket notation with string literal passes through as fully-qualified symbol ID
      const symbolId = fullyQualified ? prop : rule.resolve(prop);
      const kindMap: Record<string, ResolvedChain['kind']> = {
        LoadGlobal: 'global',
        LoadScalar: 'scalar',
        Intrinsic: 'intrinsic',
      };
      return { kind: kindMap[rule.irType], symbolId };
    }
  }

  // $domains.D.PROP — two-level chain
  if (
    node.object.type === 'MemberExpression' &&
    !node.object.computed &&
    node.object.object.type === 'Identifier' &&
    node.object.object.name === '$domains'
  ) {
    const domainId = (node.object.property as ESTree.Identifier).name;

    // $domains.D.$active → domain's activeLanesSymbol
    if (prop === '$active') {
      const domain = ctx.manifest.domains[domainId];
      if (!domain) {
        addError(ctx, node, `Unknown domain: ${domainId}`);
        return { kind: 'domainActive', symbolId: '' };
      }
      return { kind: 'domainActive', symbolId: domain.activeLanesSymbol };
    }

    // $domains.D.F → domain field
    return { kind: 'domainField', symbolId: `${domainId}:${prop}` };
  }

  return null;
}
