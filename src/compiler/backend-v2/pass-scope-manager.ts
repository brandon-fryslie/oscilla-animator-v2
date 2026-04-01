/**
 * C1 Phase 4 Helper: Pass Scope Manager
 *
 * Tracks expression evaluation for a single pass.
 * When a block's output is consumed by multiple downstream ports (fanout > 1),
 * the expression is cached in a `let` variable to avoid duplicate GPU computation.
 */

import type { ExprIR, StatementIR } from '../../render/rust/boundary-contract';
import { let_ as irLet, ref as irRef } from '../../render/gpu-ir/ir-builders';

export class PassScopeManager {
  /** Accumulated let-binding statements (preamble for the pass body). */
  readonly preamble: StatementIR[] = [];

  /** Maps blockIndex to cached variable name (if cached). */
  private readonly cached = new Map<number, string>();

  /** Counter for unique variable names. */
  private varCounter = 0;

  /**
   * Get or cache an expression for a block.
   *
   * @param blockIndex - The block whose output we're resolving
   * @param expr - The expression produced by lowering this block
   * @param fanout - How many downstream ports consume this output
   * @returns The expression to use (either the original or a VarRef to a cached let)
   */
  getOrCache(blockIndex: number, expr: ExprIR, fanout: number): ExprIR {
    // Already cached? Return the reference.
    const existing = this.cached.get(blockIndex);
    if (existing) return irRef(existing);

    // Single use or trivial expression? Inline directly.
    // [LAW:dataflow-not-control-flow] Both branches produce an ExprIR —
    // the variability is in whether we wrap in a let or pass through.
    if (fanout <= 1 || isTrivialExpr(expr)) {
      return expr;
    }

    // Multi-use: cache in a let variable
    const varName = `v${this.varCounter++}`;
    this.preamble.push(irLet(varName, expr));
    this.cached.set(blockIndex, varName);
    return irRef(varName);
  }
}

/** Trivial expressions that are cheaper to duplicate than to let-bind. */
function isTrivialExpr(expr: ExprIR): boolean {
  return expr.type === 'VarRef'
    || expr.type === 'LiteralF32'
    || expr.type === 'LiteralU32'
    || expr.type === 'LiteralI32'
    || expr.type === 'LiteralBool';
}
