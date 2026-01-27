/**
 * Compiler Types
 *
 * Error types and other compiler-specific types.
 */

// =============================================================================
// Compile Error (Unified)
// =============================================================================

/**
 * Error location - where the error occurred.
 */
export interface CompileErrorWhere {
  readonly blockId?: string;
  readonly port?: string;
  readonly edgeId?: string;
}

/**
 * Compile error codes used by passes-v2.
 */
export type CompileErrorCode =
  | 'TypeMismatch'
  | 'PortTypeMismatch'
  | 'UnconnectedInput'
  | 'Cycle'
  | 'UnknownBlockType'
  | 'BlockMissing'
  | 'NotImplemented'
  | 'IRValidationFailed'
  | 'UpstreamError'
  | 'TransformError'
  // Cardinality errors (Sprint 2A - Cardinality-Generic Blocks)
  | 'CardinalityMismatch'
  | 'InstanceMismatch'
  | 'LaneCoupledDisallowed'
  | 'ImplicitBroadcastDisallowed'
  // Payload errors (Sprint 2B - Payload-Generic Blocks)
  | 'PayloadNotAllowed'
  | 'PayloadCombinationNotAllowed'
  | 'UnitMismatch'
  | 'ImplicitCastDisallowed';

/**
 * Compile error structure (unified for passes-v2).
 * Uses 'code' and 'where' for new code, with backward compatible 'kind' and 'location'.
 */
export interface CompileError {
  /** Error code (passes-v2 style) */
  readonly code: CompileErrorCode | string;

  /** Error message */
  readonly message: string;

  /** Location of the error (passes-v2 style) */
  readonly where?: CompileErrorWhere;

  /** Optional additional details */
  readonly details?: Record<string, unknown>;
}

/**
 * Create a compile error.
 */
export function compileError(
  code: CompileErrorCode | string,
  message: string,
  where?: CompileErrorWhere,
  details?: Record<string, unknown>
): CompileError {
  return { code, message, where, details };
}

// =============================================================================
// Compile Result
// =============================================================================

/**
 * Result of a compilation pass.
 */
export type CompileResult<T> =
  | { ok: true; value: T; warnings: readonly CompileError[] }
  | { ok: false; errors: readonly CompileError[]; warnings: readonly CompileError[] };

/**
 * Create a successful compile result.
 */
export function ok<T>(value: T, warnings: readonly CompileError[] = []): CompileResult<T> {
  return { ok: true, value, warnings };
}

/**
 * Create a failed compile result.
 */
export function fail<T>(errors: readonly CompileError[], warnings: readonly CompileError[] = []): CompileResult<T> {
  return { ok: false, errors, warnings };
}

/**
 * Check if a compile result is successful.
 */
export function isOk<T>(result: CompileResult<T>): result is { ok: true; value: T; warnings: readonly CompileError[] } {
  return result.ok;
}
