/**
 * Writer Resolution - Shared logic for resolving multiple value sources to inputs
 *
 * This module implements the canonical writer resolution model from the
 * Multi-Input Blocks specification. It handles:
 * - Enumerating all writers to an input endpoint (wires, bus listeners, defaults)
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
import type { Edge, Slot, Block, TypeDesc } from '../../types';
import type { CombinePolicy } from './combine-utils';
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
 * This includes BusBlock.out edges and DSConst.out edges (for default sources).
 *
 * NOTE: The 'default' kind was removed. Default sources are now materialized
 * as DSConst blocks by GraphNormalizer.normalize() before compilation.
 * Those DSConst blocks connect via regular wire edges.
 */
export type Writer = {
    kind: 'wire';
    from: {
        blockId: string;
        slotId: string;
    };
    connId: string;
};
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
/**
 * Get deterministic sort key for a writer.
 *
 * Sort order (ascending):
 * 1. Wires: "0:{from.blockId}:{from.slotId}:{connId}"
 * 2. Bus listeners: "1:{busId}:{listenerId}"
 * 3. Defaults: "2:{defaultId}"
 *
 * This ensures:
 * - Order-dependent modes ('last', 'first', 'layer') are deterministic
 * - Not dependent on insertion order, UI quirks, or JSON array order
 *
 * @see design-docs/now/01-MultiBlock-Input.md §3.1
 */
export declare function writerSortKey(w: Writer): string;
/**
 * Sort writers deterministically.
 *
 * Sorts by ascending writerSortKey(), ensuring stable order for
 * order-dependent combine modes.
 */
export declare function sortWriters(writers: readonly Writer[]): Writer[];
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
export declare function enumerateWriters(endpoint: InputEndpoint, edges: readonly Edge[]): Writer[];
/**
 * Get default combine policy.
 *
 * Default: { when: 'multi', mode: 'last' }
 *
 * This keeps "plumbing" painless and preserves deterministic behavior.
 *
 * @see design-docs/now/01-MultiBlock-Input.md §1.2
 */
export declare function getDefaultCombinePolicy(): CombinePolicy;
/**
 * Resolve combine policy for an input slot.
 *
 * NOTE: Slot no longer has a 'combine' property after Bus interface simplification.
 * All slots now use the default combine policy.
 *
 * @param _inputSlot - The input slot definition (unused after Slot.combine removal)
 * @returns Combine policy (always default)
 */
export declare function resolveCombinePolicy(_inputSlot: Slot): CombinePolicy;
/**
 * Resolve all inputs for a block.
 *
 * For each input slot:
 * 1. Enumerate writers (wires, bus listeners, defaults)
 * 2. Sort writers deterministically
 * 3. Resolve combine policy
 * 4. Return ResolvedInputSpec
 *
 * @param block - Block instance
 * @param edges - All edges in the patch
 * @returns Map of slotId → ResolvedInputSpec
 */
export declare function resolveBlockInputs(block: Block, edges: readonly Edge[]): Map<string, ResolvedInputSpec>;
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
export declare function resolveInput(endpoint: InputEndpoint, edges: readonly Edge[], inputSlot: Slot): ResolvedInputSpec;
