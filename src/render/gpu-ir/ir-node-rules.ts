/**
 * GPU-IR node rules: single source of truth for IR structure tables,
 * DSL symbol mappings, operator tables, and generic walker.
 *
 * [LAW:one-source-of-truth] Every IR ↔ DSL mapping lives here.
 * Both forward (walker) and backward (future reverse translator) read these tables.
 *
 * Consumed by:
 *  - boundary-contract.ts (validation walker)
 *  - deps.ts (dependency collection)
 *  - walker-acorn.ts (Phase 2 — DSL compiler)
 *  - future reverse translator (fold over same tables)
 */

import type { ExprIR, StatementIR, BuiltinMathFunc, BinaryOp, WgslType } from '../rust/boundary-contract';

// ===========================================================================
// Group A — IR node structure tables
// ===========================================================================
// Moved from boundary-contract.ts. Exhaustive Record types enforce that every
// IR variant has an entry — adding a new variant without a rule is a compile error.

/** Which manifest collection a symbolId/textureId/samplerId must exist in */
export type RefCheck = 'global' | 'scalar' | 'field' | 'atomicField' | 'texture' | 'sampler';

export interface ExprRule {
  /** Fields that reference manifest symbols: [fieldName, checkKind] */
  readonly refs: readonly (readonly [string, RefCheck])[];
  /** Field names containing a single child ExprIR */
  readonly children: readonly string[];
  /** Field names containing an ExprIR[] array */
  readonly childArrays: readonly string[];
  /** Optional special validation */
  readonly special?: 'builtinArgCount' | 'fragmentOnly';
}

export interface StmtRule {
  readonly refs: readonly (readonly [string, RefCheck])[];
  readonly children: readonly string[];
  readonly childArrays: readonly string[];
  /** Field names containing a single child StatementIR */
  readonly stmtChildren: readonly string[];
  /** Field names containing a StatementIR[] array */
  readonly stmtChildArrays: readonly string[];
  /** Field names containing a Record<string, ExprIR> */
  readonly exprRecords: readonly string[];
}

/** Expected arg count for each builtin math function */
export const BUILTIN_ARG_COUNTS: Record<BuiltinMathFunc, number> = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, atan2: 2,
  exp: 1, log: 1, pow: 2, sqrt: 1,
  abs: 1, min: 2, max: 2, clamp: 3, mix: 3, step: 2, smoothstep: 3,
  sign: 1, fract: 1, ceil: 1, floor: 1, round: 1,
  length: 1, distance: 2, dot: 2, cross: 2, normalize: 1, reflect: 2, refract: 3,
  fwidth: 1, dpdx: 1, dpdy: 1,
  hash_u32: 1, noise_simplex_2d: 1, noise_simplex_3d: 1,
};

export const FRAGMENT_ONLY_BUILTINS = new Set<string>(['dpdx', 'dpdy', 'fwidth']);

// Exhaustive: Record<ExprIR['type'], ExprRule> — adding a variant without a rule is a compile error
export const EXPR_RULES: Record<ExprIR['type'], ExprRule> = {
  LiteralF32:      { refs: [], children: [], childArrays: [] },
  LiteralU32:      { refs: [], children: [], childArrays: [] },
  LiteralI32:      { refs: [], children: [], childArrays: [] },
  LiteralBool:     { refs: [], children: [], childArrays: [] },
  VarRef:          { refs: [], children: [], childArrays: [] },
  Intrinsic:       { refs: [], children: [], childArrays: [] },
  LoadGlobal:      { refs: [['symbolId', 'global']], children: [], childArrays: [] },
  LoadScalar:      { refs: [['symbolId', 'scalar']], children: [], childArrays: [] },
  LoadField:       { refs: [['symbolId', 'field']], children: ['index'], childArrays: [] },
  AtomicLoadField: { refs: [['symbolId', 'atomicField']], children: ['index'], childArrays: [] },
  AtomicLoadScalar:{ refs: [['symbolId', 'scalar']], children: [], childArrays: [] },
  TextureLoad:     { refs: [['textureId', 'texture']], children: ['coords'], childArrays: [] },
  TextureSample:   { refs: [['textureId', 'texture'], ['samplerId', 'sampler']], children: ['uv'], childArrays: [] },
  BinaryOp:        { refs: [], children: ['left', 'right'], childArrays: [] },
  UnaryOp:         { refs: [], children: ['expr'], childArrays: [] },
  Cast:            { refs: [], children: ['expr'], childArrays: [] },
  Swizzle:         { refs: [], children: ['source'], childArrays: [] },
  IndexAccess:     { refs: [], children: ['target', 'index'], childArrays: [] },
  Construct:       { refs: [], children: [], childArrays: ['args'] },
  CallBuiltin:     { refs: [], children: [], childArrays: ['args'], special: 'builtinArgCount' },
};

