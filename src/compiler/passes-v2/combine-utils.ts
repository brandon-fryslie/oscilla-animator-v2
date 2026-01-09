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

import type { CombineMode, Edge, SignalType } from "../../types";
import type { IRBuilder } from "../ir/IRBuilder";
import type { ValueRefPacked } from "../ir/lowerTypes";
import type { EventExprId } from "../ir/types";
import type { EventCombineMode } from "../ir/signalExpr";

// =============================================================================
// Types
// =============================================================================

/**
 * Core payload domains for combine operations.
 */
export type CorePayload = 'float' | 'int' | 'vec2' | 'color' | 'bool';

/**
 * Combine policy - controls when and how multiple writers are combined.
 *
 * This type was removed from editor/types.ts but is needed by the compiler.
 * Redefined here for compiler internal use.
 */
export type CombinePolicy =
  | { when: 'multi'; mode: CombineMode }
  | { when: 'always'; mode: CombineMode }
  | { when: 'multi'; mode: 'error' };

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

// =============================================================================
// Validation
// =============================================================================

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
 * @param payload - The slot's payload type (float, color, vec2, etc.)
 * @returns Validation result with reason if invalid
 */
export function validateCombineMode(
  mode: CombineMode | 'error' | 'layer',
  world: SlotWorld,
  payload: CorePayload | string
): CombineModeValidation {
  // 'error' mode is special - it rejects multiple writers
  if (mode === 'error') {
    return { valid: true }; // Validated separately in caller
  }

  // 'last' and 'first' are always valid for all worlds and domains
  if (mode === 'last' || mode === 'first') {
    return { valid: true };
  }

  // Scalar world doesn't support multi-input at all
  if (world === 'scalar') {
    return {
      valid: false,
      reason: 'Scalar inputs cannot have multiple sources (compile-time constants)',
    };
  }

  // Config world only supports 'last' and 'first' (stepwise changes)
  if (world === 'config') {
    return {
      valid: false,
      reason: 'Config inputs only support combineMode "last" or "first" (stepwise changes)',
    };
  }

  // Domain-specific validation for signal/field worlds
  const numericPayloads = ['float', 'int', 'vec2', 'vec3'];
  if (numericPayloads.includes(payload)) {
    // Numeric domains support all combine modes
    return { valid: true };
  }

  if (payload === 'color') {
    // Color domain only supports 'last', 'first', and 'layer'
    if (mode === 'layer') {
      return { valid: true };
    }
    return {
      valid: false,
      reason: 'Color domain only supports combineMode "last", "first", and "layer"',
    };
  }

  // Boolean and other domains only support 'last' and 'first'
  return {
    valid: false,
    reason: `Payload "${payload}" only supports combineMode "last" or "first"`,
  };
}

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
export function validateCombinePolicy(
  policy: CombinePolicy,
  writerCount: number
): CombineModeValidation {
  // Error mode rejects multiple writers
  if (policy.mode === 'error' && writerCount > 1) {
    return {
      valid: false,
      reason: `Input port forbids multiple writers (combine policy: error), but has ${writerCount} writers`,
    };
  }

  return { valid: true };
}

/**
 * Should combine be applied for this policy + writer count?
 *
 * @param policy - Combine policy
 * @param writerCount - Number of writers
 * @returns True if combine should be applied
 */
export function shouldCombine(policy: CombinePolicy, writerCount: number): boolean {
  if (policy.when === 'always') {
    return writerCount >= 1;
  }
  // when: 'multi'
  return writerCount >= 2;
}

// =============================================================================
// Combine Node Creation
// =============================================================================

/**
 * Normalize CombineMode to a standard mode for IR emission.
 *
 * Maps:
 * - 'first' → 'last' (inverse of sorted writer order)
 * - 'error' → Should never reach here (validated earlier)
 *
 * @param mode - CombineMode to normalize
 * @returns Normalized mode for IR emission
 */
function normalizeCombineMode(mode: CombineMode | 'error' | 'layer'): CombineMode {
  if (mode === 'first') {
    return 'last'; // 'first' is 'last' with reversed order
  }
  if (mode === 'error') {
    throw new Error('Internal error: combine mode "error" should be validated before combine node creation');
  }
  if (mode === 'layer') {
    // layer is semantic alias for last in field context
    return 'last';
  }
  // Must be a standard CombineMode
  return mode as CombineMode;
}

/**
 * Create a combine node for N inputs with the specified combine mode.
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
 * @param type - Legacy type descriptor (world, domain) or SignalType
 * @param builder - IRBuilder for emitting nodes
 * @returns Combined ValueRefPacked or null if no inputs
 */
