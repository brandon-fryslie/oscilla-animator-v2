/**
 * Combine Utilities - Shared logic for combining multiple value sources
 *
 * Combine logic reused by Pass 6 (multi-input port resolution).
 *
 * Key responsibilities:
 * - Create combine nodes for Signal/Field/Event worlds
 * - Validate combineMode against world/domain constraints
 * - Handle edge ordering for deterministic combine (sortKey)
 * - Support all combine modes (sum, average, max, min, last, layer, first, error)
 *
 * Sprint: Phase 0 - Sprint 3: Multi-Input Blocks
 * Updated: Multi-Input Blocks Integration (2026-01-01)
 */
import type { CombineMode, Edge } from "../../types";
import type { TypeDesc } from "../../core/types";
import type { CoreDomain } from "../../core/types";
import type { IRBuilder } from "../ir/IRBuilder";
import type { ValueRefPacked } from "../ir/lowerTypes";
/**
 * Combine policy - controls when and how multiple writers are combined.
 *
 * This type was removed from editor/types.ts but is needed by the compiler.
 * Redefined here for compiler internal use.
 */
export type CombinePolicy = {
    when: 'multi';
    mode: CombineMode;
} | {
    when: 'always';
    mode: CombineMode;
} | {
    when: 'multi';
    mode: 'error';
};
/**
 * SlotWorld - subset of TypeWorld for runtime-evaluated values.
 *
 * This type was removed from editor/types.ts but is needed by the compiler.
 * Redefined here for compiler internal use.
 */
export type SlotWorld = 'signal' | 'field' | 'scalar' | 'config';
/**
 * Result of combine mode validation.
 */
export interface CombineModeValidation {
    /** Whether the combine mode is valid for this world/domain */
    valid: boolean;
    /** Human-readable reason if invalid */
    reason?: string;
}
/**
 * Validate that a combine mode is compatible with a slot's world and domain.
 *
 * Validation rules:
 * - 'last' is always valid (all worlds/domains)
 * - 'first' is always valid (all worlds/domains, opposite of 'last')
 * - Signal/Field worlds: All modes valid
 * - Config world: Only 'last'/'first' valid (stepwise changes)
 * - Scalar world: Multi-input not allowed (should emit error if N > 1)
 * - Numeric domains (float, int, vec2, vec3): All modes valid
 * - Color domain: Only 'last', 'first', and 'layer' valid
 * - String/boolean domains: Only 'last'/'first' valid
 *
 * @param mode - The combine mode to validate
 * @param world - The slot's world (signal, field, config, scalar)
 * @param domain - The slot's domain (float, color, vec2, etc.)
 * @returns Validation result with reason if invalid
 */
export declare function validateCombineMode(mode: CombineMode | 'error' | 'layer', world: SlotWorld, domain: CoreDomain): CombineModeValidation;
/**
 * Validate combine policy against writer count.
 *
 * Enforces policy semantics:
 * - when: 'multi', mode: 'error' → Reject if N > 1
 * - when: 'always' → Always combine (even N=1)
 * - when: 'multi' → Only combine if N >= 2
 *
 * @param policy - Combine policy
 * @param writerCount - Number of writers
 * @returns Validation result with reason if invalid
 */
export declare function validateCombinePolicy(policy: CombinePolicy, writerCount: number): CombineModeValidation;
/**
 * Should combine be applied for this policy + writer count?
 *
 * @param policy - Combine policy
 * @param writerCount - Number of writers
 * @returns True if combine should be applied
 */
export declare function shouldCombine(policy: CombinePolicy, writerCount: number): boolean;
/**
 * Create a combine node for N inputs with the specified combine mode.
 *
 * This is the core combine logic extracted from Pass 7 bus lowering.
 * Handles Signal, Field, and Event worlds with all combine modes.
 *
 * Edge ordering:
 * - Inputs are assumed to be pre-sorted by the caller
 * - For 'last' and 'layer' modes, order matters (last input wins)
 * - For 'first' mode, reverse the input order before combining (first input wins)
 * - For commutative modes (sum, average, max, min), order doesn't affect result
 *
 * Special cases:
 * - N=0: Returns null (caller should use defaultSource)
 * - N=1: Caller should optimize by using direct passthrough
 *
 * @param mode - Combine mode (sum, average, max, min, last, first, layer)
 * @param inputs - Pre-sorted input ValueRefs (ascending sortKey, ties by edge ID)
 * @param type - Type descriptor (world, domain, category)
 * @param builder - IRBuilder for emitting nodes
 * @returns Combined ValueRefPacked or null if no inputs
 */
export declare function createCombineNode(mode: CombineMode | 'error' | 'layer', inputs: readonly ValueRefPacked[], type: TypeDesc, builder: IRBuilder): ValueRefPacked | null;
/**
 * Sort edges by sortKey (ascending), breaking ties by edge ID.
 *
 * This ensures deterministic ordering for combine modes where order matters
 * ('last', 'first', 'layer'). The last edge in the sorted array "wins" for 'last' mode.
 *
 * @param edges - Edges to sort
 * @returns Sorted edges (ascending sortKey, ties broken by ID)
 */
export declare function sortEdgesBySortKey(edges: readonly Edge[]): Edge[];
