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

import type { CompileError } from './compile';
import type { Diagnostic, DiagnosticCode, TargetRef } from '../diagnostics/types';
import { generateDiagnosticId } from '../diagnostics/diagnosticId';

// =============================================================================
// Error Kind to DiagnosticCode Mapping
// =============================================================================

/**
 * Maps compiler error kinds to diagnostic codes.
 *
 * Sprint 1: Basic mapping for P0 error types.
 * Sprint 2+: Expand with additional error types.
 */
const ERROR_KIND_TO_CODE: Record<string, DiagnosticCode> = {
  NoTimeRoot: 'E_TIME_ROOT_MISSING',
  MultipleTimeRoots: 'E_TIME_ROOT_MULTIPLE',
  UnknownBlockType: 'E_UNKNOWN_BLOCK_TYPE',
  TypeMismatch: 'E_TYPE_MISMATCH',
  CycleDetected: 'E_CYCLE_DETECTED',
  MissingInput: 'E_MISSING_INPUT',
  DanglingEdge: 'E_MISSING_INPUT', // Edge references non-existent block
  DuplicateBlockId: 'E_CYCLE_DETECTED', // Structural issue (reuse cycle code for now)
  LoweringError: 'E_UNKNOWN_BLOCK_TYPE', // Generic fallback
  UnknownPort: 'E_UNKNOWN_BLOCK_TYPE', // Port not found (block type may not be registered)
};

// =============================================================================
// Target Extraction
// =============================================================================

/**
 * Extracts a TargetRef from a CompileError.
 *
 * Strategy:
 * - If error has blockId → { kind: 'block', blockId }
 * - If error has blockId + portId → { kind: 'port', blockId, portId }
 * - Otherwise → { kind: 'graphSpan', blockIds: [] } (whole graph)
 */
function extractTargetRef(error: CompileError): TargetRef {
  if (error.blockId) {
    if (error.portId) {
      return {
        kind: 'port',
        blockId: error.blockId,
        portId: error.portId,
      };
    }
    return {
      kind: 'block',
      blockId: error.blockId,
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
 * @param error CompileError from compiler
 * @param patchRevision Current patch revision
 * @param compileId Compile session identifier
 * @returns Structured Diagnostic object
 */
export function convertCompileErrorToDiagnostic(
  error: CompileError,
  patchRevision: number,
  compileId: string
): Diagnostic {
  // Map error kind to diagnostic code
  const code = ERROR_KIND_TO_CODE[error.kind] || 'E_UNKNOWN_BLOCK_TYPE';

  // Extract target reference
  const primaryTarget = extractTargetRef(error);

  // Generate title (short summary)
  const title = formatTitle(error.kind);

  // Generate stable ID
  const id = generateDiagnosticId(code, primaryTarget, patchRevision);

  return {
    id,
    code,
    severity: 'error', // All compile errors are 'error' severity
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
 * Converts an array of CompileErrors to Diagnostics.
 *
 * @param errors Array of CompileErrors
 * @param patchRevision Current patch revision
 * @param compileId Compile session identifier
 * @returns Array of Diagnostics
 */
export function convertCompileErrorsToDiagnostics(
  errors: readonly CompileError[],
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
 * Formats a user-friendly title from error kind.
 *
 * Examples:
 * - NoTimeRoot → "No TimeRoot"
 * - TypeMismatch → "Type Mismatch"
 * - UnknownBlockType → "Unknown Block Type"
 */
function formatTitle(kind: string): string {
  // Insert spaces before capital letters
  const spaced = kind.replace(/([A-Z])/g, ' $1').trim();
  return spaced;
}
