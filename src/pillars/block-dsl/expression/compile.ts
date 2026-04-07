/**
 * src/pillars/expression/compile.ts
 *
 * Compiles a parsed expression DSL Program against an input SourceBundle.
 * Produces a map from assigned field names to their ExprIR values.
 *
 * Compilation rules (derived from design-docs/B2-source-bundle/01-engineering-design.md §5.1):
 *
 *   - Number literal → `litF32(value)`
 *   - FieldRef (unqualified) → the corresponding ExprIR from the primary bundle
 *   - FieldRef (qualified, e.g. `clock.time`) → the corresponding ExprIR
 *     from `inputBundles[bundle]`
 *   - BinaryExpr → `binop(op, left, right)`
 *   - UnaryExpr → `unaryOp('-', operand)`
 *   - CallExpr → `callBuiltin(func, args)` where func is validated against
 *     the BuiltinMathFunc set from boundary-contract.ts
 *
 * Validation:
 *   - Each LHS field in an assignment must exist in the primary bundle.
 *     Writes always target the primary bundle — assignment LHS is always
 *     unqualified (the parser's `parseAssignment` consumes a bare identifier,
 *     never a `bundle.field` form). Secondary bundles are strictly read-only.
 *   - Each RHS FieldRef must resolve: an unqualified ref must exist in the
 *     primary bundle; a qualified ref must name a known bundle and a field
 *     that exists in it.
 *   - Each function call must target a recognized BuiltinMathFunc.
 *   - Multiple assignments to the same field are an error (likely a typo).
 *
 * Errors accumulate — the compiler does not short-circuit on the first
 * failure, so multiple problems in one expression show up together.
 */

import type { BuiltinMathFunc, ExprIR } from '../../../render/rust/boundary-contract';
import { binop, callBuiltin, litF32, unaryOp } from '../../../render/gpu-ir/ir-builders';
import type { Expr, Program } from './ast';
import type { SourceBundle } from '../types';
import { parse } from './parse';

/**
 * The canonical set of builtin math functions callable from the DSL.
 * Mirrors BuiltinMathFuncSchema in boundary-contract.ts.
 */
const BUILTIN_FUNCS: ReadonlySet<BuiltinMathFunc> = new Set<BuiltinMathFunc>([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'exp', 'log', 'pow', 'sqrt',
  'abs', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
  'sign', 'fract', 'ceil', 'floor', 'round',
  'length', 'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract',
  'fwidth', 'dpdx', 'dpdy',
  'hash_u32', 'noise_simplex_2d', 'noise_simplex_3d',
]);

