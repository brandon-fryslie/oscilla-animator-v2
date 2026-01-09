/**
 * Writer Resolution - Shared logic for resolving multiple value sources to inputs
 *
 * This module implements the canonical writer resolution model from the
 * Multi-Input Blocks specification. It handles:
 * - Enumerating all writers to an input endpoint
 * - Deterministic ordering for stable combine semantics
 * - Combine policy resolution and validation
 *
 * Used by:
 * - pass6-block-lowering.ts (IR compilation path)
 *
 * Sprint: Multi-Input Blocks Phase 1
 * References:
 * - design-docs/now/01-MultiBlock-Input.md §2-3 (Writer types and ordering)
 * - design-docs/now/01-MultiBlock-Input.md §9.1 (Implementation plan)
 */

import type {
  Edge,
  Slot,
  Block,
  TypeDesc,
} from '../../types';
import { getBlockDefinition } from '../../blocks/registry';
import type { CombinePolicy } from './combine-utils';

// =============================================================================
// Types
// =============================================================================

/**
 * Input endpoint identifier.
 */
export interface InputEndpoint {
  readonly blockId: string;
  readonly slotId: string;
}

/**
 * Writer: A source that writes to an input slot.
 *
 * All writers are wires - direct connections from another block's output.
 *
 */
export type Writer = { kind: 'wire'; from: { blockId: string; slotId: string }; connId: string };

/**
 * Resolved input specification.
 *
 * Contains all writers to an input endpoint, sorted deterministically,
 * plus the combine policy for merging them.
 */
export interface ResolvedInputSpec {
  /** Target input endpoint */
  readonly endpoint: InputEndpoint;

  /** Type of the input port */
  readonly portType: TypeDesc;

  /** All writers to this input (length >= 1 after defaults injected) */
  readonly writers: readonly Writer[];

  /** Combine policy (from Slot.combine or default) */
  readonly combine: CombinePolicy;
}

// =============================================================================
// Writer Sort Key (Deterministic Ordering)
// =============================================================================

/**
 * Get deterministic sort key for a writer.
 *
 * Sort order (ascending):
 * 1. Wires: "0:{from.blockId}:{from.slotId}:{connId}"
 *
 * This ensures:
 * - Order-dependent modes ('last', 'first', 'layer') are deterministic
 * - Not dependent on insertion order, UI quirks, or JSON array order
 *
 * @see design-docs/now/01-MultiBlock-Input.md §3.1
 */
export function writerSortKey(w: Writer): string {
  // All writers are wires (including DSConst.out edges)
  return `0:${w.from.blockId}:${w.from.slotId}:${w.connId}`;
}

/**
 * Sort writers deterministically.
 *
 * Sorts by ascending writerSortKey(), ensuring stable order for
 * order-dependent combine modes.
 */
export function sortWriters(writers: readonly Writer[]): Writer[] {
  return [...writers].sort((a, b) => {
    const keyA = writerSortKey(a);
    const keyB = writerSortKey(b);
    return keyA.localeCompare(keyB);
  });
}

// =============================================================================
// Writer Enumeration
// =============================================================================

/**
 * Enumerate all writers to an input endpoint.
 *
 * Collects writers from:
 * 1. Wires (direct port → port connections, including DSConst.out edges)
 *
 * NOTE: Default sources are now materialized as DSConst blocks by
 * GraphNormalizer.normalize() before compilation. Those blocks connect
 * via regular wire edges, so they appear as 'wire' writers here.
 *
 * Writers are NOT sorted here - call sortWriters() separately.
 *
 * @param endpoint - Target input endpoint
 * @param edges - All edges in the patch
 * @returns Array of writers (unsorted, may be empty)
 */
