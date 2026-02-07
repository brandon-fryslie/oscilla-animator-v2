/**
 * Constraint Extraction from DraftGraph
 *
 * Builds the complete constraint set that solvers consume:
 * - portBaseTypes: stable Map<DraftPortKey, InferenceCanonicalType> from block defs
 * - payloadUnit: Payload/unit equality constraints for union-find solving
 * - cardinality: Cardinality constraints for cardinality union-find solving
 * - baseCardinalityAxis: Original cardinality axis per port (before axisVar rewriting)
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
import type { BlockDef, InputDef, OutputDef, BlockCardinalityMetadata, AcceptsSpec } from '../../blocks/registry';
import { getBlockCardinalityMetadata } from '../../blocks/registry';
import type { InferenceCanonicalType } from '../../core/inference-types';
import { isPayloadVar, isUnitVar, isConcretePayload, isConcreteUnit } from '../../core/inference-types';
import type { PayloadType, UnitType, CardinalityValue, Axis } from '../../core/canonical-types';
import { axisVar, axisInst, isAxisInst, isAxisVar, instanceRef } from '../../core/canonical-types';
import { cardinalityVarId, instanceVarId, type CardinalityVarId } from '../../core/ids';
import type { CardinalityConstraint, InstanceTerm } from './cardinality/solve';

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

// =============================================================================
// ExtractedConstraints
// =============================================================================

export interface ExtractedConstraints {
  /** Base inference types for all ports, from block defs. Cardinality axes are rewritten to axisVar for solvable ports. */
  readonly portBaseTypes: ReadonlyMap<DraftPortKey, InferenceCanonicalType>;
  /** Payload/unit constraints for union-find solver */
  readonly payloadUnit: readonly PayloadUnitConstraint[];
  /** Cardinality constraints for cardinality solver */
  readonly cardinality: readonly CardinalityConstraint[];
  /** Original cardinality axis per port (before axisVar rewriting), for the cardinality solver */
  readonly baseCardinalityAxis: ReadonlyMap<DraftPortKey, Axis<CardinalityValue, CardinalityVarId>>;
  /**
   * Set of collect port keys. Edges targeting these ports are excluded
   * from union-find unification — each edge is independently validated
   * against the port's AcceptsSpec.
   * // [LAW:one-type-per-behavior] Collect ports use normal edges, not a parallel mechanism.
   */
  readonly collectPorts: ReadonlySet<DraftPortKey>;
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
  const cardinality: CardinalityConstraint[] = [];
  const baseCardinalityAxis = new Map<DraftPortKey, Axis<CardinalityValue, CardinalityVarId>>();
  const collectPorts = new Set<DraftPortKey>();

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

      // Track collect ports — they opt out of union-find unification
      // [LAW:one-type-per-behavior] Collect ports use normal edges, validated per-edge.
      if (inDef.collectAccepts) {
        collectPorts.add(key);
      } else {
        // Only non-collect ports participate in same-var constraints
        collectVarConstraints(key, inDef.type, payloadVarPorts, unitVarPorts, payloadUnit);
      }
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

    // Rewrite cardinality axes and gather cardinality constraints
    // [LAW:single-enforcer] This is the only place that interprets cardinality metadata
    // and rewrites port cardinality axes for the solver.
    rewriteCardinalityAxes(block, def, portBaseTypes, baseCardinalityAxis, cardinality);
  }

  // Phase B: Edge constraints — unify from.out with to.in
  for (const edge of g.edges) {
    const fromKey = draftPortKey(edge.from.blockId, edge.from.port, 'out');
    const toKey = draftPortKey(edge.to.blockId, edge.to.port, 'in');

    // Skip edges targeting collect ports — each edge validated independently
    if (collectPorts.has(toKey)) continue;

    // Only emit constraints for ports we have types for
    if (portBaseTypes.has(fromKey) && portBaseTypes.has(toKey)) {
      payloadUnit.push({ kind: 'edge', from: fromKey, to: toKey });
      // Edge cardinality equality — solver unifies cardinality across edges
      cardinality.push({ kind: 'equal', a: fromKey, b: toKey });
    }
  }

  return { portBaseTypes, payloadUnit, cardinality, baseCardinalityAxis, collectPorts };
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
 * Rewrite cardinality axes for solvable ports and emit cardinality constraints.
 *
 * For each port, records the original cardinality in baseCardinalityAxis,
 * then rewrites the portBaseTypes entry to use axisVar for solvable ports.
 *
 * Constraint emission per cardinalityMode:
 * - signalOnly → keep axisInst(one), emit clampOne(port)
 * - transform outputs → deterministic axisInst(many(instanceRef(domainType, blockId)))
 * - transform inputs → axisVar, zipBroadcast if allowZipSig
 * - preserve (strict) → axisVar, pairwise equal
 * - preserve + allowZipSig → axisVar, zipBroadcast
 * - fieldOnly inputs → axisVar, forceMany with instance var
 * - fieldOnly outputs → axisVar
 *
 * When laneTopology is present, it takes priority over legacy metadata.
 */
