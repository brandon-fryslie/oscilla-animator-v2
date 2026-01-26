/**
 * Type validation for ReactFlow connections.
 *
 * Validates port compatibility and provides type display utilities.
 * Based on compiler pass2-types.ts isTypeCompatible() logic.
 */

import type { Patch, BlockId } from '../../types';
import type { SignalType, PayloadType, Unit, ConcretePayloadType } from '../../core/canonical-types';
import { getAxisValue, DEFAULTS_V0, isPayloadVar } from '../../core/canonical-types';
import { getBlockDefinition } from '../../blocks/registry';
import { findAdapter, type AdapterSpec } from '../../graph/adapters';

// =============================================================================
// Type Colors - Visual differentiation by payload type
// =============================================================================

/**
 * Color palette for concrete payload types.
 */
export const TYPE_COLORS: Record<ConcretePayloadType, string> = {
  float: '#5a9fd4',   // Blue
  int: '#6366f1',     // Indigo
  vec2: '#22c55e',    // Green
  vec3: '#10b981',    // Emerald (darker green for 3D)

  color: '#ec4899',   // Magenta/Pink
  bool: '#f97316',    // Orange
  shape: '#facc15',   // Yellow
  cameraProjection: '#8b5cf6', // Purple (enum-like projection mode)
};

/**
 * Get color for a payload type.
 */
export function getTypeColor(payload: PayloadType): string {
  if (isPayloadVar(payload)) {
    return '#888888'; // Gray for unresolved payload variables
  }
  // After the isPayloadVar check, payload is now a ConcretePayloadType
  return TYPE_COLORS[payload as ConcretePayloadType] ?? TYPE_COLORS['float'];
}

// =============================================================================
// Type Display - Human-readable type strings
// =============================================================================

/**
 * Format a unit kind for display.
 * Returns short human-readable unit labels.
 */
export function formatUnitForDisplay(unit: Unit): string {
  switch (unit.kind) {
    case 'scalar': return '';
    case 'phase01': return 'phase';
    case 'radians': return 'rad';
    case 'degrees': return 'deg';
    case 'deg': return 'deg';
    case 'norm01': return '0..1';
    case 'ms': return 'ms';
    case 'seconds': return 's';
    case 'count': return '#';
    case 'ndc2': return 'ndc2';
    case 'ndc3': return 'ndc3';
    case 'world2': return 'world2';
    case 'world3': return 'world3';
    case 'rgba01': return 'rgba';
    case 'none': return '';
    case 'var': return `?`; // Unresolved unit variable (should not appear in UI)
  }
}

/**
 * Format a SignalType for display.
 * Returns strings like "Signal<float:phase>" or "Field<color>"
 */
export function formatTypeForDisplay(type: SignalType): string {
  const card = getAxisValue(type.extent.cardinality, DEFAULTS_V0.cardinality);
  const temp = getAxisValue(type.extent.temporality, DEFAULTS_V0.temporality);

  // Cardinality prefix
  let cardStr: string;
  switch (card.kind) {
    case 'zero':
      cardStr = 'Const';
      break;
    case 'one':
      cardStr = 'Signal';
      break;
    case 'many':
      cardStr = 'Field';
      break;
  }

  // Unit suffix (only show non-trivial units)
  const unitStr = formatUnitForDisplay(type.unit);
  const payloadUnit = unitStr ? `${type.payload}:${unitStr}` : type.payload;

  // Temporality suffix
  const tempSuffix = temp.kind === 'discrete' ? ' [event]' : '';

  return `${cardStr}<${payloadUnit}>${tempSuffix}`;
}

/**
 * Format a SignalType for tooltip with more detail.
 */
export function formatTypeForTooltip(type: SignalType): string {
  const card = getAxisValue(type.extent.cardinality, DEFAULTS_V0.cardinality);
  const temp = getAxisValue(type.extent.temporality, DEFAULTS_V0.temporality);

  const base = formatTypeForDisplay(type);

  // Add instance info for fields
  if (card.kind === 'many' && card.instance) {
    return `${base} [${card.instance.instanceId}]`;
  }

  return base;
}

// =============================================================================
// Port Type Lookup
// =============================================================================

/**
 * Get port type from block in patch.
 */
export function getPortType(
  patch: Patch,
  blockId: string,
  portId: string,
  direction: 'input' | 'output'
): SignalType | null {
  const block = patch.blocks.get(blockId as BlockId);
  if (!block) return null;

  const blockDef = getBlockDefinition(block.type);
  if (!blockDef) return null;

  const slots = direction === 'input' ? blockDef.inputs : blockDef.outputs;
  const slot = slots[portId];
  return slot?.type ?? null;
}

/**
 * Get port type directly from block type (without patch lookup).
 * Useful for static node rendering.
 */