export function enumerateWriters(
  endpoint: InputEndpoint,
  edges: readonly Edge[]
): Writer[] {
  const writers: Writer[] = [];

  // Enumerate edges to this endpoint
  for (const edge of edges) {
    // Skip disabled edges
    if (!edge.enabled) continue;

    // Check if this edge targets our endpoint
    if (edge.to.kind !== 'port') continue;
    if (edge.to.blockId !== endpoint.blockId) continue;
    if (edge.to.slotId !== endpoint.slotId) continue;

    // After Sprint 2 migration, all edges are port→port
    if (edge.from.kind === 'port') {
      writers.push({
        kind: 'wire',
        from: { blockId: edge.from.blockId, slotId: edge.from.slotId },
        connId: edge.id,
      });
    }
  }

  // NOTE: No legacy defaultSource injection here.
  // DSConst blocks are materialized by GraphNormalizer.normalize() before compilation.
  // If writers.length === 0, it means the input has no connection AND no defaultSource,
  // which should be caught as an error by the caller.

  return writers;
}

// =============================================================================
// Combine Policy Resolution
// =============================================================================

/**
 * Get default combine policy.
 *
 * Default: { when: 'multi', mode: 'last' }
 *
 * This keeps "plumbing" painless and preserves deterministic behavior.
 *
 * @see design-docs/now/01-MultiBlock-Input.md §1.2
 */
export function getDefaultCombinePolicy(): CombinePolicy {
  return { when: 'multi', mode: 'last' };
}

/**
 * Resolve combine policy for an input slot.
 *
 * @param _inputSlot - The input slot definition (unused after Slot.combine removal)
 * @returns Combine policy (always default)
 */
export function resolveCombinePolicy(_inputSlot: Slot): CombinePolicy {
  return getDefaultCombinePolicy();
}

// =============================================================================
// Full Resolution
// =============================================================================

/**
 * Resolve all inputs for a block.
 *
 * For each input slot:
 * 1. Enumerate writers
 * 2. Sort writers deterministically
 * 3. Resolve combine policy
 * 4. Return ResolvedInputSpec
 *
 * @param block - Block instance
 * @param edges - All edges in the patch
 * @returns Map of slotId → ResolvedInputSpec
 */
export function resolveBlockInputs(
  block: Block,
  edges: readonly Edge[]
): Map<string, ResolvedInputSpec> {
  const resolved = new Map<string, ResolvedInputSpec>();

  const blockDef = getBlockDefinition(block.type);
  if (!blockDef) return resolved;

  for (const inputSlot of blockDef.inputs) {
    const endpoint: InputEndpoint = {
      blockId: block.id,
      slotId: inputSlot.id,
    };

    // Enumerate writers (DSConst edges are included via GraphNormalizer)
    const writers = enumerateWriters(endpoint, edges);

    // Sort deterministically
    const sortedWriters = sortWriters(writers);

    // Resolve combine policy
    const combine = resolveCombinePolicy(inputSlot);

    // Get port type - inputSlot.type is now TypeDesc object
    const portType = inputSlot.type;

    // Build resolved spec
    resolved.set(inputSlot.id, {
      endpoint,
      portType,
      writers: sortedWriters,
      combine,
    });
  }

  return resolved;
}

/**
 * Resolve a single input endpoint.
 *
 * Convenience function for resolving a specific input port.
 *
 * @param endpoint - Target input endpoint
 * @param edges - All edges in the patch
 * @param inputSlot - The input slot definition
 * @returns Resolved input spec
 */
export function resolveInput(
  endpoint: InputEndpoint,
  edges: readonly Edge[],
  inputSlot: Slot
): ResolvedInputSpec {
  // Enumerate writers (DSConst edges are included via GraphNormalizer)
  const writers = enumerateWriters(endpoint, edges);

  // Sort deterministically
  const sortedWriters = sortWriters(writers);

  // Resolve combine policy
  const combine = resolveCombinePolicy(inputSlot);

  // Get port type - inputSlot.type is now TypeDesc object
  const portType = inputSlot.type;

  return {
    endpoint,
    portType,
    writers: sortedWriters,
    combine,
  };
}