// Exhaustive: Record<StatementIR['type'], StmtRule>
export const STMT_RULES: Record<StatementIR['type'], StmtRule> = {
  Let:             { refs: [], children: ['value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  Var:             { refs: [], children: ['value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  Assign:          { refs: [], children: ['target', 'value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  StoreGlobal:     { refs: [['symbolId', 'global']], children: ['value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  StoreScalar:     { refs: [['symbolId', 'scalar']], children: ['value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  StoreField:      { refs: [['symbolId', 'field']], children: ['index', 'value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  TextureStore:    { refs: [['textureId', 'texture']], children: ['coords', 'value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  If:              { refs: [], children: ['condition'], childArrays: [], stmtChildren: [], stmtChildArrays: ['accept', 'reject'], exprRecords: [] },
  For:             { refs: [], children: ['condition'], childArrays: [], stmtChildren: ['init', 'update'], stmtChildArrays: ['body'], exprRecords: [] },
  Break:           { refs: [], children: [], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  Continue:        { refs: [], children: [], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  AtomicOpField:   { refs: [['symbolId', 'atomicField']], children: ['index', 'value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  AtomicOpScalar:  { refs: [['symbolId', 'scalar']], children: ['value'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: [] },
  ReturnVertex:    { refs: [], children: ['position'], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: ['varyings'] },
  ReturnFragment:  { refs: [], children: [], childArrays: [], stmtChildren: [], stmtChildArrays: [], exprRecords: ['outputs'] },
};

// ===========================================================================
// Group B — DSL symbol mappings (bidirectional)
// ===========================================================================
// Moved from walker.ts. Forward direction used by walker, inverse by future
// reverse translator.

export const BUILTIN_NAMES = new Set<string>([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'exp', 'log', 'pow', 'sqrt',
  'abs', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
  'sign', 'fract', 'ceil', 'floor', 'round',
  'length', 'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract',
  'fwidth', 'dpdx', 'dpdy',
  'hash_u32', 'noise_simplex_2d', 'noise_simplex_3d',
]);

export const CAST_NAMES = new Set(['f32', 'u32', 'i32']);

export const CONSTRUCT_MAP: Record<string, WgslType> = {
  vec2: 'vec2<f32>', vec3: 'vec3<f32>', vec4: 'vec4<f32>',
  vec2i: 'vec2<i32>', vec3i: 'vec3<i32>', vec4i: 'vec4<i32>',
  vec2u: 'vec2<u32>', vec3u: 'vec3<u32>', vec4u: 'vec4<u32>',
  mat4x4: 'mat4x4<f32>',
};

/** Math constants — inlined as LiteralF32 by walker, emitted as names by reverse */
export const MATH_CONSTANTS: Record<string, number> = {
  PI:      3.141592653589793,
  TAU:     6.283185307179586,
  HALF_PI: 1.5707963267948966,
  E:       2.718281828459045,
  SQRT2:   1.4142135623730951,
  PHI:     1.618033988749895,
};

/** Inverse of MATH_CONSTANTS — value → name (for reverse translator) */
export const MATH_CONSTANTS_INVERSE: Map<number, string> = new Map(
  Object.entries(MATH_CONSTANTS).map(([name, value]) => [value, name]),
);

/** Inverse of CONSTRUCT_MAP — WgslType → DSL constructor name */
export const CONSTRUCT_INVERSE: Record<string, string> = Object.entries(CONSTRUCT_MAP)
  .reduce<Record<string, string>>((acc, [name, wgsl]) => { acc[wgsl] = name; return acc; }, {});

// ===========================================================================
// Group C — $-chain resolution (declarative)
// ===========================================================================
// Extracted from walker.ts tryResolveDollarChain. The simple single-property
// chains are table-driven. $domains chains need manifest context and stay
// procedural in the walker.

const THREAD_MAP: Record<string, string> = {
  x: 'global_invocation_id.x', y: 'global_invocation_id.y', z: 'global_invocation_id.z',
};
const INSTANCE_MAP: Record<string, string> = { index: 'instance_index' };
const VERTEX_MAP: Record<string, string> = { index: 'vertex_index' };

export const DOLLAR_CHAIN_RULES = {
  $global:   { resolve: (prop: string) => `sys:${prop}`,    irType: 'LoadGlobal'  as const, field: 'symbolId' as const },
  $scalar:   { resolve: (prop: string) => `sys:${prop}`,    irType: 'LoadScalar'  as const, field: 'symbolId' as const },
  $thread:   { resolve: (prop: string) => { const v = THREAD_MAP[prop]; if (!v) throw new Error(`Unknown $thread property: ${prop}`); return v; }, irType: 'Intrinsic' as const, field: 'name' as const },
  $instance: { resolve: (prop: string) => { const v = INSTANCE_MAP[prop]; if (!v) throw new Error(`Unknown $instance property: ${prop}`); return v; }, irType: 'Intrinsic' as const, field: 'name' as const },
  $vertex:   { resolve: (prop: string) => { const v = VERTEX_MAP[prop]; if (!v) throw new Error(`Unknown $vertex property: ${prop}`); return v; }, irType: 'Intrinsic' as const, field: 'name' as const },
} as const;

/** Names that are $-prefixed well-known roots — never treated as free variables */
export const WELL_KNOWN_ROOTS = new Set(['$global', '$scalar', '$domains', '$thread', '$instance', '$vertex']);

// ===========================================================================
// Group D — Operator mappings (bidirectional, with precedence)
// ===========================================================================

/** ESTree operator string → IR BinaryOp (only for non-identity mappings) */
export const ESTREE_TO_BINOP: Record<string, BinaryOp> = {
  '===': '==', '!==': '!=',
};

/** IR BinaryOp → JavaScript operator string (for reverse translation) */
export const BINOP_TO_JS: Record<BinaryOp, string> = {
  '==': '===', '!=': '!==',
  '+': '+', '-': '-', '*': '*', '/': '/', '%': '%',
  '<': '<', '>': '>', '<=': '<=', '>=': '>=',
  '&&': '&&', '||': '||',
  '&': '&', '|': '|', '^': '^', '<<': '<<', '>>': '>>',
};

/** Operator precedence for parenthesization in reverse translation */
export const BINOP_PRECEDENCE: Record<BinaryOp, number> = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5,
  '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
  '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};

// ===========================================================================
// Generic IR walker (observe + accumulate pattern)
// ===========================================================================
// For validation and dependency collection. The future reverse translator
// needs a fold pattern (children return strings, parent composes) — it will
// be its own recursive function reading the same tables, not a walkIR visitor.

export interface IRVisitor {
  onExpr?: (expr: ExprIR, rule: ExprRule, path: readonly (string | number)[]) => void;
  onStmt?: (stmt: StatementIR, rule: StmtRule, path: readonly (string | number)[]) => void;
}

/**
 * Walk a StatementIR[] tree in pre-order, calling visitor callbacks.
 * Recursion is driven entirely by EXPR_RULES/STMT_RULES tables — no switch/case.
 */
export function walkIR(
  stmts: readonly StatementIR[],
  visitor: IRVisitor,
  basePath: readonly (string | number)[] = [],
): void {
  function walkExpr(expr: ExprIR, path: readonly (string | number)[]): void {
    const rule = EXPR_RULES[expr.type];
    visitor.onExpr?.(expr, rule, path);

    const node = expr as Record<string, unknown>;
    for (const field of rule.children) {
      const child = node[field];
      if (child !== undefined) walkExpr(child as ExprIR, [...path, field]);
    }
    for (const field of rule.childArrays) {
      const arr = node[field] as readonly ExprIR[];
      for (let i = 0; i < arr.length; i++) walkExpr(arr[i], [...path, field, i]);
    }
  }

  function walkStmt(stmt: StatementIR, path: readonly (string | number)[]): void {
    const rule = STMT_RULES[stmt.type];
    visitor.onStmt?.(stmt, rule, path);

    const node = stmt as Record<string, unknown>;

    // Expression children
    for (const field of rule.children) {
      const child = node[field];
      if (child !== undefined) walkExpr(child as ExprIR, [...path, field]);
    }
    for (const field of rule.childArrays) {
      const arr = node[field] as readonly ExprIR[];
      for (let i = 0; i < arr.length; i++) walkExpr(arr[i], [...path, field, i]);
    }

    // Statement children
    for (const field of rule.stmtChildren) {
      const child = node[field];
      if (child !== undefined) walkStmt(child as StatementIR, [...path, field]);
    }
    for (const field of rule.stmtChildArrays) {
      const arr = node[field] as readonly StatementIR[];
      for (let i = 0; i < arr.length; i++) walkStmt(arr[i], [...path, field, i]);
    }

    // Expression records (e.g. varyings, outputs)
    for (const field of rule.exprRecords) {
      const rec = node[field] as Record<string, ExprIR>;
      for (const [k, v] of Object.entries(rec)) walkExpr(v, [...path, field, k]);
    }
  }

  for (let i = 0; i < stmts.length; i++) walkStmt(stmts[i], [...basePath, i]);
}
