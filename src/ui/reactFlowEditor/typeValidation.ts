/**
 * Type validation for ReactFlow connections.
 *
 * Validates port compatibility and provides type display utilities.
 * Based on compiler pass2-types.ts isTypeCompatible() logic.
 */

import type { Patch, BlockId } from '../../types';
import type {
  UnitType,
  ConcretePayloadType,
  CardinalityValue,
  TemporalityValue,
} from '../../core/canonical-types';
import { unitsEqual } from '../../core/canonical-types';
import { isPayloadVar, type InferenceCanonicalType, type InferencePayloadType, type InferenceUnitType } from '../../core/inference-types';
import { isAxisVar } from '../../core/canonical-types';
import { ALL_CONCRETE_PAYLOADS, getAnyBlockDefinition, isPayloadAllowed } from '../../blocks/registry';
import { findAdapterChain, type AdapterSpec } from '../../blocks/adapter-spec';

const missingPortWarnings = new Set<string>();
const typeValidationIssues: Array<{
  readonly level: 'warn';
  readonly message: string;
  readonly blockType: string;
  readonly portId: string;
  readonly direction: 'input' | 'output';
}> = [];
let typeValidationIssueReporter:
  | ((issue: {
      readonly level: 'warn';
      readonly message: string;
      readonly blockType: string;
      readonly portId: string;
      readonly direction: 'input' | 'output';
    }) => void)
  | null = null;

export function setTypeValidationIssueReporter(
  reporter:
    | ((issue: {
        readonly level: 'warn';
        readonly message: string;
        readonly blockType: string;
        readonly portId: string;
        readonly direction: 'input' | 'output';
      }) => void)
    | null
): void {
  typeValidationIssueReporter = reporter;
}

export function getTypeValidationIssues(): ReadonlyArray<{
  readonly level: 'warn';
  readonly message: string;
  readonly blockType: string;
  readonly portId: string;
  readonly direction: 'input' | 'output';
}> {
  return typeValidationIssues;
}

export function clearTypeValidationIssues(): void {
  typeValidationIssues.length = 0;
  missingPortWarnings.clear();
}

function warnMissingPort(blockType: string, portId: string, direction: 'input' | 'output'): void {
  const key = `${blockType}:${direction}:${portId}`;
  if (missingPortWarnings.has(key)) {
    return;
  }
  missingPortWarnings.add(key);
  // [LAW:single-enforcer] Missing-port warnings are emitted once at this projection boundary.
  const issue = {
    level: 'warn' as const,
    message: `[typeValidation] Missing ${direction} port '${portId}' on block '${blockType}'`,
    blockType,
    portId,
    direction,
  };
  typeValidationIssues.push(issue);
  if (typeValidationIssues.length > 100) {
    typeValidationIssues.shift();
  }
  typeValidationIssueReporter?.(issue);
}

// =============================================================================
// Type Colors - Visual differentiation by payload type
// =============================================================================

/**
 * Color palette for concrete payload types.
 */
export const TYPE_COLORS: Record<ConcretePayloadType["kind"], string> = {
  float: '#5a9fd4',   // Blue
  int: '#6366f1',     // Indigo
  vec2: '#22c55e',    // Green
  vec3: '#10b981',    // Emerald (darker green for 3D)
  vec4: '#059669',    // Teal (4D vector)
  color: '#ec4899',   // Magenta/Pink
  bool: '#f97316',    // Orange
  cameraProjection: '#8b5cf6', // Purple (enum-like projection mode)
};

const DEFAULT_CARDINALITY: CardinalityValue = { kind: 'one' };
const DEFAULT_TEMPORALITY: TemporalityValue = { kind: 'continuous' };

function getInstantiatedCardinality(t: InferenceCanonicalType): CardinalityValue {
  return t.extent.cardinality.kind === 'inst' ? t.extent.cardinality.value : DEFAULT_CARDINALITY;
}

function getInstantiatedTemporality(t: InferenceCanonicalType): TemporalityValue {
  return t.extent.temporality.kind === 'inst' ? t.extent.temporality.value : DEFAULT_TEMPORALITY;
}

function inferenceUnitsEqual(a: UnitType | InferenceUnitType, b: UnitType | InferenceUnitType): boolean {
  // Unit vars are polymorphic — match anything during UI validation
  if (a.kind === 'var' || b.kind === 'var') return true;
  // Delegate to canonical unitsEqual for structural comparison of structured units
  return unitsEqual(a as UnitType, b as UnitType);
}

/**
 * Get color for a payload type.
 */
export function getTypeColor(payload: InferencePayloadType): string {
  if (isPayloadVar(payload)) {
    return '#888888'; // Gray for unresolved payload variables
  }
  // After the isPayloadVar check, payload is now a ConcretePayloadType
  return TYPE_COLORS[(payload as ConcretePayloadType).kind];
}

