/**
 * Type validation for ReactFlow connections.
 *
 * Validates port compatibility and provides type display utilities.
 * Based on compiler pass2-types.ts isTypeCompatible() logic.
 */

import type { Patch, BlockId } from '../../types';
import type { SignalType, PayloadType } from '../../core/canonical-types';
import { getAxisValue, DEFAULTS_V0 } from '../../core/canonical-types';
import { getBlockDefinition } from '../../blocks/registry';

// =============================================================================
// Type Colors - Visual differentiation by payload type
// =============================================================================

/**
 * Color palette for payload types.
 */
export const TYPE_COLORS: Record<PayloadType, string> = {
  float: '#5a9fd4',   // Blue
  int: '#6366f1',     // Indigo
  vec2: '#22c55e',    // Green
  color: '#ec4899',   // Magenta/Pink
  phase: '#06b6d4',   // Cyan
  bool: '#f97316',    // Orange
  unit: '#a855f7',    // Purple
  shape: '#facc15',   // Yellow
  '???': '#9ca3af',   // Gray (polymorphic)
};

/**
 * Get color for a payload type.
 */
export function getTypeColor(payload: PayloadType): string {
  return TYPE_COLORS[payload] ?? TYPE_COLORS['???'];
}

// =============================================================================
// Type Display - Human-readable type strings
// =============================================================================

/**
 * Format a SignalType for display.
 * Returns strings like "Signal<float>" or "Field<color>"
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

  // Temporality suffix
  const tempSuffix = temp.kind === 'discrete' ? ' [event]' : '';

  return `${cardStr}<${type.payload}>${tempSuffix}`;
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
// Type Compatibility
// =============================================================================

/**
 * Check if two types are compatible.
 * Based on pass2-types.ts isTypeCompatible().
 */
function isTypeCompatible(from: SignalType, to: SignalType): boolean {
  const fromCard = getAxisValue(from.extent.cardinality, DEFAULTS_V0.cardinality);
  const fromTemp = getAxisValue(from.extent.temporality, DEFAULTS_V0.temporality);
  const toCard = getAxisValue(to.extent.cardinality, DEFAULTS_V0.cardinality);
  const toTemp = getAxisValue(to.extent.temporality, DEFAULTS_V0.temporality);

  // Payload must match (except '???' is polymorphic)
  if (from.payload !== to.payload) {
    if (from.payload !== '???' && to.payload !== '???') {
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

  // For 'many' cardinality, instance must match
  if (fromCard.kind === 'many' && toCard.kind === 'many') {
    const fromInstance = fromCard.instance;
    const toInstance = toCard.instance;
    if (!fromInstance || !toInstance) return false;
    return (
      fromInstance.domainType === toInstance.domainType &&
      fromInstance.instanceId === toInstance.instanceId
    );
  }

  return true;
}

// =============================================================================
// Connection Validation
// =============================================================================

export interface ConnectionValidationResult {
  valid: boolean;
  reason?: string;
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

  // Check compatibility
  if (!isTypeCompatible(sourceType, targetType)) {
    return {
      valid: false,
      reason: `Type mismatch: ${formatTypeForDisplay(sourceType)} → ${formatTypeForDisplay(targetType)}`,
    };
  }

  return { valid: true };
}
