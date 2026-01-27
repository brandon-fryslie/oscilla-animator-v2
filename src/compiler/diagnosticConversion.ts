/**
 * Compiler - Diagnostic Conversion
 *
 * Converts compiler errors to structured Diagnostic objects.
 *
 * Responsibilities:
 * - Map CompileError to Diagnostic
 * - Extract TargetRef from error context
 * - Assign appropriate severity and domain
 * - Generate stable diagnostic IDs
 *
 * Spec Reference: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md
 */

import type { CompileError } from './types';
import type { Diagnostic, DiagnosticCode, TargetRef } from '../diagnostics/types';
import { generateDiagnosticId } from '../diagnostics/diagnosticId';

// =============================================================================
// Legacy Error Compatibility
// =============================================================================

/**
 * Legacy error format from compile.ts (deprecated, to be migrated).
 * @deprecated Use CompileError from ./types.ts instead
 */
interface LegacyCompileError {
  readonly kind: string;
  readonly message: string;
  readonly blockId?: string;
  readonly connectionId?: string;
  readonly portId?: string;
}

/**
 * Type guard to check if an error is in legacy format.
 */
function isLegacyError(error: CompileError | LegacyCompileError): error is LegacyCompileError {
  return 'kind' in error && !('code' in error);
}

/**
 * Normalize legacy error to new format.
 */
function normalizeLegacyError(error: LegacyCompileError): CompileError {
  return {
    code: error.kind, // Map kind → code
    message: error.message,
    where: {
      blockId: error.blockId,
      port: error.portId,
    },
  };
}

// =============================================================================
// Error Code to DiagnosticCode Mapping
// =============================================================================

/**
 * Maps compiler error codes to diagnostic codes.
 *
 * Sprint 1: Basic mapping for P0 error types.
 * Sprint 2+: Expand with additional error types.
 * Sprint 3: Expression DSL error codes
 */
const ERROR_CODE_TO_DIAGNOSTIC_CODE: Record<string, DiagnosticCode> = {
  NoTimeRoot: 'E_TIME_ROOT_MISSING',
  MultipleTimeRoots: 'E_TIME_ROOT_MULTIPLE',
  UnknownBlockType: 'E_UNKNOWN_BLOCK_TYPE',
  TypeMismatch: 'E_TYPE_MISMATCH',
  PortTypeMismatch: 'E_TYPE_MISMATCH',
  Cycle: 'E_CYCLE_DETECTED',
  CycleDetected: 'E_CYCLE_DETECTED',
  UnconnectedInput: 'E_MISSING_INPUT',
  MissingInput: 'E_MISSING_INPUT',
  DanglingEdge: 'E_MISSING_INPUT', // Edge references non-existent block
  DuplicateBlockId: 'E_CYCLE_DETECTED', // Structural issue (reuse cycle code for now)
  LoweringError: 'E_UNKNOWN_BLOCK_TYPE', // Generic fallback
  UnknownPort: 'E_UNKNOWN_BLOCK_TYPE', // Port not found (block type may not be registered)
  BlockMissing: 'E_UNKNOWN_BLOCK_TYPE',
  NotImplemented: 'E_UNKNOWN_BLOCK_TYPE',
  IRValidationFailed: 'E_UNKNOWN_BLOCK_TYPE',
  UpstreamError: 'E_UNKNOWN_BLOCK_TYPE',
  TransformError: 'E_UNKNOWN_BLOCK_TYPE',
  VarargError: 'E_UNKNOWN_BLOCK_TYPE',
  // Expression DSL errors (Sprint 3)
  ExprSyntaxError: 'E_EXPR_SYNTAX',
  ExprTypeError: 'E_EXPR_TYPE',
  ExprCompileError: 'E_EXPR_COMPILE',
  // Cardinality errors (Sprint 2A - Cardinality-Generic Blocks)
  CardinalityMismatch: 'E_CARDINALITY_MISMATCH',
  InstanceMismatch: 'E_INSTANCE_MISMATCH',
  LaneCoupledDisallowed: 'E_LANE_COUPLED_DISALLOWED',
  ImplicitBroadcastDisallowed: 'E_IMPLICIT_BROADCAST_DISALLOWED',
  // Payload errors (Sprint 2B - Payload-Generic Blocks)
  PayloadNotAllowed: 'E_PAYLOAD_NOT_ALLOWED',
  PayloadCombinationNotAllowed: 'E_PAYLOAD_COMBINATION_NOT_ALLOWED',
  UnitMismatch: 'E_UNIT_MISMATCH',
  ImplicitCastDisallowed: 'E_IMPLICIT_CAST_DISALLOWED',
};

