/**
 * Frontend Compiler - Diagnostic Conversion
 *
 * Converts frontend compiler errors to structured Diagnostic objects.
 * Frontend errors come from normalization and type inference passes.
 */

import type { FrontendError } from './index';
import type { Diagnostic, DiagnosticCode, TargetRef } from '../../diagnostics/types';
import { generateDiagnosticId } from '../../diagnostics/diagnosticId';

// =============================================================================
// Error Kind to DiagnosticCode Mapping
// =============================================================================

/**
 * Maps frontend error kinds to diagnostic codes.
 */
const FRONTEND_ERROR_KIND_TO_DIAGNOSTIC_CODE: Record<string, DiagnosticCode> = {
  // Normalization errors
  NoTimeRoot: 'E_TIME_ROOT_MISSING',
  MultipleTimeRoots: 'E_TIME_ROOT_MULTIPLE',
  UnknownBlockType: 'E_UNKNOWN_BLOCK_TYPE',
  DanglingEdge: 'E_MISSING_INPUT',
  MissingInput: 'E_MISSING_INPUT',

  // Type constraint errors
  TypeMismatch: 'E_TYPE_MISMATCH',
  PortTypeMismatch: 'E_TYPE_MISMATCH',
  UnresolvedType: 'E_TYPE_MISMATCH',

  // Cycle errors
  CycleDetected: 'E_CYCLE_DETECTED',
  Cycle: 'E_CYCLE_DETECTED',

  // Cardinality errors
  CardinalityMismatch: 'E_CARDINALITY_MISMATCH',
  InstanceMismatch: 'E_INSTANCE_MISMATCH',
  LaneCoupledDisallowed: 'E_LANE_COUPLED_DISALLOWED',
  ImplicitBroadcastDisallowed: 'E_IMPLICIT_BROADCAST_DISALLOWED',

  // Payload errors
  PayloadNotAllowed: 'E_PAYLOAD_NOT_ALLOWED',
  PayloadCombinationNotAllowed: 'E_PAYLOAD_COMBINATION_NOT_ALLOWED',
  UnitMismatch: 'E_UNIT_MISMATCH',
  ImplicitCastDisallowed: 'E_IMPLICIT_CAST_DISALLOWED',

  // Axis validation errors
  AxisViolation: 'E_TYPE_MISMATCH',
  VarAxisEscaped: 'E_TYPE_MISMATCH',
};

// =============================================================================
// Target Extraction
// =============================================================================

/**
 * Extracts a TargetRef from a FrontendError.
 */
function extractTargetRef(error: FrontendError): TargetRef {
  const blockId = error.blockId;
  const portId = error.portId;

  if (blockId) {
    if (portId) {
      return {
        kind: 'port',
        blockId,
        portId,
      };
    }
    return {
      kind: 'block',
      blockId,
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
 * Converts a FrontendError to a Diagnostic.
 */
export function convertFrontendErrorToDiagnostic(
  error: FrontendError,
  patchRevision: number,
  compileId: string
): Diagnostic {
  // Map error kind to diagnostic code
  const code = FRONTEND_ERROR_KIND_TO_DIAGNOSTIC_CODE[error.kind] || 'E_UNKNOWN_BLOCK_TYPE';

  // Extract target reference
  const primaryTarget = extractTargetRef(error);

  // Generate title (short summary)
  const title = formatTitle(error.kind);

  // Generate stable ID
  const id = generateDiagnosticId(code, primaryTarget, patchRevision, error.kind);

  return {
    id,
    code,
    severity: 'error', // Frontend errors are always 'error' severity
    domain: 'compile',
    primaryTarget,
    title,
    message: error.message,
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
 * Converts an array of FrontendErrors to Diagnostics.
 */
export function convertFrontendErrorsToDiagnostics(
  errors: readonly FrontendError[],
  patchRevision: number,
  compileId: string
): Diagnostic[] {
  return errors.map((error) =>
    convertFrontendErrorToDiagnostic(error, patchRevision, compileId)
  );
}

// =============================================================================
// Title Formatting
// =============================================================================

/**
 * Formats a user-friendly title from error kind.
 */
function formatTitle(kind: string): string {
  // Insert spaces before capital letters
  const spaced = kind.replace(/([A-Z])/g, ' $1').trim();
  return spaced;
}
