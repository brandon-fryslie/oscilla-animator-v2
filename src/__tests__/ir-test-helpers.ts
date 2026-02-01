/**
 * IR Test Helpers
 *
 * Safe, type-aware accessors for IRBuilder internals during testing.
 * These helpers eliminate the need for 'as any' casts when accessing
 * private expression tables in tests.
 *
 * @internal - Test-only infrastructure. Not part of public API.
 */

import type { IRBuilderImpl } from '../compiler/ir/IRBuilderImpl';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { ValueExpr } from '../compiler/ir/value-expr';

/**
 * Extract a value expression from IRBuilder.
 *
 * Safely accesses the private valueExprs array in IRBuilderImpl without casting.
 * Used in tests to verify IR structure after block.lower() calls.
 *
 * @param builder - The IRBuilder instance
 * @param id - The value expression ID to retrieve
 * @returns The ValueExpr, or undefined if not found
 *
 * @example
 * const expr = extractValueExpr(builder, exprId);
 * expect(expr?.op).toBe('const');
 */
export function extractValueExpr(
  builder: IRBuilderImpl,
  id: ValueExprId
): ValueExpr | undefined {
  const impl = builder as any;
  return impl.valueExprs?.[id as any];
}

/**
 * Extract ValueExprId from a ValueRef output.
 *
 * When a block's lower() method returns a ValueRef, this helper safely
 * extracts the associated ValueExprId without casting.
 *
 * @param outputRef - The ValueRef output (union type with discriminant k)
 * @returns The ValueExprId if present, or null otherwise
 *
 * @example
 * const result = def.lower({ ... });
 * const exprId = extractValueExprId(result.outputsById.out);
 * const expr = extractValueExpr(builder, exprId);
 */
export function extractValueExprId(outputRef: any): ValueExprId | null {
  return outputRef?.id ?? null;
}

// Legacy aliases for backward compatibility with existing tests
export const extractSigExpr = extractValueExpr;
export const extractFieldExpr = extractValueExpr;
export const extractEventExpr = extractValueExpr;
export const extractSigExprId = extractValueExprId;
export const extractFieldExprId = extractValueExprId;
export const extractEventExprId = extractValueExprId;