function rewriteCardinalityAxes(
  block: DraftBlock,
  def: BlockDef,
  portBaseTypes: Map<DraftPortKey, InferenceCanonicalType>,
  baseCardinalityAxis: Map<DraftPortKey, Axis<CardinalityValue, CardinalityVarId>>,
  constraints: CardinalityConstraint[],
): void {
  // Collect block ports (before rewriting)
  const blockPorts: DraftPortKey[] = [];
  for (const key of portBaseTypes.keys()) {
    if (!key.startsWith(block.id + ':')) continue;
    blockPorts.push(key);
  }

  // Lane topology takes priority if present
  if (def.laneTopology) {
    rewriteForLaneTopology(block, def, portBaseTypes, baseCardinalityAxis, constraints, blockPorts);
    return;
  }

  // Fallback: legacy BlockCardinalityMetadata
  const meta = getBlockCardinalityMetadata(block.type);
  if (!meta) return;

  switch (meta.cardinalityMode) {
    case 'signalOnly':
      rewriteSignalOnly(block, portBaseTypes, constraints, blockPorts);
      break;
    case 'transform':
      rewriteTransform(block, meta, portBaseTypes, baseCardinalityAxis, constraints, blockPorts);
      break;
    case 'preserve':
      rewritePreserve(block, meta, portBaseTypes, constraints, blockPorts);
      break;
    case 'fieldOnly':
      rewriteFieldOnly(block, meta, portBaseTypes, constraints, blockPorts);
      break;
  }

  // Record baseCardinalityAxis AFTER rewriting — solver needs to see axisVar for solvable ports.
  // Normalize zero → one: solver only reasons about one vs many.
  for (const key of blockPorts) {
    const type = portBaseTypes.get(key);
    if (type) {
      baseCardinalityAxis.set(key, normalizeCardinalityForSolver(type.extent.cardinality));
    }
  }
}

/** signalOnly → keep axisInst(one), emit clampOne */
function rewriteSignalOnly(
  block: DraftBlock,
  portBaseTypes: Map<DraftPortKey, InferenceCanonicalType>,
  constraints: CardinalityConstraint[],
  blockPorts: DraftPortKey[],
): void {
  for (const key of blockPorts) {
    // Keep cardinality as axisInst(one) — no rewrite needed
    constraints.push({ kind: 'clampOne', port: key });
  }
}

/** transform → outputs get deterministic many(ref), inputs get axisVar */
function rewriteTransform(
  block: DraftBlock,
  meta: BlockCardinalityMetadata & { cardinalityMode: 'transform' },
  portBaseTypes: Map<DraftPortKey, InferenceCanonicalType>,
  baseCardinalityAxis: Map<DraftPortKey, Axis<CardinalityValue, CardinalityVarId>>,
  constraints: CardinalityConstraint[],
  blockPorts: DraftPortKey[],
): void {
  const ref = instanceRef(meta.domainType as string, block.id);
  const inputPorts: DraftPortKey[] = [];

  for (const key of blockPorts) {
    const dir = key.endsWith(':out') ? 'out' : 'in';

    if (dir === 'out') {
      // Transform outputs → deterministic axisInst(many(ref))
      const type = portBaseTypes.get(key)!;
      const rewritten: InferenceCanonicalType = {
        ...type,
        extent: {
          ...type.extent,
          cardinality: axisInst({ kind: 'many', instance: ref }),
        },
      };
      portBaseTypes.set(key, rewritten);
      constraints.push({ kind: 'forceMany', port: key, instance: { kind: 'inst', ref } });
    } else {
      // Transform inputs → axisVar
      rewritePortToVar(key, block.id, portBaseTypes);
      inputPorts.push(key);
    }
  }

  // If allowZipSig, zipBroadcast over inputs + outputs
  if (meta.broadcastPolicy === 'allowZipSig' && blockPorts.length > 0) {
    constraints.push({ kind: 'zipBroadcast', ports: [...blockPorts].sort() });
  }
}