// =============================================================================
// Type Display - Human-readable type strings
// =============================================================================

/**
 * Format a unit kind for display.
 * Returns short human-readable unit labels.
 *
 * Updated for structured UnitType (#18):
 * - Simple kinds: none, scalar, norm01, count
 * - Structured kinds: angle{radians|degrees|phase01}, time{ms|seconds},
 *   space{ndc|world|view,dims}, color{rgba01}
 */
export function formatUnitForDisplay(unit: UnitType | InferenceUnitType): string {
  if (unit.kind === 'var') return ''; // Inference vars have no display

  switch (unit.kind) {
    case 'none':
      return '';
    case 'count':
      return 'count';

    // Structured: angle
    case 'angle': {
      const angleUnit = (unit as Extract<UnitType, { kind: 'angle' }>).unit;
      switch (angleUnit) {
        case 'turns': return 'phase';
        case 'radians': return 'rad';
        case 'degrees': return 'deg';
      }
      return '';
    }

    // Structured: time
    case 'time': {
      const timeUnit = (unit as Extract<UnitType, { kind: 'time' }>).unit;
      switch (timeUnit) {
        case 'ms': return 'ms';
        case 'seconds': return 's';
      }
      return '';
    }

    // Structured: space
    case 'space': {
      const spaceType = unit as Extract<UnitType, { kind: 'space' }>;
      const suffix = spaceType.dims;
      switch (spaceType.unit) {
        case 'ndc': return `ndc${suffix}`;
        case 'world': return `world${suffix}`;
        case 'view': return `view${suffix}`;
      }
      return '';
    }

    // Structured: color
    case 'color': {
      const colorUnit = (unit as Extract<UnitType, { kind: 'color' }>).unit;
      return colorUnit === 'rgba01' ? 'rgba' : '';
    }

    default: {
      const _exhaustive: never = unit;
      return '';
    }
  }
}

/**
 * Format a CanonicalType for display.
 * Returns strings like "One<float:phase>" or "Many<color>"
 */
export function formatTypeForDisplay(type: InferenceCanonicalType): string {
  const card = getInstantiatedCardinality(type);
  const temp = getInstantiatedTemporality(type);

  // Cardinality prefix
  let cardStr: string;
  switch (card.kind) {
    case 'zero':
      cardStr = 'Const';
      break;
    case 'one':
      cardStr = 'One';
      break;
    case 'many':
      cardStr = 'Many';
      break;
    default: {
      const _exhaustive: never = card;
      cardStr = 'Unknown';
    }
  }

  // Unit suffix (only show non-trivial units)
  const unitStr = formatUnitForDisplay(type.unit);
  const payloadKind = type.payload.kind;
  const payloadUnit = unitStr ? `${payloadKind}:${unitStr}` : payloadKind;

  // Temporality suffix
  const tempSuffix = temp.kind === 'discrete' ? ' [event]' : '';

  return `${cardStr}<${payloadUnit}>${tempSuffix}`;
}

/**
 * Format a CanonicalType for tooltip with more detail.
 */
export function formatTypeForTooltip(type: InferenceCanonicalType): string {
  const card = getInstantiatedCardinality(type);

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
): InferenceCanonicalType | null {
  const block = patch.blocks.get(blockId as BlockId);
  if (!block) return null;

  const blockDef = getAnyBlockDefinition(block.type);
  if (!blockDef) return null;

  const slots = direction === 'input' ? blockDef.inputs : blockDef.outputs;
  const slot = slots[portId];
  if (!slot) {
    warnMissingPort(block.type, portId, direction);
    return null;
  }
  return slot.type ?? null;
}

/**
 * Get port type directly from block type (without patch lookup).
 * Useful for static node rendering.
 */
export function getPortTypeFromBlockType(
  blockType: string,
  portId: string,
  direction: 'input' | 'output'
): InferenceCanonicalType | null {
  const blockDef = getAnyBlockDefinition(blockType);
  if (!blockDef) return null;

  const slots = direction === 'input' ? blockDef.inputs : blockDef.outputs;
  const slot = slots[portId];
  if (!slot) {
    warnMissingPort(blockType, portId, direction);
    return null;
  }
  return slot.type ?? null;
}

// =============================================================================
// Domain Transformation
// =============================================================================

/**
 * Check if a domain transformation exists between two domains.
 *
 * Domain transforms are currently unsupported in ReactFlow validation.
 * Connection validity requires exact domain identity until transform adapters
 * are introduced at the compiler boundary.
 *
 * @param fromDomain - Source domain
 * @param toDomain - Target domain
 * @returns true if a transformation exists, false otherwise
 */
