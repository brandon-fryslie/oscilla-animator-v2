/**
 * Combine Utilities - Shared logic for combining multiple value sources
 *
 * Combine logic reused by Pass 6 (multi-input port resolution).
 *
 * Key responsibilities:
 * - Create combine nodes for one/many/event worlds
 * - Validate combineMode against world/domain constraints
 * - Handle edge ordering for deterministic combine (sortKey)
 * - Support all combine modes (sum, average, max, min, last, layer, first, error)
 *
 * Sprint: Phase 0 - Sprint 3: Multi-Input Blocks
 * Updated: Multi-Input Blocks Integration (2026-01-01)
 */

import type { CombineMode } from "../../types/compiler";
import type { OrchestratorIRBuilder } from "../ir/OrchestratorIRBuilder";
import { isExprRef, type ValueRefExpr } from "../ir/lowerTypes";
import type { ValueExprId } from "../ir/Indices";
import { payloadStride, requireInst, type CanonicalType } from "../../core/canonical-types";

// =============================================================================
// Types
// =============================================================================

/**
 * Core payload domains for combine operations.
 */
// Numeric payload kinds that support arithmetic combine modes (sum/avg/min/max/mul).
// Note: 'color' is excluded despite matching vec4 stride because it uses layer semantics.
export const NUMERIC_PAYLOADS = ['float', 'int', 'vec2', 'vec3', 'vec4'] as const;
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
 * Validate that a combine mode is compatible with a slot's cardinality world and domain.
 *
 * Validation rules:
 * - 'last' is always valid (all worlds/domains)
 * - 'first' is always valid (all worlds/domains, opposite of 'last')
 * - One/Many worlds: All modes valid
 * - Config world: Only 'last'/'first' valid (stepwise changes)
 * - Scalar world: Multi-input not allowed (should emit error if N > 1)
 * - Numeric domains (float, int, vec2, vec3): sum/average/max/min/mul + first/last
 * - Handle semantics (canonical HANDLE carried as int payload): first/last/layer/collect/array only
 * - Color domain: Only 'last', 'first', and 'layer' valid
 * - String/boolean domains: Only 'last'/'first' valid
 *
 * @param mode - The combine mode to validate
 * @param world - The slot's world (one, many, config, scalar)
 * @param payloadOrType - The slot's payload kind or full canonical type
 * @returns Validation result with reason if invalid
 */
export function validateCombineMode(
  mode: CombineMode | 'error' | 'layer',
  world: 'one' | 'many' | 'scalar' | 'config',
  payloadOrType: CorePayload | string | CanonicalType
): CombineModeValidation {
  // 'error' mode is special - it rejects multiple writers
  if (mode === 'error') {
    return { valid: true }; // Validated separately in caller
  }

  // collect/array bypass combine semantics (per-edge types are preserved)
  if (mode === 'collect' || mode === 'array') {
    return { valid: true };
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

  // Domain-specific validation for one/many worlds
  const payloadKind = payloadKindOf(payloadOrType);
  const payloadLabel = payloadKind;

  // [LAW:one-source-of-truth] Handle semantics must be derived from canonical
  // type structure, not legacy payload aliases.
  if (isCanonicalHandleType(payloadOrType)) {
    if (mode === 'layer') {
      return { valid: true };
    }
    return {
      valid: false,
      reason: 'Handle payload only supports combineMode "last", "first", "layer", "collect", or "array"',
    };
  }

  if (NUMERIC_PAYLOADS.includes(payloadKind as typeof NUMERIC_PAYLOADS[number])) {
    if (mode === 'sum' || mode === 'average' || mode === 'max' || mode === 'min' || mode === 'mul') {
      return { valid: true };
    }
    return {
      valid: false,
      reason: `Numeric payload "${payloadLabel}" only supports combineMode "sum", "average", "max", "min", "mul", "last", or "first"`,
    };
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

  // Other domains only support 'last' and 'first'
  return {
    valid: false,
    reason: `Payload "${payloadLabel}" only supports combineMode "last" or "first"`,
  };
}

function payloadKindOf(payloadOrType: CorePayload | string | CanonicalType): string {
  if (typeof payloadOrType === 'string') return payloadOrType;
  return payloadOrType.payload.kind;
}

function isCanonicalHandleType(payloadOrType: CorePayload | string | CanonicalType): boolean {
  if (typeof payloadOrType === 'string') return false;
  return payloadOrType.payload.kind === 'int';
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

type BuilderCombineMode = 'sum' | 'average' | 'max' | 'min' | 'last' | 'product';

function mapCombineMode(mode: CombineMode): BuilderCombineMode {
  switch (mode) {
    case 'sum':
      return 'sum';
    case 'average':
      return 'average';
    case 'max':
      return 'max';
    case 'min':
      return 'min';
    case 'last':
      return 'last';
    case 'mul':
      return 'product';
    default:
      throw new Error(`Unsupported combine mode for numeric lowering: ${mode}`);
  }
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
 * - N=0: Returns null (caller should use the frontend-materialized fallback writer)
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
  builder: OrchestratorIRBuilder
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
    const combineMode = mapCombineMode(normalizedMode);

    if (isField) {
      const fieldId = builder.combine(exprIds, combineMode, type);
      const slot = builder.allocTypedSlot(type, `combine_field_${combineMode}`);
      builder.registerFieldSlot(fieldId, slot);
      return { id: fieldId, slot, type, stride: payloadStride(type.payload) };
    } else {
      const sigId = builder.combine(exprIds, combineMode, type);
      const slot = builder.allocTypedSlot(type, `combine_sig_${combineMode}`);
      builder.registerScalarSlot(sigId, slot);
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
// [LAW:locality-or-seam] Backend sorting consumes a minimal edge seam and does
// not depend on graph-era Edge contracts.
export interface SortableEdgeRef {
  readonly id: string;
  readonly sortKey?: number;
}

export function sortEdgesBySortKey(edges: readonly SortableEdgeRef[]): SortableEdgeRef[] {
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
