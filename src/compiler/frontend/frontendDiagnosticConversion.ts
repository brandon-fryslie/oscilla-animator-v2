/**
 * Frontend Compiler - Diagnostic Conversion
 *
 * Converts frontend compiler errors to structured Diagnostic objects.
 * Frontend errors come from normalization and type inference passes.
 *
 * // [LAW:one-source-of-truth] This is the ONE place that maps internal
 * diagnosticFlagCode to UI DiagnosticCode.
 */

import type { FrontendError } from './index';
import type { Diagnostic, DiagnosticCode, Severity, TargetRef } from '../../diagnostics/types';
import { generateDiagnosticId } from '../../diagnostics/diagnosticId';

// =============================================================================
// Error Kind to DiagnosticCode Mapping
// =============================================================================

/**
 * Maps frontend error kinds to diagnostic codes.
 * For fixpoint diagnostics, diagnosticFlagCode is preferred over error.kind.
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
  AxisInvalid: 'E_AXIS_INVALID',

  // --- Fixpoint diagnosticFlagCode → DiagnosticCode ---
  // PU solver
  ConflictingPayloads: 'E_TYPE_MISMATCH',
  ConflictingUnits: 'E_UNIT_MISMATCH',
  PayloadNotInAllowedSet: 'E_PAYLOAD_NOT_ALLOWED',
  UnitlessMismatch: 'E_UNIT_MISMATCH',
  EmptyAllowedSet: 'E_PAYLOAD_NOT_ALLOWED',
  UnresolvedPayload: 'E_TYPE_MISMATCH',
  UnresolvedUnit: 'E_TYPE_MISMATCH',
  // Cardinality solver
  ClampManyConflict: 'E_CARDINALITY_MISMATCH',
  InstanceConflict: 'E_INSTANCE_MISMATCH',
  UnresolvedInstanceVar: 'E_INSTANCE_MISMATCH',
  PromoteToManyClampOneConflict: 'E_CARDINALITY_MISMATCH',
  // Cardinality policy conflicts (extraction-time)
  ConflictingCardinalityRelation: 'E_CARDINALITY_MISMATCH',
  ConflictingInstanceBinding: 'E_INSTANCE_MISMATCH',
  // Escape hatches & structural
  UnitDefaultedToNone: 'I_UNIT_DEFAULTED_TO_NONE',
  CardinalityDefaultedToOne: 'I_CARDINALITY_DEFAULTED_TO_ONE',
  CardinalityAdapterInserted: 'I_CARDINALITY_ADAPTER_INSERTED',
  CheaterAdapterUsed: 'I_CHEATER_ADAPTER_USED',
  CycleBreakInserted: 'I_CYCLE_BREAK_INSERTED',
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
// Severity Mapping
// =============================================================================

/**
 * Map FrontendError severity to Diagnostic Severity.
 */
function mapSeverity(severity: 'error' | 'warn' | 'info'): Severity {
  switch (severity) {
    case 'error': return 'error';
    case 'warn': return 'warn';
    case 'info': return 'info';
  }
}

// =============================================================================
// Error to Diagnostic Conversion
// =============================================================================

/**
 * Converts a FrontendError to a Diagnostic.
 * Uses diagnosticFlagCode for lookup when available, falls back to error.kind.
 */
export function convertFrontendErrorToDiagnostic(
  error: FrontendError,
  patchRevision: number,
  compileId: string
): Diagnostic {
  // Prefer diagnosticFlagCode for configurable diagnostics
  const lookupKey = error.diagnosticFlagCode ?? error.kind;
  const code = FRONTEND_ERROR_KIND_TO_DIAGNOSTIC_CODE[lookupKey] || 'E_UNKNOWN_BLOCK_TYPE';

  // Extract target reference
  const primaryTarget = extractTargetRef(error);

  // Generate title (short summary)
  const title = formatTitle(lookupKey);

  // Generate stable ID
  const id = generateDiagnosticId(code, primaryTarget, patchRevision, lookupKey);

  return {
    id,
    code,
    severity: mapSeverity(error.severity),
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
