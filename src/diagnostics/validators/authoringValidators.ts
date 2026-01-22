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

  // Validator 2: Graph connectivity (disconnected blocks)
  diagnostics.push(...validateConnectivity(patch, patchRevision));

  // Validator 3: Output usage (unused outputs)
  diagnostics.push(...validateOutputUsage(patch, patchRevision));

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
        message: 'Patch must have exactly one TimeRoot block. Add an InfiniteTimeRoot.',
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
// Connectivity Validator
// =============================================================================

/**
 * Validates graph connectivity (no disconnected blocks).
 *
 * A block is "disconnected" if it has:
 * - No incoming edges AND no outgoing edges
 * - Exception: TimeRoot blocks are allowed to have no incoming edges
 * - Exception: Render sinks are allowed to have no outgoing edges
 *
 * Performance: O(b + e) where b = block count, e = edge count
 */
function validateConnectivity(patch: Patch, patchRevision: number): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Build sets of blocks with connections
  const blocksWithIncoming = new Set<string>();
  const blocksWithOutgoing = new Set<string>();

  for (const edge of patch.edges) {
    blocksWithIncoming.add(edge.to.blockId);
    blocksWithOutgoing.add(edge.from.blockId);
  }

  // Check each block for connectivity
  for (const [blockId, block] of patch.blocks) {
    const hasIncoming = blocksWithIncoming.has(blockId);
    const hasOutgoing = blocksWithOutgoing.has(blockId);

    // Completely disconnected (no edges at all)
    if (!hasIncoming && !hasOutgoing) {
      // Exception: Allow TimeRoot to have no incoming (it's a source)
      const isTimeRoot = block.type === 'InfiniteTimeRoot' || block.type === 'TimeRoot';
      // Exception: Allow Render sinks to have no outgoing (they're sinks)
      const isRenderSink = block.type === 'Render' || block.type === 'Render2D';

      // TimeRoot with no outgoing is still disconnected (useless)
      // Render sink with no incoming is still disconnected (useless)
      if (isTimeRoot && !hasOutgoing) {
        // TimeRoot needs at least one outgoing connection
        const target = { kind: 'block' as const, blockId };
        const id = generateDiagnosticId('W_GRAPH_DISCONNECTED_BLOCK', target, patchRevision);

        diagnostics.push({
          id,
          code: 'W_GRAPH_DISCONNECTED_BLOCK',
          severity: 'warn',
          domain: 'authoring',
          primaryTarget: target,
          title: 'Disconnected TimeRoot',
          message: `TimeRoot "${block.displayName || blockId}" has no outgoing connections. Its time signals are unused.`,
          scope: { patchRevision },
          metadata: {
            firstSeenAt: Date.now(),
            lastSeenAt: Date.now(),
            occurrenceCount: 1,
          },
        });
      } else if (isRenderSink && !hasIncoming) {
        // Render sink needs at least one incoming connection
        const target = { kind: 'block' as const, blockId };
        const id = generateDiagnosticId('W_GRAPH_DISCONNECTED_BLOCK', target, patchRevision);

        diagnostics.push({
          id,
          code: 'W_GRAPH_DISCONNECTED_BLOCK',
          severity: 'warn',
          domain: 'authoring',
          primaryTarget: target,
          title: 'Disconnected Render',
          message: `Render "${block.displayName || blockId}" has no incoming connections. Nothing will be rendered.`,
          scope: { patchRevision },
          metadata: {
            firstSeenAt: Date.now(),
            lastSeenAt: Date.now(),
            occurrenceCount: 1,
          },
        });
      } else if (!isTimeRoot && !isRenderSink) {
        // Regular block with no connections at all
        const target = { kind: 'block' as const, blockId };
        const id = generateDiagnosticId('W_GRAPH_DISCONNECTED_BLOCK', target, patchRevision);

        diagnostics.push({
          id,
          code: 'W_GRAPH_DISCONNECTED_BLOCK',
          severity: 'warn',
          domain: 'authoring',
          primaryTarget: target,
          title: 'Disconnected Block',
          message: `"${block.displayName || block.type}" has no connections. Consider removing it or connecting it to the graph.`,
          scope: { patchRevision },
          metadata: {
            firstSeenAt: Date.now(),
            lastSeenAt: Date.now(),
            occurrenceCount: 1,
          },
        });
      }
    }
  }

  return diagnostics;
}

// =============================================================================
// Output Usage Validator
// =============================================================================

/**
 * Validates output usage (no unused outputs).
 *
 * An output is "unused" if it has no outgoing edges.
 * This is typically a hint that the user may have forgotten to connect something.
 *
 * Exceptions:
 * - Blocks that are commonly left with unused outputs (inspection, debugging)
 * - Array blocks where not all outputs are typically used
 *
 * Performance: O(b + e) where b = block count, e = edge count
 */
function validateOutputUsage(patch: Patch, patchRevision: number): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Build a set of all connected output ports
  const connectedOutputs = new Set<string>();

  for (const edge of patch.edges) {
    const key = `${edge.from.blockId}:${edge.from.slotId}`;
    connectedOutputs.add(key);
  }

  // Check each block's output ports
  for (const [blockId, block] of patch.blocks) {
    // Skip blocks that commonly have unused outputs
    const skipTypes = ['Const', 'Comment', 'Note'];
    if (skipTypes.includes(block.type)) continue;

    // Skip render sinks (they have no outputs)
    if (block.type === 'Render' || block.type === 'Render2D') continue;

    // Check each output port
    for (const [portId, _port] of block.outputPorts) {
      const key = `${blockId}:${portId}`;

      if (!connectedOutputs.has(key)) {
        // Primary outputs should be flagged more prominently
        const isPrimaryOutput = portId === 'out' || portId === 'value' || portId === 'output';

        // Only warn about primary outputs to reduce noise
        if (isPrimaryOutput) {
          const target = { kind: 'port' as const, blockId, portId };
          const id = generateDiagnosticId('W_GRAPH_UNUSED_OUTPUT', target, patchRevision);

          diagnostics.push({
            id,
            code: 'W_GRAPH_UNUSED_OUTPUT',
            severity: 'warn',
            domain: 'authoring',
            primaryTarget: target,
            title: 'Unused Output',
            message: `"${block.displayName || block.type}.${portId}" is not connected. Its value is not being used.`,
            scope: { patchRevision },
            metadata: {
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              occurrenceCount: 1,
            },
          });
        }
      }
    }
  }

  return diagnostics;
}
