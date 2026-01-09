/**
 * Type Checker Pass - SINGLE ENFORCER for type compatibility
 *
 * Validates all connections are type-compatible before lowering.
 * Catches type mismatches at compile time instead of runtime.
 *
 * Adheres to architectural law: SINGLE ENFORCER
 */

import type { NormalizedPatch } from '../../graph/normalize';
import { getBlock } from '../blocks/registry';
import type { SignalType, DomainRef, Cardinality } from '../../core/canonical-types';
import { isInstantiated, DEFAULTS_V0 } from '../../core/canonical-types';

/**
 * Compile error type for type checking
 */
export interface TypeCheckError {
  kind: 'TypeMismatch' | 'UnknownPort' | 'MissingRequiredInput';
  message: string;
  blockId: string;
  portId?: string;
}

/**
 * Check all edge connections for type compatibility
 *
 * @param patch - Normalized patch with blocks and edges
 * @returns Array of type check errors (empty if valid)
 */
export function checkTypes(patch: NormalizedPatch): TypeCheckError[] {
  const errors: TypeCheckError[] = [];

  for (const edge of patch.edges) {
    const sourceBlock = patch.blocks[edge.fromBlock];
    const targetBlock = patch.blocks[edge.toBlock];

    const sourceDef = getBlock(sourceBlock.type);
    const targetDef = getBlock(targetBlock.type);

    if (!sourceDef || !targetDef) {
      // Will be caught by "unknown block" error in lowering
      continue;
    }

    // Find port definitions
    const sourcePort = sourceDef.outputs.find(p => p.portId === edge.fromPort);
    const targetPort = targetDef.inputs.find(p => p.portId === edge.toPort);

    if (!sourcePort) {
      errors.push({
        kind: 'UnknownPort',
        message: `Source block '${sourceBlock.type}' does not have output port '${edge.fromPort}'`,
        blockId: sourceBlock.id,
        portId: edge.fromPort as string,
      });
      continue;
    }

    if (!targetPort) {
      errors.push({
        kind: 'UnknownPort',
        message: `Target block '${targetBlock.type}' does not have input port '${edge.toPort}'`,
        blockId: targetBlock.id,
        portId: edge.toPort as string,
      });
      continue;
    }

    // Check type compatibility
    const conversion = getCanonicalConversion(sourcePort.type, targetPort.type);
    if (conversion === null) {
      const sourceDesc = formatPortType(sourcePort.type);
      const targetDesc = formatPortType(targetPort.type);
      errors.push({
        kind: 'TypeMismatch',
        message: `Cannot connect ${sourceDesc} to ${targetDesc} (${sourceBlock.type}.${edge.fromPort} → ${targetBlock.type}.${edge.toPort})`,
        blockId: sourceBlock.id,
        portId: edge.fromPort as string,
      });
    }
  }

  // Check for missing required inputs
  for (const block of patch.blocks) {
    const blockDef = getBlock(block.type);
    if (!blockDef) continue;

    for (const inputPort of blockDef.inputs) {
      // Skip optional ports
      if (inputPort.optional) continue;

      // Check if this input is connected
      const isConnected = patch.edges.some(
        edge => edge.toBlock === patch.blocks.indexOf(block) && edge.toPort === inputPort.portId
      );

      if (!isConnected && !inputPort.defaultValue) {
        errors.push({
          kind: 'MissingRequiredInput',
          message: `Block '${block.type}' is missing required input '${inputPort.portId}'`,
          blockId: block.id,
          portId: inputPort.portId as string,
        });
      }
    }
  }

  return errors;
}

// =============================================================================
// Canonical Type Conversion Helpers
// =============================================================================

type PortType = SignalType | DomainRef;

type Conversion =
  | { kind: 'direct' }
  | { kind: 'promote'; from: 'zero'; to: 'one' }
  | { kind: 'broadcast' }
  | { kind: 'promote-broadcast' };

/**
 * Type guard for DomainRef.
 */
function isDomainRef(type: PortType): type is DomainRef {
  return 'kind' in type && type.kind === 'domain';
}

/**
 * Type guard for SignalType.
 */
function isSignalType(type: PortType): type is SignalType {
  return 'payload' in type;
}

/**
 * Get effective cardinality from a SignalType.
 */
function getCardinality(type: SignalType): Cardinality {
  const tag = type.extent.cardinality;
  return isInstantiated(tag) ? tag.value : DEFAULTS_V0.cardinality;
}

/**
 * Get cardinality "world" name for comparison.
 */
function cardinalityToWorld(card: Cardinality): 'zero' | 'one' | 'many' {
  return card.kind === 'zero' ? 'zero' : card.kind === 'one' ? 'one' : 'many';
}

/**
 * Check if source type can connect to target type.
 * Returns the conversion needed, or null if incompatible.
 */
function getCanonicalConversion(source: PortType, target: PortType): Conversion | null {
  // DomainRef can only connect to DomainRef
  if (isDomainRef(source) || isDomainRef(target)) {
    if (isDomainRef(source) && isDomainRef(target)) {
      return { kind: 'direct' };
    }
    return null; // Can't connect domain to non-domain
  }

  // Both are SignalType (narrow using type guard)
  const sourceSignal = source as SignalType;
  const targetSignal = target as SignalType;

  const sourceCard = cardinalityToWorld(getCardinality(sourceSignal));
  const targetCard = cardinalityToWorld(getCardinality(targetSignal));

  // Same cardinality and payload - direct
  if (sourceCard === targetCard && sourceSignal.payload === targetSignal.payload) {
    return { kind: 'direct' };
  }

  // Payload must match for automatic conversions
  if (sourceSignal.payload !== targetSignal.payload) {
    return null;
  }

  // Zero → One (promote)
  if (sourceCard === 'zero' && targetCard === 'one') {
    return { kind: 'promote', from: 'zero', to: 'one' };
  }

  // One → Many (broadcast)
  if (sourceCard === 'one' && targetCard === 'many') {
    return { kind: 'broadcast' };
  }

  // Zero → Many (promote then broadcast)
  if (sourceCard === 'zero' && targetCard === 'many') {
    return { kind: 'promote-broadcast' };
  }

  return null;
}

/**
 * Format a port type for error messages.
 */
function formatPortType(type: PortType): string {
  if (isDomainRef(type)) {
    return `domain:${type.id}`;
  }
  const signalType = type as SignalType;
  const card = cardinalityToWorld(getCardinality(signalType));
  return `${card}:${signalType.payload}`;
}
