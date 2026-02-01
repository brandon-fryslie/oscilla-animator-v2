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

import type { CombineMode, Edge, CanonicalType } from "../../types";
import type { IRBuilder } from "../ir/IRBuilder";
import { isExprRef, type ValueRefExpr } from "../ir/lowerTypes";
import type { ValueExprId } from "../ir/Indices";
import { payloadStride, requireInst } from "../../core/canonical-types";

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
  world: 'signal' | 'field' | 'scalar' | 'config',
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
  // Normalize payload to kind string (handles both string and object forms)
  const payloadKind = typeof payload === 'string' ? payload : payload;
  const numericPayloads = ['float', 'int', 'vec2', 'vec3'];
  if (numericPayloads.includes(payloadKind)) {
    // Numeric domains support all combine modes
    return { valid: true };
  }

  if (payloadKind === 'color') {
    // Color domain only supports 'last', 'first', and 'layer'
    if (mode === 'layer') {
      return { valid: true };
    }
    return {
      valid: false,
      reason: 'Color domain only supports combineMode "last", "first", and "layer"',
    };
  }

  if (payloadKind === 'shape') {
    // Shape domain only supports 'last', 'first', and 'layer' (not numeric combines)
    if (mode === 'layer') {
      return { valid: true };
    }
    return {
      valid: false,
      reason: 'Shape domain only supports combineMode "last", "first", and "layer"',
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
 * @param type - Legacy type descriptor (world, domain) or CanonicalType
 * @param builder - IRBuilder for emitting nodes
 * @returns Combined ValueRefPacked or null if no inputs
 */
export function createCombineNode(
  mode: CombineMode | 'error' | 'layer',
  inputs: readonly ValueRefExpr[],
  type: CanonicalType,
  builder: IRBuilder
): ValueRefExpr | null {
  // Handle empty inputs - caller should materialize default
  if (inputs.length === 0) {
    return null;
  }

  // Normalize mode
  const normalizedMode = normalizeCombineMode(mode);

  // Handle 'first' mode by reversing input order
  const orderedInputs = mode === 'first' ? [...inputs].reverse() : inputs;

  // Collect expression IDs from all inputs
  const exprIds: ValueExprId[] = [];
  for (const ref of orderedInputs) {
    if (isExprRef(ref)) {
      exprIds.push(ref.id);
    }
  }

  if (exprIds.length === 0) {
    return null;
  }

  // Derive kind from the port type by checking extent directly
  const temp = requireInst(type.extent.temporality, 'temporality');
  const isEvent = temp.kind === 'discrete';

  if (!isEvent) {
    const card = requireInst(type.extent.cardinality, 'cardinality');
    const isField = card.kind === 'many';

    if (isField) {
      // Field combine
      const validModes = ["sum", "average", "max", "min", "last", "product"];
      const safeMode = validModes.includes(normalizedMode) ? normalizedMode : "product";
      const combineMode = safeMode as "sum" | "average" | "max" | "min" | "last" | "product";

      const fieldId = builder.combine(exprIds, combineMode, type);
      const slot = builder.allocTypedSlot(type, `combine_field_${combineMode}`);
      builder.registerFieldSlot(fieldId, slot);
      return { id: fieldId, slot, type, stride: payloadStride(type.payload) };
    } else {
      // Signal combine
      const validModes = ["sum", "average", "max", "min", "last"];
      const safeMode = validModes.includes(normalizedMode) ? normalizedMode : "last";
      const combineMode = safeMode as "sum" | "average" | "max" | "min" | "last";

      const sigId = builder.combine(exprIds, combineMode, type);
      const slot = builder.allocTypedSlot(type, `combine_sig_${combineMode}`);
      builder.registerSigSlot(sigId, slot);
      return { id: sigId, slot, type, stride: payloadStride(type.payload) };
    }
  } else {
    // Event combine
    const eventMode = normalizedMode === 'last' ? 'any' : 'any';
    const eventId = builder.eventCombine(exprIds, eventMode);
    const eventSlot = builder.allocEventSlot(eventId);
    const slot = builder.allocTypedSlot(type, `combine_event`);
    return { id: eventId, slot, type, stride: 1, eventSlot };
  }
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
