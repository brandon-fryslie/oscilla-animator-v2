/**
 * Constraint Extraction from DraftGraph
 *
 * Builds the complete constraint set that solvers consume:
 * - portBaseTypes: stable Map<DraftPortKey, InferenceCanonicalType> from block defs
 * - payloadUnit: Payload/unit equality constraints for union-find solving
 * - cardinality: Cardinality constraints for union-find solving
 *
 * This is the SOLE bridge between DraftGraph structure and solver inputs.
 * Solvers produce substitutions; you apply substitutions to portBaseTypes
 * to compute TypeFacts.
 *
 * // [LAW:one-source-of-truth] portBaseTypes is the single source for per-port inference types.
 * // [LAW:single-enforcer] Constraint extraction is the single place that reads block defs for types.
 */

import type { DraftGraph, DraftBlock, DraftEdge, DraftPortRef } from './draft-graph';
import type { DraftPortKey } from './type-facts';
import { draftPortKey } from './type-facts';
import type { BlockDef, InputDef, OutputDef, BlockCardinalityMetadata } from '../../blocks/registry';
import { getBlockCardinalityMetadata } from '../../blocks/registry';
import type { InferenceCanonicalType } from '../../core/inference-types';
import { isPayloadVar, isUnitVar, isConcretePayload, isConcreteUnit } from '../../core/inference-types';
import type { PayloadType, UnitType, CardinalityValue } from '../../core/canonical-types';
import { isAxisInst } from '../../core/canonical-types';
import type { CardinalityVarId } from '../../core/ids';

// =============================================================================
// Constraint Types
// =============================================================================

/**
 * Payload/unit equality constraint between two ports.
 * Produced from edges (source.out unified with sink.in).
 */
export interface PayloadUnitEdgeConstraint {
  readonly kind: 'edge';
  readonly from: DraftPortKey;
  readonly to: DraftPortKey;
}

/**
 * Payload/unit same-variable constraint within a block.
 * Produced when multiple ports share the same def-level var.
 */
export interface PayloadUnitSameVarConstraint {
  readonly kind: 'sameVar';
  readonly ports: readonly DraftPortKey[];
  readonly varId: string;
  readonly axis: 'payload' | 'unit';
}

/**
 * Payload/unit concrete assignment for a port.
 * Produced when a port's def type has a concrete payload or unit.
 */
export type PayloadUnitConcreteConstraint =
  | { readonly kind: 'concrete'; readonly port: DraftPortKey; readonly axis: 'payload'; readonly value: PayloadType }
  | { readonly kind: 'concrete'; readonly port: DraftPortKey; readonly axis: 'unit'; readonly value: UnitType };

export type PayloadUnitConstraint =
  | PayloadUnitEdgeConstraint
  | PayloadUnitSameVarConstraint
  | PayloadUnitConcreteConstraint;

/**
 * Cardinality constraint for the cardinality solver.
 * Uses DraftPortKey instead of legacy PortKey.
 */
export type DraftCardinalityConstraint =
  | { readonly kind: 'equal'; readonly varId: CardinalityVarId; readonly ports: readonly DraftPortKey[] }
  | { readonly kind: 'fixed'; readonly port: DraftPortKey; readonly value: CardinalityValue }
  | { readonly kind: 'zipBroadcast'; readonly varId: CardinalityVarId; readonly ports: readonly DraftPortKey[] };

// =============================================================================
// ExtractedConstraints
// =============================================================================

export interface ExtractedConstraints {
  /** Base inference types for all ports, from block defs. Stable across iterations. */
  readonly portBaseTypes: ReadonlyMap<DraftPortKey, InferenceCanonicalType>;
  /** Payload/unit constraints for union-find solver */
  readonly payloadUnit: readonly PayloadUnitConstraint[];
  /** Cardinality constraints for cardinality solver */
  readonly cardinality: readonly DraftCardinalityConstraint[];
  /** Edges expressed as DraftPortKey pairs for cardinality propagation */
  readonly edgePairs: readonly { readonly from: DraftPortKey; readonly to: DraftPortKey }[];
}

// =============================================================================
// Main extraction
// =============================================================================

/**
 * Extract all constraints from a DraftGraph using block definitions.
 *
 * This is a pure function: same graph + same registry = same constraints.
 */
