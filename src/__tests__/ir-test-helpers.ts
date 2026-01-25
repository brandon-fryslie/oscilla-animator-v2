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
import type {
  SigExprId,
  FieldExprId,
  EventExprId,
} from '../compiler/ir/Indices';
import type { SigExpr, FieldExpr, EventExpr } from '../compiler/ir/types';

/**
 * Extract a signal expression from IRBuilder.
 *
 * Safely accesses the private sigExprs array in IRBuilderImpl without casting.
 * Used in tests to verify IR structure after block.lower() calls.
 *
 * @param builder - The IRBuilder instance
 * @param id - The signal expression ID to retrieve
 * @returns The SigExpr, or undefined if not found
 *
 * @example
 * const sigExpr = extractSigExpr(builder, sigId);
 * expect(sigExpr?.value).toBe(0);
 */
export function extractSigExpr(
  builder: IRBuilderImpl,
  id: SigExprId
): SigExpr | undefined {
  const impl = builder as any;
  return impl.sigExprs?.[id as any];
}

/**
 * Extract a field expression from IRBuilder.
 *
 * Safely accesses the private fieldExprs array in IRBuilderImpl without casting.
 *
 * @param builder - The IRBuilder instance
 * @param id - The field expression ID to retrieve
 * @returns The FieldExpr, or undefined if not found
 */
export function extractFieldExpr(
  builder: IRBuilderImpl,
  id: FieldExprId
): FieldExpr | undefined {
  const impl = builder as any;
  return impl.fieldExprs?.[id as any];
}

/**
 * Extract an event expression from IRBuilder.
 *
 * Safely accesses the private eventExprs array in IRBuilderImpl without casting.
 *
 * @param builder - The IRBuilder instance
 * @param id - The event expression ID to retrieve
 * @returns The EventExpr, or undefined if not found
 */
export function extractEventExpr(
  builder: IRBuilderImpl,
  id: EventExprId
): EventExpr | undefined {
  const impl = builder as any;
  return impl.eventExprs?.[id as any];
}

/**
 * Extract SigExprId from a ValueRef output.
 *
 * When a block's lower() method returns a ValueRef with discriminant 'sig',
 * this helper safely extracts the associated SigExprId without casting.
 *
 * @param outputRef - The ValueRef output (union type with discriminant k)
 * @returns The SigExprId if outputRef.k === 'sig', or null otherwise
 *
 * @example
 * const result = def.lower({ ... });
 * const sigId = extractSigExprId(result.outputsById.out);
 * const sigExpr = extractSigExpr(builder, sigId);
 */
export function extractSigExprId(outputRef: any): SigExprId | null {
  return outputRef?.k === 'sig' ? outputRef.id : null;
}

/**
 * Extract FieldExprId from a ValueRef output.
 *
 * When a block's lower() method returns a ValueRef with discriminant 'field',
 * this helper safely extracts the associated FieldExprId without casting.
 *
 * @param outputRef - The ValueRef output (union type with discriminant k)
 * @returns The FieldExprId if outputRef.k === 'field', or null otherwise
 */
export function extractFieldExprId(outputRef: any): FieldExprId | null {
  return outputRef?.k === 'field' ? outputRef.id : null;
}

/**
 * Extract EventExprId from a ValueRef output.
 *
 * When a block's lower() method returns a ValueRef with discriminant 'event',
 * this helper safely extracts the associated EventExprId without casting.
 *
 * @param outputRef - The ValueRef output (union type with discriminant k)
 * @returns The EventExprId if outputRef.k === 'event', or null otherwise
 */
export function extractEventExprId(outputRef: any): EventExprId | null {
  return outputRef?.k === 'event' ? outputRef.id : null;
}