function canTransformDomain(_fromDomain: string, _toDomain: string): boolean {
  return false;
}

// =============================================================================
// Type Compatibility
// =============================================================================

/**
 * Port context for type compatibility checking.
 * Contains both the type and block/port metadata needed to consult allowedPayloads.
 */
interface PortContext {
  type: InferenceCanonicalType;
  blockType: string;
  portId: string;
}

function payloadAllowedByContext(context: PortContext, payload: ConcretePayloadType): boolean {
  const allowed = isPayloadAllowed(context.blockType, context.portId, payload);
  // undefined => unconstrained port metadata => allowed
  return allowed !== false;
}

/**
 * Check if two payloads are compatible, consulting block metadata when needed.
 *
 * Handles three cases:
 * 1. Both concrete and matching → compatible
 * 2. Both concrete but not matching → check allowedPayloads metadata
 * 3. At least one payloadVar → check allowedPayloads metadata
 *
 * This fixes crio.1 (payloadVar matches everything) and crio.2 (concrete placeholders
 * don't reflect actual constraints).
 */
function arePayloadsCompatible(
  fromPayload: InferencePayloadType,
  toPayload: InferencePayloadType,
  fromContext: PortContext,
  toContext: PortContext
): boolean {
  const fromIsVar = isPayloadVar(fromPayload);
  const toIsVar = isPayloadVar(toPayload);

  // Case 1: Both concrete and matching → compatible
  if (!fromIsVar && !toIsVar) {
    const fromConcrete = fromPayload as ConcretePayloadType;
    const toConcrete = toPayload as ConcretePayloadType;

    if (fromConcrete.kind === toConcrete.kind) {
      return true;
    }

    // Case 2: Both concrete but not matching → check if target allows source payload
    const targetAllows = isPayloadAllowed(toContext.blockType, toContext.portId, fromConcrete);
    if (targetAllows === true) {
      return true;
    }

    // Also check if source constrains outputs that include target's payload
    const sourceAllows = isPayloadAllowed(fromContext.blockType, fromContext.portId, toConcrete);
    if (sourceAllows === true) {
      return true;
    }

    return false;
  }

  // Case 3: At least one payloadVar → consult allowedPayloads

  // If source is var, check if it allows target's payload (if target is concrete)
  if (fromIsVar && !toIsVar) {
    const toConcrete = toPayload as ConcretePayloadType;
    const sourceAllows = isPayloadAllowed(fromContext.blockType, fromContext.portId, toConcrete);
    // undefined means no constraints → allow
    // true means explicitly allowed
    // false means explicitly disallowed
    if (sourceAllows === false) {
      return false;
    }
    return true;
  }

  // If target is var, check if it allows source's payload (if source is concrete)
  if (toIsVar && !fromIsVar) {
    const fromConcrete = fromPayload as ConcretePayloadType;
    const targetAllows = isPayloadAllowed(toContext.blockType, toContext.portId, fromConcrete);
    if (targetAllows === false) {
      return false;
    }
    return true;
  }

  // Both are vars → check if their constraint sets overlap
  if (fromIsVar && toIsVar) {
    // [LAW:one-source-of-truth] Var payload compatibility is derived from
    // canonical block payload constraints (allowedPayloads), not UI-local rules.
    return ALL_CONCRETE_PAYLOADS.some(
      (payload) =>
        payloadAllowedByContext(fromContext, payload) &&
        payloadAllowedByContext(toContext, payload)
    );
  }

  return false;
}

/**
 * Check if two types are directly compatible (no adapter needed).
 * Based on pass2-types.ts isTypeCompatible().
 *
 * This version consults block metadata to properly validate polymorphic blocks.
 */