export function getPortTypeFromBlockType(
  blockType: string,
  portId: string,
  direction: 'input' | 'output'
): SignalType | null {
  const blockDef = getBlockDefinition(blockType);
  if (!blockDef) return null;

  const slots = direction === 'input' ? blockDef.inputs : blockDef.outputs;
  const slot = slots[portId];
  return slot?.type ?? null;
}

// =============================================================================
// Domain Transformation (Stub)
// =============================================================================

/**
 * Check if a domain transformation exists between two domains.
 *
 * TODO: Implement domain transformation system when available.
 * For now, this is a stub that always returns false.
 *
 * Related epic: oscilla-animator-v2-s02 (Domain Transformation System/Adapters)
 *
 * @param fromDomain - Source domain
 * @param toDomain - Target domain
 * @returns true if a transformation exists, false otherwise
 */
function canTransformDomain(fromDomain: string, toDomain: string): boolean {
  // Stub: No transformation system implemented yet
  // When domain transformation system is ready, check it here
  return false;
}

// =============================================================================
// Type Compatibility
// =============================================================================

/**
 * Check if two types are directly compatible (no adapter needed).
 * Based on pass2-types.ts isTypeCompatible().
 *
 * For UI validation, we're more lenient with type variables (payloadVar, unitVar)
 * since they get resolved during compilation. This allows users to make connections
 * that will be validated properly by the compiler.
 */
function isTypeCompatible(from: SignalType, to: SignalType): boolean {
  const fromCard = getAxisValue(from.extent.cardinality, DEFAULTS_V0.cardinality);
  const fromTemp = getAxisValue(from.extent.temporality, DEFAULTS_V0.temporality);
  const toCard = getAxisValue(to.extent.cardinality, DEFAULTS_V0.cardinality);
  const toTemp = getAxisValue(to.extent.temporality, DEFAULTS_V0.temporality);

  // Payload must match, but payload variables are polymorphic
  const fromIsPayloadVar = isPayloadVar(from.payload);
  const toIsPayloadVar = isPayloadVar(to.payload);
  if (!fromIsPayloadVar && !toIsPayloadVar) {
    // Both concrete - must match exactly
    if (from.payload !== to.payload) {
      return false;
    }
  }
  // If either is a payload variable, allow connection (will be resolved at compile time)

  // Unit must match (per spec: no implicit conversion)
  // Exception: unit variables (unitVar) are polymorphic and match any unit
  if (from.unit.kind !== to.unit.kind) {
    // Unit variables are polymorphic - they can unify with any concrete unit
    const fromIsVar = from.unit.kind === 'var';
    const toIsVar = to.unit.kind === 'var';
    if (!fromIsVar && !toIsVar) {
      return false;
    }
  }

  // Temporality must match
  if (fromTemp.kind !== toTemp.kind) {
    return false;
  }

  // Cardinality must match
  if (fromCard.kind !== toCard.kind) {
    return false;
  }

  // For 'many' cardinality, check domain compatibility
  if (fromCard.kind === 'many' && toCard.kind === 'many') {
    const fromInstance = fromCard.instance;
    const toInstance = toCard.instance;
    if (!fromInstance || !toInstance) return false;

    // Instance IDs must match (same field instance)
    if (fromInstance.instanceId !== toInstance.instanceId) {
      return false;
    }

    // Domain types must match exactly OR have a valid transformation
    if (fromInstance.domainType === toInstance.domainType) {
      return true;
    }

    // Check if domain transformation exists (stub for now)
    return canTransformDomain(fromInstance.domainType, toInstance.domainType);
  }

  return true;
}

// =============================================================================
// Connection Validation
// =============================================================================

export interface ConnectionValidationResult {
  valid: boolean;
  reason?: string;
  /** Set when connection is valid only because an adapter will be auto-inserted */
  adapter?: AdapterSpec;
}

/**
 * Validate a connection between two ports.
 */
export function validateConnection(
  sourceBlockId: string,
  sourcePortId: string,
  targetBlockId: string,
  targetPortId: string,
  patch: Patch
): ConnectionValidationResult {
  // Prevent self-connections on same port
  if (sourceBlockId === targetBlockId && sourcePortId === targetPortId) {
    return { valid: false, reason: 'Cannot connect port to itself' };
  }

  // Get source type (output port)
  const sourceType = getPortType(patch, sourceBlockId, sourcePortId, 'output');
  if (!sourceType) {
    return { valid: false, reason: 'Unknown source port' };
  }

  // Get target type (input port)
  const targetType = getPortType(patch, targetBlockId, targetPortId, 'input');
  if (!targetType) {
    return { valid: false, reason: 'Unknown target port' };
  }

  // Check direct compatibility
  if (isTypeCompatible(sourceType, targetType)) {
    return { valid: true };
  }

  // Types don't match directly — check if an adapter can bridge them
  const adapter = findAdapter(sourceType, targetType);
  if (adapter) {
    return { valid: true, adapter };
  }

  return {
    valid: false,
    reason: `Type mismatch: ${formatTypeForDisplay(sourceType)} → ${formatTypeForDisplay(targetType)}`,
  };
}
