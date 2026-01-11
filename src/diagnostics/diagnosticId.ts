/**
 * Diagnostics System - Stable ID Generation
 *
 * Provides deterministic ID generation for diagnostics.
 * IDs are stable across sessions and enable deduplication.
 *
 * Format: CODE:targetStr:revN[:signature]
 * Example: E_TYPE_MISMATCH:port-b1:p2:rev42
 *
 * Spec Reference: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md
 * Lines 338-365: Stable ID generation rules
 */

import type { TargetRef, DiagnosticCode } from './types';

// =============================================================================
// TargetRef Serialization
// =============================================================================

/**
 * Serializes a TargetRef to a stable string representation.
 * Must be deterministic: same TargetRef → same string.
 *
 * Exhaustive switch ensures all TargetRef kinds are handled.
 */
export function serializeTargetRef(target: TargetRef): string {
  switch (target.kind) {
    case 'block':
      return `block-${target.blockId}`;

    case 'port':
      return `port-${target.blockId}:${target.portId}`;

    case 'bus':
      return `bus-${target.busId}`;

    case 'binding':
      return `binding-${target.bindingId}:${target.busId}:${target.blockId}:${target.direction}`;

    case 'timeRoot':
      return `timeRoot-${target.blockId}`;

    case 'graphSpan': {
      const sortedIds = [...target.blockIds].sort();
      const idsStr = sortedIds.join(',');
      const kindStr = target.spanKind ? `:${target.spanKind}` : '';
      return `graphSpan-[${idsStr}]${kindStr}`;
    }

    case 'composite': {
      const instanceStr = target.instanceId ? `:${target.instanceId}` : '';
      return `composite-${target.compositeDefId}${instanceStr}`;
    }

    default: {
      // Exhaustiveness check: TypeScript will error if we miss a case
      const _exhaustive: never = target;
      throw new Error(`Unhandled TargetRef kind: ${(_exhaustive as TargetRef).kind}`);
    }
  }
}

// =============================================================================
// Diagnostic ID Generation
// =============================================================================

/**
 * Generates a stable, deterministic ID for a diagnostic.
 *
 * Format: CODE:targetStr:revN[:signature]
 *
 * Parameters:
 * - code: DiagnosticCode (e.g., 'E_TYPE_MISMATCH')
 * - primaryTarget: Main entity this diagnostic refers to
 * - patchRevision: Patch revision number (for scoping)
 * - signature: Optional disambiguator (e.g., for multiple diagnostics on same target)
 *
 * Guarantees:
 * - Deterministic: Same inputs → same ID
 * - Unique: Different diagnostics → different IDs
 * - Stable: Survives across compilations/sessions
 *
 * Example IDs:
 * - "E_TIME_ROOT_MISSING:graphSpan-[]:rev0"
 * - "E_TYPE_MISMATCH:port-b1:p2:rev42"
 * - "E_CYCLE_DETECTED:graphSpan-[b1,b2,b3]:cycle:rev5"
 */
export function generateDiagnosticId(
  code: DiagnosticCode,
  primaryTarget: TargetRef,
  patchRevision: number,
  signature?: string
): string {
  const targetStr = serializeTargetRef(primaryTarget);
  const base = `${code}:${targetStr}:rev${patchRevision}`;
  return signature ? `${base}:${signature}` : base;
}

// =============================================================================
// ID Parsing (Optional - for debugging/introspection)
// =============================================================================

/**
 * Parsed diagnostic ID components.
 * Useful for debugging and introspection.
 */
export interface ParsedDiagnosticId {
  code: string;
  targetStr: string;
  patchRevision: number;
  signature?: string;
}

/**
 * Parses a diagnostic ID back into its components.
 * Returns null if ID format is invalid.
 *
 * Sprint 1: Not strictly needed, but useful for debugging.
 */
export function parseDiagnosticId(id: string): ParsedDiagnosticId | null {
  // Format: CODE:targetStr:revN[:signature]
  const parts = id.split(':');
  if (parts.length < 3) return null;

  const code = parts[0];
  const revPart = parts[parts.length - 1];
  const revMatch = revPart.match(/^rev(\d+)$/);

  if (!revMatch) {
    // Last part might be signature, check second-to-last
    const revPart2 = parts[parts.length - 2];
    const revMatch2 = revPart2.match(/^rev(\d+)$/);
    if (!revMatch2) return null;

    const patchRevision = parseInt(revMatch2[1], 10);
    const signature = revPart;
    const targetStr = parts.slice(1, -2).join(':');
    return { code, targetStr, patchRevision, signature };
  }

  const patchRevision = parseInt(revMatch[1], 10);
  const targetStr = parts.slice(1, -1).join(':');
  return { code, targetStr, patchRevision };
}