// =============================================================================
// Target Extraction
// =============================================================================

/**
 * Extracts a TargetRef from a CompileError.
 *
 * Strategy:
 * - If error has where.blockId → { kind: 'block', blockId }
 * - If error has where.blockId + where.port → { kind: 'port', blockId, portId }
 * - Otherwise → { kind: 'graphSpan', blockIds: [] } (whole graph)
 */
function extractTargetRef(error: CompileError): TargetRef {
  const blockId = error.where?.blockId;
  const portId = error.where?.port;

  if (blockId) {
    if (portId) {
      return {
        kind: 'port',
        blockId: blockId,
        portId: portId,
      };
    }
    return {
      kind: 'block',
      blockId: blockId,
    };
  }

  // No specific target → whole graph
  return {
    kind: 'graphSpan',
    blockIds: [],
  };
}

// =============================================================================
// Error to Diagnostic Conversion
// =============================================================================

/**
 * Converts a CompileError to a Diagnostic.
 *
 * @param error CompileError from compiler (or legacy format)
 * @param patchRevision Current patch revision
 * @param compileId Compile session identifier
 * @returns Structured Diagnostic object
 */
export function convertCompileErrorToDiagnostic(
  error: CompileError | LegacyCompileError,
  patchRevision: number,
  compileId: string
): Diagnostic {
  // Normalize legacy errors to new format
  const normalizedError = isLegacyError(error) ? normalizeLegacyError(error) : error;

  // Map error code to diagnostic code
  const code = ERROR_CODE_TO_DIAGNOSTIC_CODE[normalizedError.code] || 'E_UNKNOWN_BLOCK_TYPE';

  // Extract target reference
  const primaryTarget = extractTargetRef(normalizedError);

  // Generate title (short summary)
  const title = formatTitle(normalizedError.code);

  // Generate stable ID (use error.code as signature to disambiguate
  // multiple errors for the same block that map to the same diagnostic code)
  const id = generateDiagnosticId(code, primaryTarget, patchRevision, normalizedError.code);

  return {
    id,
    code,
    severity: 'error', // All compile errors are 'error' severity
    domain: 'compile',
    primaryTarget,
    title,
    message: normalizedError.message,
    scope: {
      patchRevision,
      compileId,
    },
    metadata: {
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      occurrenceCount: 1,
    },
  };
}

/**
 * Converts an array of CompileErrors to Diagnostics.
 *
 * @param errors Array of CompileErrors (or legacy format)
 * @param patchRevision Current patch revision
 * @param compileId Compile session identifier
 * @returns Array of Diagnostics
 */
export function convertCompileErrorsToDiagnostics(
  errors: readonly (CompileError | LegacyCompileError)[],
  patchRevision: number,
  compileId: string
): Diagnostic[] {
  return errors.map((error) =>
    convertCompileErrorToDiagnostic(error, patchRevision, compileId)
  );
}

// =============================================================================
// Title Formatting
// =============================================================================

/**
 * Formats a user-friendly title from error code.
 *
 * Examples:
 * - NoTimeRoot → "No Time Root"
 * - TypeMismatch → "Type Mismatch"
 * - UnknownBlockType → "Unknown Block Type"
 */
function formatTitle(code: string): string {
  // Insert spaces before capital letters
  const spaced = code.replace(/([A-Z])/g, ' $1').trim();
  return spaced;
}