function arePortsCompatible(from: PortContext, to: PortContext): boolean {
  const fromCard = getInstantiatedCardinality(from.type);
  const fromTemp = getInstantiatedTemporality(from.type);
  const toCard = getInstantiatedCardinality(to.type);
  const toTemp = getInstantiatedTemporality(to.type);

  // Payload compatibility (with metadata-aware checking)
  if (!arePayloadsCompatible(from.type.payload, to.type.payload, from, to)) {
    return false;
  }

  // Unit must match (per spec: no implicit conversion)
  // Exception: unit variables (unitVar) are polymorphic and match any unit
  if (!inferenceUnitsEqual(from.type.unit, to.type.unit)) {
    return false;
  }

  // Temporality: axis vars are polymorphic (match anything), same as payload/unit vars
  const fromTempVar = isAxisVar(from.type.extent.temporality);
  const toTempVar = isAxisVar(to.type.extent.temporality);
  if (!fromTempVar && !toTempVar && fromTemp.kind !== toTemp.kind) {
    return false;
  }

  // Cardinality: axis vars are polymorphic (match anything), same as payload/unit vars
  const fromCardVar = isAxisVar(from.type.extent.cardinality);
  const toCardVar = isAxisVar(to.type.extent.cardinality);
  if (!fromCardVar && !toCardVar && fromCard.kind !== toCard.kind) {
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
    if (fromInstance.domainTypeId === toInstance.domainTypeId) {
      return true;
    }

    // Domain transforms are currently unsupported at this boundary.
    return canTransformDomain(fromInstance.domainTypeId, toInstance.domainTypeId);
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
  /** Set when connection is valid only via a multi-step adapter chain */
  adapterChain?: ReadonlyArray<{
    blockType: string;
    inputPortId: string;
    outputPortId: string;
  }>;
}

function adapterSpecFromChainStep(
  step: { blockType: string; inputPortId: string; outputPortId: string }
): AdapterSpec | undefined {
  const blockDef = getAnyBlockDefinition(step.blockType);
  const spec = blockDef && 'adapterSpec' in blockDef ? blockDef.adapterSpec : undefined;
  if (!spec) {
    return undefined;
  }
  return { blockType: step.blockType, ...spec };
}

export type PortTypeLookupFn = (
  blockId: string,
  portId: string,
  direction: 'input' | 'output'
) => InferenceCanonicalType | null | undefined;

function resolvePortType(
  patch: Patch,
  blockId: string,
  portId: string,
  direction: 'input' | 'output',
  resolvedPortTypeLookup?: PortTypeLookupFn,
): InferenceCanonicalType | null {
  // [LAW:one-source-of-truth] Prefer compiler-resolved port types when available;
  // static block-definition types remain a fallback for pre-frontend states.
  const resolved = resolvedPortTypeLookup?.(blockId, portId, direction);
  if (resolved) {
    return resolved;
  }
  return getPortType(patch, blockId, portId, direction);
}

/**
 * Validate a connection between two ports.
 */
export function validateConnection(
  sourceBlockId: string,
  sourcePortId: string,
  targetBlockId: string,
  targetPortId: string,
  patch: Patch,
  resolvedPortTypeLookup?: PortTypeLookupFn,
): ConnectionValidationResult {
  // Prevent self-connections on same port
  if (sourceBlockId === targetBlockId && sourcePortId === targetPortId) {
    return { valid: false, reason: 'Cannot connect port to itself' };
  }

  // Get source type (output port)
  const sourceType = resolvePortType(
    patch,
    sourceBlockId,
    sourcePortId,
    'output',
    resolvedPortTypeLookup,
  );
  if (!sourceType) {
    return { valid: false, reason: 'Unknown source port' };
  }

  // Get target type (input port)
  const targetType = resolvePortType(
    patch,
    targetBlockId,
    targetPortId,
    'input',
    resolvedPortTypeLookup,
  );
  if (!targetType) {
    return { valid: false, reason: 'Unknown target port' };
  }

  // Get block types for metadata lookup
  const sourceBlock = patch.blocks.get(sourceBlockId as BlockId);
  const targetBlock = patch.blocks.get(targetBlockId as BlockId);

  if (!sourceBlock || !targetBlock) {
    return { valid: false, reason: 'Block not found' };
  }

  // Build port contexts
  const sourceContext: PortContext = {
    type: sourceType,
    blockType: sourceBlock.type,
    portId: sourcePortId,
  };

  const targetContext: PortContext = {
    type: targetType,
    blockType: targetBlock.type,
    portId: targetPortId,
  };

  const payloadsCompatible = arePayloadsCompatible(
    sourceType.payload,
    targetType.payload,
    sourceContext,
    targetContext
  );

  // Check direct compatibility (with metadata-aware checking)
  if (arePortsCompatible(sourceContext, targetContext)) {
    return { valid: true };
  }

  // If payload vars have disjoint constraints, adapters must not bypass explicit metadata.
  if (!payloadsCompatible && (isPayloadVar(sourceType.payload) || isPayloadVar(targetType.payload))) {
    return {
      valid: false,
      reason: `Type mismatch: ${formatTypeForDisplay(sourceType)} → ${formatTypeForDisplay(targetType)}`,
    };
  }

  // [LAW:one-source-of-truth] UI connection validity follows the same adapter-chain
  // authority used by frontend adapter policy.
  const chain = findAdapterChain(sourceType, targetType);
  if (chain) {
    const adapter = chain.steps.length === 1 ? adapterSpecFromChainStep(chain.steps[0]) : undefined;
    return { valid: true, adapter, adapterChain: chain.steps };
  }

  return {
    valid: false,
    reason: `Type mismatch: ${formatTypeForDisplay(sourceType)} → ${formatTypeForDisplay(targetType)}`,
  };
}