/** preserve → all ports get axisVar, equal or zipBroadcast */
function rewritePreserve(
  block: DraftBlock,
  meta: BlockCardinalityMetadata,
  portBaseTypes: Map<DraftPortKey, InferenceCanonicalType>,
  constraints: CardinalityConstraint[],
  blockPorts: DraftPortKey[],
): void {
  // Rewrite all ports to axisVar
  for (const key of blockPorts) {
    rewritePortToVar(key, block.id, portBaseTypes);
  }

  if (blockPorts.length === 0) return;

  if (meta.broadcastPolicy === 'allowZipSig') {
    // zipBroadcast over all ports
    constraints.push({ kind: 'zipBroadcast', ports: [...blockPorts].sort() });
  } else {
    // strict equality: pairwise equal
    const sorted = [...blockPorts].sort();
    for (let i = 1; i < sorted.length; i++) {
      constraints.push({ kind: 'equal', a: sorted[0], b: sorted[i] });
    }
  }
}

/** fieldOnly → inputs get axisVar + forceMany(var), outputs get axisVar */
function rewriteFieldOnly(
  block: DraftBlock,
  meta: BlockCardinalityMetadata,
  portBaseTypes: Map<DraftPortKey, InferenceCanonicalType>,
  constraints: CardinalityConstraint[],
  blockPorts: DraftPortKey[],
): void {
  for (const key of blockPorts) {
    rewritePortToVar(key, block.id, portBaseTypes);
    const dir = key.endsWith(':out') ? 'out' : 'in';

    if (dir === 'in') {
      // Extract portName from key (format: blockId:portName:dir)
      const parts = key.split(':');
      const portName = parts.slice(1, -1).join(':');
      const instVar: InstanceTerm = { kind: 'var', id: instanceVarId(`fieldOnly:${block.id}:${portName}`) };
      constraints.push({ kind: 'forceMany', port: key, instance: instVar });
    }
  }

  if (meta.broadcastPolicy === 'allowZipSig' && blockPorts.length > 0) {
    constraints.push({ kind: 'zipBroadcast', ports: [...blockPorts].sort() });
  }
}

/** Lane topology → use groups directly */
function rewriteForLaneTopology(
  block: DraftBlock,
  def: BlockDef,
  portBaseTypes: Map<DraftPortKey, InferenceCanonicalType>,
  baseCardinalityAxis: Map<DraftPortKey, Axis<CardinalityValue, CardinalityVarId>>,
  constraints: CardinalityConstraint[],
  blockPorts: DraftPortKey[],
): void {
  // Rewrite all ports to axisVar
  for (const key of blockPorts) {
    rewritePortToVar(key, block.id, portBaseTypes);
  }

  for (const group of def.laneTopology!.groups) {
    const ports: DraftPortKey[] = [];
    for (const member of group.members) {
      const inKey = draftPortKey(block.id, member, 'in');
      const outKey = draftPortKey(block.id, member, 'out');
      if (portBaseTypes.has(inKey)) ports.push(inKey);
      if (portBaseTypes.has(outKey)) ports.push(outKey);
    }
    if (ports.length === 0) continue;

    if (group.relation === 'zipBroadcast') {
      constraints.push({ kind: 'zipBroadcast', ports: [...ports].sort() });
    } else {
      // allEqual, reducible, broadcastOnly, custom → pairwise equal
      const sorted = [...ports].sort();
      for (let i = 1; i < sorted.length; i++) {
        constraints.push({ kind: 'equal', a: sorted[0], b: sorted[i] });
      }
    }
  }

  // Record baseCardinalityAxis AFTER rewriting.
  // Normalize zero → one: solver only reasons about one vs many.
  for (const key of blockPorts) {
    const type = portBaseTypes.get(key);
    if (type) {
      baseCardinalityAxis.set(key, normalizeCardinalityForSolver(type.extent.cardinality));
    }
  }
}

/**
 * Rewrite a port's cardinality axis to axisVar in portBaseTypes.
 * Generates a deterministic CardinalityVarId from the port key.
 */
function rewritePortToVar(
  key: DraftPortKey,
  blockId: string,
  portBaseTypes: Map<DraftPortKey, InferenceCanonicalType>,
): void {
  const type = portBaseTypes.get(key);
  if (!type) return;

  // Only rewrite if the axis is currently concrete (axisInst)
  // If it's already axisVar, leave it (shouldn't happen with well-formed block defs)
  if (isAxisVar(type.extent.cardinality)) return;

  const varId = cardinalityVarId(`card:${key}`);
  const rewritten: InferenceCanonicalType = {
    ...type,
    extent: {
      ...type.extent,
      cardinality: axisVar(varId),
    },
  };
  portBaseTypes.set(key, rewritten);
}

/**
 * Normalize cardinality axis for the solver.
 * The solver only reasons about one vs many(instance).
 * Zero is a payload-level optimization signal, not a cardinality distinction.
 */
function normalizeCardinalityForSolver(
  axis: Axis<CardinalityValue, CardinalityVarId>,
): Axis<CardinalityValue, CardinalityVarId> {
  if (isAxisInst(axis) && axis.value.kind === 'zero') {
    return axisInst({ kind: 'one' });
  }
  return axis;
}