export interface CompileError {
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

export interface CompileProgramResult {
  /** Map from field name to compiled ExprIR. Only successful assignments appear. */
  readonly assignments: ReadonlyMap<string, ExprIR>;
  readonly errors: readonly CompileError[];
}

export function compileProgram(
  program: Program,
  primaryBundle: SourceBundle,
  inputBundles?: Readonly<Record<string, SourceBundle>>,
): CompileProgramResult {
  // Build the full bundle scope. The primary bundle is always available
  // under the `primary` key (even if `inputBundles` already contains it —
  // in that case the values must match, which they do because the walker
  // populates `inputBundles['primary']` from the same source that the
  // caller passes as `primaryBundle`). If the caller passes only the
  // primary bundle, we still allow `primary.field` references.
  const bundleScope: Record<string, SourceBundle> = { ...inputBundles, primary: primaryBundle };

  const assignments = new Map<string, ExprIR>();
  const errors: CompileError[] = [];
  const availableFields = () => Object.keys(primaryBundle).sort().join(', ');

  for (const assignment of program.assignments) {
    // LHS validation: field must exist in the primary bundle.
    // (The parser's parseAssignment consumes a bare identifier for the LHS,
    // so there is structurally no way to write `clock.time = ...`. Writes
    // always target the primary bundle. [LAW:single-enforcer])
    if (!(assignment.field in primaryBundle)) {
      errors.push({
        message:
          `cannot assign to '${assignment.field}': field does not exist in the primary bundle. ` +
          `Available fields: ${availableFields() || '(none)'}`,
        line: assignment.line,
        column: assignment.column,
      });
      continue;
    }

    // Duplicate assignment detection.
    if (assignments.has(assignment.field)) {
      errors.push({
        message: `duplicate assignment to field '${assignment.field}'`,
        line: assignment.line,
        column: assignment.column,
      });
      continue;
    }

    const compiled = compileExpr(assignment.value, bundleScope, errors);
    if (compiled) {
      assignments.set(assignment.field, compiled);
    }
  }

  return { assignments, errors };
}

function compileExpr(
  expr: Expr,
  bundleScope: Readonly<Record<string, SourceBundle>>,
  errors: CompileError[],
): ExprIR | null {
  switch (expr.kind) {
    case 'Number':
      return litF32(expr.value);

    case 'FieldRef': {
      const bundleName = expr.bundle ?? 'primary';
      const bundle = bundleScope[bundleName];
      if (bundle === undefined) {
        const known = Object.keys(bundleScope).sort().join(', ') || '(none)';
        errors.push({
          message:
            `unknown bundle '${bundleName}'. ` +
            `Available bundles: ${known}`,
          line: expr.line,
          column: expr.column,
        });
        return null;
      }
      const bundleExpr = bundle[expr.name];
      if (bundleExpr === undefined) {
        const qualified = expr.bundle ? `${expr.bundle}.${expr.name}` : expr.name;
        const known = Object.keys(bundle).sort().join(', ') || '(none)';
        errors.push({
          message:
            `unknown field '${qualified}'. ` +
            `Available fields in bundle '${bundleName}': ${known}`,
          line: expr.line,
          column: expr.column,
        });
        return null;
      }
      return bundleExpr;
    }

    case 'BinaryExpr': {
      const left = compileExpr(expr.left, bundleScope, errors);
      const right = compileExpr(expr.right, bundleScope, errors);
      if (!left || !right) return null;
      return binop(expr.op, left, right);
    }

    case 'UnaryExpr': {
      const inner = compileExpr(expr.operand, bundleScope, errors);
      if (!inner) return null;
      return unaryOp('-', inner);
    }

    case 'CallExpr': {
      if (!BUILTIN_FUNCS.has(expr.func as BuiltinMathFunc)) {
        errors.push({
          message:
            `unknown function '${expr.func}'. ` +
            `Expected one of: ${[...BUILTIN_FUNCS].sort().join(', ')}`,
          line: expr.line,
          column: expr.column,
        });
        return null;
      }
      const args: ExprIR[] = [];
      let anyFailed = false;
      for (const arg of expr.args) {
        const compiled = compileExpr(arg, bundleScope, errors);
        if (!compiled) {
          anyFailed = true;
          continue;
        }
        args.push(compiled);
      }
      if (anyFailed) return null;
      return callBuiltin(expr.func as BuiltinMathFunc, args);
    }
  }
}

/**
 * Utility that runs parse + compile in one shot and returns a new
 * SourceBundle = { ...primaryBundle, ...assignments }. Throws on any parse
 * or compile error with a formatted message listing all issues.
 *
 * The `primaryBundle` is what determines the output structure — the
 * returned bundle has the same fields as the primary. The `inputBundles`
 * argument (optional) carries all bundles visible to the DSL, keyed by
 * their input-slot name. Qualified references like `clock.time` resolve
 * against this map. Unqualified references default to the primary bundle.
 *
 * ExpressionModifier uses this directly. Tests can use the lower-level
 * compileProgram + parse pair for finer-grained error inspection.
 */
export function applyExpression(
  expression: string,
  primaryBundle: SourceBundle,
  inputBundles?: Readonly<Record<string, SourceBundle>>,
): SourceBundle {
  const parseResult = parse(expression);
  if (parseResult.errors.length > 0) {
    const formatted = parseResult.errors
      .map((e) => `  line ${e.line} col ${e.column}: ${e.message}`)
      .join('\n');
    throw new Error(`Expression parse errors:\n${formatted}`);
  }

  const compileResult = compileProgram(parseResult.program, primaryBundle, inputBundles);
  if (compileResult.errors.length > 0) {
    const formatted = compileResult.errors
      .map((e) => `  line ${e.line} col ${e.column}: ${e.message}`)
      .join('\n');
    throw new Error(`Expression compile errors:\n${formatted}`);
  }

  const output: Record<string, ExprIR> = { ...primaryBundle };
  for (const [field, expr] of compileResult.assignments) {
    output[field] = expr;
  }
  return output;
}
