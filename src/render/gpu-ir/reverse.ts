/**
 * GPU-IR DSL: Reverse translator (IR → DSL source text).
 *
 * Produces syntactically valid DSL source from ExprIR/StatementIR trees.
 * Roundtrip guarantee: IR → DSL → IR produces identical IR.
 *
 * [LAW:one-source-of-truth] All symbol/operator tables from ir-node-rules.
 */

import type { ExprIR, StatementIR, BinaryOp } from '../rust/boundary-contract';
import {
  CONSTRUCT_INVERSE,
  BINOP_TO_JS,
  BINOP_PRECEDENCE,
  DOLLAR_CHAIN_RULES,
  MATH_CONSTANTS_INVERSE,
} from './ir-node-rules';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function stmtsToSource(stmts: readonly StatementIR[], indent = 0): string {
  return stmts.map(s => stmtToSource(s, indent)).join('\n');
}

export function exprToSource(expr: ExprIR): string {
  return emitExpr(expr, 0);
}

// ---------------------------------------------------------------------------
// Inverse $-chain tables (IR symbolId → DSL accessor)
// ---------------------------------------------------------------------------

// Invert DOLLAR_CHAIN_RULES: for each rule, build symbolId → DSL string
const INTRINSIC_TO_DSL: Record<string, string> = {};
const GLOBAL_PREFIX = 'sys:';
const SCALAR_PREFIX = 'sys:';