export function createCombineNode(
  mode: CombineMode | 'error' | 'layer',
  inputs: readonly ValueRefPacked[],
  type: SignalType,
  builder: IRBuilder
): ValueRefPacked | null {
  // Handle empty inputs - caller should materialize default
  if (inputs.length === 0) {
    return null;
  }

  // Normalize mode
  const normalizedMode = normalizeCombineMode(mode);

  // Handle 'first' mode by reversing input order
  const orderedInputs = mode === 'first' ? [...inputs].reverse() : inputs;

  // Note: Caller should handle N=1 case with direct passthrough for optimization.
  // We still create a combine node here for semantic clarity (e.g., 'last' of 1 item).

  // Collect terms by world type
  const sigTerms: number[] = [];
  const fieldTerms: number[] = [];
  const eventTerms: EventExprId[] = [];

  for (const ref of orderedInputs) {
    if (ref.k === "sig") {
      sigTerms.push(ref.id);
    } else if (ref.k === "field") {
      fieldTerms.push(ref.id);
    } else if (ref.k === "event") {
      eventTerms.push(ref.id);
    }
  }

  // FIX IMMEDIATELY
  // Determine world from legacy type or infer from inputs
  const world = ('world' in type) ? type.world :
                (sigTerms.length > 0 ? 'signal' :
                 fieldTerms.length > 0 ? 'field' :
                 eventTerms.length > 0 ? 'event' : 'signal');

  // Convert to SignalType if needed (for IRBuilder API)
  const signalType = ('payload' in type) ? type : type as unknown as SignalType;

  // Handle Signal world
  if (world === "signal") {
    if (sigTerms.length === 0) {
      return null; // No valid signal terms
    }

    // Map to Signal combine mode
    const validModes = ["sum", "average", "max", "min", "last"];
    const safeMode = validModes.includes(normalizedMode) ? normalizedMode : "last";
    const combineMode = safeMode as "sum" | "average" | "max" | "min" | "last";

    const sigId = builder.sigCombine(sigTerms, combineMode, signalType);
    const slot = builder.allocValueSlot(signalType, `combine_sig_${combineMode}`);
    builder.registerSigSlot(sigId, slot);
    return { k: "sig", id: sigId, slot };
  }

  // Handle Field world
  if (world === "field") {
    if (fieldTerms.length === 0) {
      return null; // No valid field terms
    }

    // Map to Field combine mode
    const validModes = ["sum", "average", "max", "min", "last", "product"];
    const safeMode = validModes.includes(normalizedMode) ? normalizedMode : "product";
    const combineMode = safeMode as "sum" | "average" | "max" | "min" | "last" | "product";

    const fieldId = builder.fieldCombine(fieldTerms, combineMode, signalType);
    const slot = builder.allocValueSlot(signalType, `combine_field_${combineMode}`);
    builder.registerFieldSlot(fieldId, slot);
    return { k: "field", id: fieldId, slot };
  }

  // Handle Event world
  if (world === "event") {
    if (eventTerms.length === 0) {
      return null; // No valid event terms
    }

    // Map BLOCK combineMode to event combine semantics
    // For events: 'merge' combines all streams, 'last' takes only last publisher
    const eventMode: EventCombineMode = normalizedMode === 'last' ? 'last' : 'merge';
    const eventId = builder.eventCombine(eventTerms, eventMode, signalType);
    const slot = builder.allocValueSlot(signalType, `combine_event_${eventMode}`);
    builder.registerEventSlot(eventId, slot);
    return { k: "event", id: eventId, slot };
  }

  // Unsupported world
  return null;
}

/**
 * Sort edges by sortKey (ascending), breaking ties by edge ID.
 *
 * This ensures deterministic ordering for combine modes where order matters
 * ('last', 'first', 'layer'). The last edge in the sorted array "wins" for 'last' mode.
 *
 * @param edges - Edges to sort
 * @returns Sorted edges (ascending sortKey, ties broken by ID)
 */
export function sortEdgesBySortKey(edges: readonly Edge[]): Edge[] {
  return [...edges].sort((a, b) => {
    // Sort by sortKey (ascending)
    const sortKeyA = a.sortKey ?? 0;
    const sortKeyB = b.sortKey ?? 0;
    if (sortKeyA !== sortKeyB) {
      return sortKeyA - sortKeyB;
    }
    // Break ties by edge ID (lexicographic)
    return a.id.localeCompare(b.id);
  });
}