export function extractConstraints(
  g: DraftGraph,
  registry: ReadonlyMap<string, BlockDef>,
): ExtractedConstraints {
  const portBaseTypes = new Map<DraftPortKey, InferenceCanonicalType>();
  const payloadUnit: PayloadUnitConstraint[] = [];
  const cardinality: DraftCardinalityConstraint[] = [];
  const edgePairs: { from: DraftPortKey; to: DraftPortKey }[] = [];

  // Phase A: Collect port types and intra-block constraints
  for (const block of g.blocks) {
    const def = registry.get(block.type);
    if (!def) continue;

    // Track vars within this block for same-var constraints
    const payloadVarPorts = new Map<string, DraftPortKey[]>();
    const unitVarPorts = new Map<string, DraftPortKey[]>();

    // Process outputs
    for (const [portName, outDef] of Object.entries(def.outputs)) {
      const key = draftPortKey(block.id, portName, 'out');
      portBaseTypes.set(key, outDef.type);
      collectVarConstraints(key, outDef.type, payloadVarPorts, unitVarPorts, payloadUnit);
    }

    // Process inputs
    for (const [portName, inDef] of Object.entries(def.inputs)) {
      if (inDef.exposedAsPort === false) continue;
      const key = draftPortKey(block.id, portName, 'in');
      portBaseTypes.set(key, inDef.type);
      collectVarConstraints(key, inDef.type, payloadVarPorts, unitVarPorts, payloadUnit);
    }

    // Emit same-var constraints for ports sharing a def var within this block
    for (const [varId, ports] of payloadVarPorts) {
      if (ports.length > 1) {
        payloadUnit.push({ kind: 'sameVar', ports, varId, axis: 'payload' });
      }
    }
    for (const [varId, ports] of unitVarPorts) {
      if (ports.length > 1) {
        payloadUnit.push({ kind: 'sameVar', ports, varId, axis: 'unit' });
      }
    }

    // Gather cardinality constraints from block metadata
    gatherBlockCardinalityConstraints(block, def, portBaseTypes, cardinality);
  }

  // Phase B: Edge constraints — unify from.out with to.in
  for (const edge of g.edges) {
    const fromKey = draftPortKey(edge.from.blockId, edge.from.port, 'out');
    const toKey = draftPortKey(edge.to.blockId, edge.to.port, 'in');

    // Only emit constraints for ports we have types for
    if (portBaseTypes.has(fromKey) && portBaseTypes.has(toKey)) {
      payloadUnit.push({ kind: 'edge', from: fromKey, to: toKey });
      edgePairs.push({ from: fromKey, to: toKey });
    }
  }

  return { portBaseTypes, payloadUnit, cardinality, edgePairs };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Collect concrete assignments and track var-to-port mappings for a single port.
 */
function collectVarConstraints(
  key: DraftPortKey,
  type: InferenceCanonicalType,
  payloadVarPorts: Map<string, DraftPortKey[]>,
  unitVarPorts: Map<string, DraftPortKey[]>,
  payloadUnit: PayloadUnitConstraint[],
): void {
  // Payload
  if (isPayloadVar(type.payload)) {
    const arr = payloadVarPorts.get(type.payload.id) ?? [];
    arr.push(key);
    payloadVarPorts.set(type.payload.id, arr);
  } else if (isConcretePayload(type.payload)) {
    payloadUnit.push({ kind: 'concrete', port: key, axis: 'payload', value: type.payload });
  }

  // Unit
  if (isUnitVar(type.unit)) {
    const arr = unitVarPorts.get(type.unit.id) ?? [];
    arr.push(key);
    unitVarPorts.set(type.unit.id, arr);
  } else if (isConcreteUnit(type.unit)) {
    payloadUnit.push({ kind: 'concrete', port: key, axis: 'unit', value: type.unit });
  }
}

/**
 * Gather cardinality constraints from block cardinality metadata.
 *
 * Strategy per cardinalityMode:
 * - preserve → all ports share a CardinalityVarId (equal or zipBroadcast)
 * - signalOnly → all ports fixed to 'one'
 * - transform/fieldOnly → zipBroadcast if allowZipSig
 *
 * When laneTopology is present on the block def, it is authoritative.
 * When absent, fall back to legacy BlockCardinalityMetadata.
 *
 * // [LAW:single-enforcer] This is the only place that interprets cardinality metadata.
 */
function gatherBlockCardinalityConstraints(
  block: DraftBlock,
  def: BlockDef,
  portBaseTypes: ReadonlyMap<DraftPortKey, InferenceCanonicalType>,
  constraints: DraftCardinalityConstraint[],
): void {
  // Lane topology takes priority if present
  if (def.laneTopology) {
    for (const group of def.laneTopology.groups) {
      const ports: DraftPortKey[] = [];
      for (const member of group.members) {
        // Members are port names — check both in and out
        const inKey = draftPortKey(block.id, member, 'in');
        const outKey = draftPortKey(block.id, member, 'out');
        if (portBaseTypes.has(inKey)) ports.push(inKey);
        if (portBaseTypes.has(outKey)) ports.push(outKey);
      }
      if (ports.length === 0) continue;

      const varId = `lane:${block.id}:${group.id}` as CardinalityVarId;
      if (group.relation === 'zipBroadcast') {
        constraints.push({ kind: 'zipBroadcast', varId, ports });
      } else {
        // allEqual, reducible, broadcastOnly, custom all map to 'equal' for now
        constraints.push({ kind: 'equal', varId, ports });
      }
    }
    return;
  }

  // Fallback: legacy BlockCardinalityMetadata
  const meta = getBlockCardinalityMetadata(block.type);
  if (!meta) return;

  // Collect ports, separating fixed-cardinality from variable
  const variablePorts: DraftPortKey[] = [];
  const allPorts: DraftPortKey[] = [];

  for (const [key, type] of portBaseTypes) {
    if (!key.startsWith(block.id + ':')) continue;
    allPorts.push(key);
    if (!isAxisInst(type.extent.cardinality)) {
      variablePorts.push(key);
    }
  }

  switch (meta.cardinalityMode) {
    case 'preserve': {
      if (allPorts.length === 0) break;
      const varId = `block:${block.id}` as CardinalityVarId;
      if (meta.broadcastPolicy === 'allowZipSig') {
        constraints.push({ kind: 'zipBroadcast', varId, ports: allPorts });
      } else {
        constraints.push({ kind: 'equal', varId, ports: allPorts });
      }
      break;
    }

    case 'signalOnly': {
      for (const key of allPorts) {
        constraints.push({ kind: 'fixed', port: key, value: { kind: 'one' } });
      }
      break;
    }

    case 'transform':
    case 'fieldOnly': {
      if (meta.broadcastPolicy === 'allowZipSig' && allPorts.length > 0) {
        const varId = `block:${block.id}` as CardinalityVarId;
        constraints.push({ kind: 'zipBroadcast', varId, ports: allPorts });
      }
      break;
    }
  }
}