// Build intrinsic reverse map from DOLLAR_CHAIN_RULES
for (const [root, rule] of Object.entries(DOLLAR_CHAIN_RULES)) {
  if (rule.irType === 'Intrinsic') {
    // Try known properties to build reverse map
    const knownProps: Record<string, string[]> = {
      $thread: ['x', 'y', 'z'],
      $instance: ['index'],
      $vertex: ['index'],
    };
    for (const prop of knownProps[root] ?? []) {
      try {
        const symbolId = rule.resolve(prop);
        INTRINSIC_TO_DSL[symbolId] = `${root}.${prop}`;
      } catch { /* skip invalid props */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Statement emission
// ---------------------------------------------------------------------------

function stmtToSource(stmt: StatementIR, indent: number): string {
  const pad = '  '.repeat(indent);

  switch (stmt.type) {
    case 'Let':
      return `${pad}const ${stmt.name} = ${emitExpr(stmt.value, 0)};`;

    case 'Var': {
      const init = stmt.value ? ` = ${emitExpr(stmt.value, 0)}` : '';
      return `${pad}let ${stmt.name}${init};`;
    }

    case 'Assign':
      return `${pad}${emitExpr(stmt.target, 0)} = ${emitExpr(stmt.value, 0)};`;

    case 'StoreGlobal':
      return `${pad}$global.${stmt.symbolId.replace('sys:', '')} = ${emitExpr(stmt.value, 0)};`;

    case 'StoreScalar':
      return `${pad}${emitScalarAccess(stmt.symbolId)} = ${emitExpr(stmt.value, 0)};`;

    case 'StoreField':
      return `${pad}${emitFieldAccess(stmt.symbolId)}[${emitExpr(stmt.index, 0)}] = ${emitExpr(stmt.value, 0)};`;

    case 'TextureStore':
      return `${pad}textureStore('${stmt.textureId}', ${emitExpr(stmt.coords, 0)}, ${emitExpr(stmt.value, 0)});`;

    case 'If': {
      const lines = [`${pad}if (${emitExpr(stmt.condition, 0)}) {`];
      lines.push(stmtsToSource(stmt.accept, indent + 1));
      if (stmt.reject.length > 0) {
        lines.push(`${pad}} else {`);
        lines.push(stmtsToSource(stmt.reject, indent + 1));
      }
      lines.push(`${pad}}`);
      return lines.join('\n');
    }

    case 'For': {
      const init = stmtToSource(stmt.init, 0).replace(/;$/, '');
      const cond = emitExpr(stmt.condition, 0);
      const update = stmtToSource(stmt.update, 0).replace(/;$/, '');
      const lines = [`${pad}for (${init}; ${cond}; ${update}) {`];
      lines.push(stmtsToSource(stmt.body, indent + 1));
      lines.push(`${pad}}`);
      return lines.join('\n');
    }

    case 'Break': return `${pad}break;`;
    case 'Continue': return `${pad}continue;`;

    case 'AtomicOpField': {
      const fnName = `atomic${stmt.op}`;
      const result = stmt.assignResultTo ? `const ${stmt.assignResultTo} = ` : '';
      return `${pad}${result}${fnName}('${stmt.symbolId}', ${emitExpr(stmt.index, 0)}, ${emitExpr(stmt.value, 0)});`;
    }

    case 'AtomicOpScalar': {
      const fnName = `atomic${stmt.op}`;
      const result = stmt.assignResultTo ? `const ${stmt.assignResultTo} = ` : '';
      return `${pad}${result}${fnName}('${stmt.symbolId}', ${emitExpr(stmt.value, 0)});`;
    }

    case 'ReturnVertex': {
      const varyingEntries = Object.entries(stmt.varyings);
      const varyingsStr = varyingEntries.length === 0
        ? '{}'
        : `{ ${varyingEntries.map(([k, v]) => `${k}: ${emitExpr(v, 0)}`).join(', ')} }`;
      return `${pad}return vertex(${emitExpr(stmt.position, 0)}, ${varyingsStr});`;
    }

    case 'ReturnFragment': {
      const outputEntries = Object.entries(stmt.outputs);
      const outputsStr = `{ ${outputEntries.map(([k, v]) => {
        const valStr = emitExpr(v, 0);
        return valStr === k ? k : `${k}: ${valStr}`;
      }).join(', ')} }`;
      return `${pad}return fragment(${outputsStr});`;
    }
  }
}

// ---------------------------------------------------------------------------
// Expression emission
// ---------------------------------------------------------------------------

/**
 * Emit an expression. `parentPrec` is the precedence of the parent operator;
 * if this expression's precedence is lower, wrap in parens.
 */
function emitExpr(expr: ExprIR, parentPrec: number): string {
  switch (expr.type) {
    case 'LiteralF32': return emitConstant(expr.value) ?? emitFloat(expr.value);
    case 'LiteralU32': return `u32(${expr.value})`;
    case 'LiteralI32': return `i32(${expr.value})`;
    case 'LiteralBool': return String(expr.value);
    case 'VarRef': return expr.name;

    case 'Intrinsic': {
      const dsl = INTRINSIC_TO_DSL[expr.name];
      if (dsl) return dsl;
      throw new Error(`No DSL mapping for intrinsic: ${expr.name}`);
    }

    case 'LoadGlobal': return emitGlobalAccess(expr.symbolId);
    case 'LoadScalar': return emitScalarAccess(expr.symbolId);

    case 'LoadField':
      return `${emitFieldAccess(expr.symbolId)}[${emitExpr(expr.index, 0)}]`;

    case 'AtomicLoadField':
      return `atomicLoad('${expr.symbolId}', ${emitExpr(expr.index, 0)})`;

    case 'AtomicLoadScalar':
      return `atomicLoad('${expr.symbolId}')`;

    case 'BinaryOp': {
      const prec = BINOP_PRECEDENCE[expr.op] ?? 0;
      const jsOp = BINOP_TO_JS[expr.op] ?? expr.op;
      const inner = `${emitExpr(expr.left, prec)} ${jsOp} ${emitExpr(expr.right, prec + 1)}`;
      return prec < parentPrec ? `(${inner})` : inner;
    }

    case 'UnaryOp':
      return `${expr.op}${emitExpr(expr.expr, 99)}`;

    case 'Cast':
      return `${expr.targetType}(${emitExpr(expr.expr, 0)})`;

    case 'Construct': {
      const name = CONSTRUCT_INVERSE[expr.dataType];
      if (!name) throw new Error(`No DSL constructor for: ${expr.dataType}`);
      return `${name}(${expr.args.map(a => emitExpr(a, 0)).join(', ')})`;
    }

    case 'CallBuiltin':
      return `${expr.func}(${expr.args.map(a => emitExpr(a, 0)).join(', ')})`;

    case 'Swizzle':
      return `${emitExpr(expr.source, 99)}.${expr.mask}`;

    case 'IndexAccess':
      return `${emitExpr(expr.target, 99)}[${emitExpr(expr.index, 0)}]`;

    case 'TextureLoad':
      return expr.mipLevel
        ? `textureLoad('${expr.textureId}', ${emitExpr(expr.coords, 0)}, ${emitExpr(expr.mipLevel, 0)})`
        : `textureLoad('${expr.textureId}', ${emitExpr(expr.coords, 0)})`;

    case 'TextureSample':
      return `textureSample('${expr.textureId}', '${expr.samplerId}', ${emitExpr(expr.uv, 0)})`;

    // Semantic nodes — ApplyVP is stripped (auto-injected), ApplyTransform2D emits inner position
    // (the transform declaration is reconstructed at the draw-call level by reverse-payload.ts)
    case 'ApplyVP':
      return emitExpr(expr.position, parentPrec);

    case 'ApplyTransform2D':
      return emitExpr(expr.position, parentPrec);
  }
}

// ---------------------------------------------------------------------------
// Symbol access emission (inverse of $-chain resolution)
// ---------------------------------------------------------------------------

function emitGlobalAccess(symbolId: string): string {
  if (symbolId.startsWith(GLOBAL_PREFIX)) {
    return `$global.${symbolId.slice(GLOBAL_PREFIX.length)}`;
  }
  return `$global["${symbolId}"]`;
}

function emitScalarAccess(symbolId: string): string {
  if (symbolId.startsWith(SCALAR_PREFIX)) {
    return `$scalar.${symbolId.slice(SCALAR_PREFIX.length)}`;
  }
  return `$scalar["${symbolId}"]`;
}

function emitFieldAccess(symbolId: string): string {
  const colonIdx = symbolId.indexOf(':');
  if (colonIdx === -1) return `$domains["${symbolId}"]`;
  const domain = symbolId.slice(0, colonIdx);
  const field = symbolId.slice(colonIdx + 1);
  return `$domains.${domain}.${field}`;
}

// ---------------------------------------------------------------------------
// Numeric formatting
// ---------------------------------------------------------------------------

/** Return named constant if value matches exactly, else undefined. */
function emitConstant(value: number): string | undefined {
  return MATH_CONSTANTS_INVERSE.get(value);
}

function emitFloat(value: number): string {
  if (Object.is(value, -0)) return '-0.0';
  if (!Number.isFinite(value)) return String(value);
  const s = String(value);
  // Ensure it looks like a float (has decimal point or is in scientific notation)
  if (s.includes('.') || s.includes('e') || s.includes('E')) return s;
  return s + '.0';
}
