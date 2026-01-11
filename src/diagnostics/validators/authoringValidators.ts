/**
 * Diagnostics System - Authoring Validators
 *
 * Fast, synchronous validators that run on GraphCommitted events.
 *
 * Performance Requirements:
 * - <10ms for 50-block patch
 * - <50ms for 200-block patch
 *
 * Sprint 1 Validators:
 * - TimeRoot presence check (missing or multiple)
 * - Disconnected block detection (future)
 *
 * Spec Reference: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md
 */

import type { Patch } from '../../graph';
import type { Diagnostic } from '../types';
import { generateDiagnosticId } from '../diagnosticId';

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Runs all authoring validators on a patch.
 *
 * Authoring validators are fast, synchronous checks that run immediately
 * after graph mutations. They detect structural issues (missing TimeRoot,
 * disconnected blocks, etc.).
 *
 * @param patch The patch to validate
 * @param patchRevision Current patch revision number
 * @returns Array of diagnostics (empty if no issues)
 */
export function runAuthoringValidators(patch: Patch, patchRevision: number): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Validator 1: TimeRoot presence check
  diagnostics.push(...validateTimeRoot(patch, patchRevision));

  // Future validators:
  // - Disconnected block detection
  // - Unused output detection
  // - Etc.

  return diagnostics;
}

// =============================================================================
// TimeRoot Validator
// =============================================================================

/**
 * Validates TimeRoot presence.
 *
 * Rules:
 * - Every patch must have exactly one TimeRoot block
 * - Missing TimeRoot → E_TIME_ROOT_MISSING (error)
 * - Multiple TimeRoots → E_TIME_ROOT_MULTIPLE (error)
 *
 * Performance: O(n) where n = block count (single pass)
 */
function validateTimeRoot(patch: Patch, patchRevision: number): Diagnostic[] {
  const timeRoots: string[] = [];

  // Find all TimeRoot blocks
  for (const block of patch.blocks.values()) {
    if (
      block.type === 'InfiniteTimeRoot' ||
      block.type === 'FiniteTimeRoot' ||
      block.type === 'TimeRoot'
    ) {
      timeRoots.push(block.id);
    }
  }

  // Case 1: No TimeRoot found
  if (timeRoots.length === 0) {
    const target = { kind: 'graphSpan' as const, blockIds: [] };
    const id = generateDiagnosticId('E_TIME_ROOT_MISSING', target, patchRevision);

    return [
      {
        id,
        code: 'E_TIME_ROOT_MISSING',
        severity: 'error',
        domain: 'authoring',
        primaryTarget: target,
        title: 'No TimeRoot',
        message: 'Patch must have exactly one TimeRoot block. Add an InfiniteTimeRoot or FiniteTimeRoot.',
        scope: { patchRevision },
        metadata: {
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
          occurrenceCount: 1,
        },
      },
    ];
  }

  // Case 2: Multiple TimeRoots found
  if (timeRoots.length > 1) {
    const target = {
      kind: 'graphSpan' as const,
      blockIds: timeRoots,
      spanKind: 'subgraph' as const,
    };
    const id = generateDiagnosticId('E_TIME_ROOT_MULTIPLE', target, patchRevision);

    return [
      {
        id,
        code: 'E_TIME_ROOT_MULTIPLE',
        severity: 'error',
        domain: 'authoring',
        primaryTarget: target,
        title: 'Multiple TimeRoots',
        message: `Found ${timeRoots.length} TimeRoot blocks. Only one is allowed. Remove extras.`,
        scope: { patchRevision },
        metadata: {
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
          occurrenceCount: 1,
        },
      },
    ];
  }

  // Case 3: Exactly one TimeRoot (valid)
  return [];
}

// =============================================================================
// Future Validators (Sprint 2+)
// =============================================================================

/**
 * Validates graph connectivity (no disconnected blocks).
 * Sprint 2+: Not implemented yet.
 */
// function validateConnectivity(patch: Patch, patchRevision: number): Diagnostic[] {
//   // TODO: Implement disconnected block detection
//   return [];
// }

/**
 * Validates output usage (no unused outputs).
 * Sprint 2+: Not implemented yet.
 */
// function validateOutputUsage(patch: Patch, patchRevision: number): Diagnostic[] {
//   // TODO: Implement unused output detection
//   return [];
// }
