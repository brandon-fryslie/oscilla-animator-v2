/**
 * Constraint Extraction from DraftGraph
 *
 * Builds the complete constraint set that solvers consume:
 * - portBaseTypes: stable Map<DraftPortKey, InferenceCanonicalType> from block defs
 * - payloadUnit: Payload/unit constraints for union-find solving (new typed constraints)
 * - cardinality: Cardinality constraints for cardinality union-find solving
 * - baseCardinalityAxis: Solver-facing cardinality axis per port (after axisVar rewriting)
 *
 * This is the SOLE bridge between DraftGraph structure and solver inputs.
 * Solvers produce substitutions; you apply substitutions to portBaseTypes
 * to compute TypeFacts.
 *
 * Auto-derivation: When a block has BlockPayloadMetadata declaring polymorphism
 * (allowedPayloads with >1 entries) but its port types are concrete, this module
 * auto-derives payload/unit vars and RequirePayloadIn/RequireUnitless constraints.
 * This lets block defs stay simple while the solver handles polymorphism.
 *
 * // [LAW:one-source-of-truth] portBaseTypes is the single source for per-port inference types.
 * // [LAW:single-enforcer] Constraint extraction is the single place that reads block defs for types.
 */

import type { DraftGraph, DraftBlock } from './draft-graph';
import type { DraftPortKey } from './type-facts';
import { draftPortKey } from './type-facts';
import type { BlockDef } from '../../blocks/registry';
import type { InferenceCanonicalType } from '../../core/inference-types';
import { isPayloadVar, isUnitVar, isConcretePayload, isConcreteUnit } from '../../core/inference-types';
import type { PayloadType, UnitType, CardinalityValue, Axis } from '../../core/canonical-types';
import { axisInst, isAxisInst, isAxisVar, resolveCardinalityPolicy, instanceRef } from '../../core/canonical-types';
import { cardinalityVarId, instanceVarId, type CardinalityVarId } from '../../core/ids';
import type { CardinalityConstraint, InstanceTerm } from './cardinality/solve';
import type { PayloadUnitConstraint, ConstraintOrigin } from './payload-unit/solve';

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
  /** Solver-facing cardinality axis per port (after axisVar rewriting), for the cardinality solver */
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

    // Track vars within this block for same-var constraints (payload equality, unit equality)
    const payloadVarPorts = new Map<string, DraftPortKey[]>();
    const unitVarPorts = new Map<string, DraftPortKey[]>();

    // Auto-derivation: check if block has payload metadata declaring polymorphism
    const meta = def.payload;
    const isPolymorphic = meta && Object.values(meta.allowedPayloads).some(a => a.length > 1);

    // Process outputs
    for (const [portName, outDef] of Object.entries(def.outputs)) {
      const key = draftPortKey(block.id, portName, 'out');
      // Instantiate template vars into block-scoped vars before any further processing.
      let type = instantiateTemplateVars(outDef.type, block.id);

      // Auto-derivation: if port has concrete payload but metadata says polymorphic,
      // replace payload with a block-scoped var + emit RequirePayloadIn
      if (isPolymorphic && meta && isConcretePayload(type.payload) && !isPayloadVar(type.payload)) {
        const allowedForPort = meta.allowedPayloads[portName];
        if (allowedForPort && allowedForPort.length > 1) {
          // Replace payload with block-scoped var
          const varId = `${block.id}_T`;
          type = { ...type, payload: { kind: 'var' as const, id: varId } };

          payloadUnit.push({
            kind: 'requirePayloadIn',
            port: key,
            allowed: allowedForPort,
            origin: { kind: 'payloadMetadata', blockType: block.type, port: portName },
          });
        }
      }

      // Auto-derivation: if unitBehavior is set and port has concrete unit,
      // replace unit with block-scoped var
      if (isPolymorphic && meta?.unitBehavior === 'preserve' && isConcreteUnit(type.unit) && !isUnitVar(type.unit)) {
        const varId = `${block.id}_U`;
        type = { ...type, unit: { kind: 'var' as const, id: varId } };
      }

      portBaseTypes.set(key, type);
      collectVarConstraints(key, type, payloadVarPorts, unitVarPorts, payloadUnit, block.type, portName, 'out');
    }

    // Process inputs
    for (const [portName, inDef] of Object.entries(def.inputs)) {
      if (inDef.exposedAsPort === false) continue;
      const key = draftPortKey(block.id, portName, 'in');
      // Instantiate template vars into block-scoped vars before any further processing.
      let type = instantiateTemplateVars(inDef.type, block.id);

      // Auto-derivation for inputs (same logic as outputs)
      if (isPolymorphic && meta && isConcretePayload(type.payload) && !isPayloadVar(type.payload)) {
        const allowedForPort = meta.allowedPayloads[portName];
        if (allowedForPort && allowedForPort.length > 1) {
          const varId = `${block.id}_T`;
          type = { ...type, payload: { kind: 'var' as const, id: varId } };

          payloadUnit.push({
            kind: 'requirePayloadIn',
            port: key,
            allowed: allowedForPort,
            origin: { kind: 'payloadMetadata', blockType: block.type, port: portName },
          });
        }
      }

      if (isPolymorphic && meta?.unitBehavior === 'preserve' && isConcreteUnit(type.unit) && !isUnitVar(type.unit)) {
        const varId = `${block.id}_U`;
        type = { ...type, unit: { kind: 'var' as const, id: varId } };
      }

      portBaseTypes.set(key, type);

      // Track collect ports — they opt out of union-find unification
      // [LAW:one-type-per-behavior] Collect ports use normal edges, validated per-edge.
      if (inDef.collectAccepts) {
        collectPorts.add(key);
      } else {
        // Only non-collect ports participate in same-var constraints
        collectVarConstraints(key, type, payloadVarPorts, unitVarPorts, payloadUnit, block.type, portName, 'in');
      }
    }

    // Emit same-var (payload equality) constraints for ports sharing a def var within this block
    for (const [, ports] of payloadVarPorts) {
      if (ports.length > 1) {
        for (let i = 1; i < ports.length; i++) {
          payloadUnit.push({
            kind: 'payloadEq',
            a: ports[0],
            b: ports[i],
            origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'samePayloadVar' },
          });
        }
      }
    }

    // Emit same-var (unit equality) constraints for ports sharing a def var within this block
    for (const [, ports] of unitVarPorts) {
      if (ports.length > 1) {
        for (let i = 1; i < ports.length; i++) {
          payloadUnit.push({
            kind: 'unitEq',
            a: ports[0],
            b: ports[i],
            origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'sameUnitVar' },
          });
        }
      }
    }

    // Emit unitBehavior constraints from metadata
    if (meta?.unitBehavior === 'requireUnitless') {
      // All ports must be unitless
      for (const key of portBaseTypes.keys()) {
        if (!key.startsWith(block.id + ':')) continue;
        payloadUnit.push({
          kind: 'requireUnitless',
          port: key,
          origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'requireUnitless' },
        });
      }
    }

    // Rewrite cardinality axes and gather cardinality constraints
    // [LAW:single-enforcer] This is the only place that interprets cardinality metadata
    // and rewrites port cardinality axes for the solver.
    rewriteCardinalityAxes(block, def, portBaseTypes, baseCardinalityAxis, cardinality);
  }

  // Assertion: zipBroadcast members must all have axisVar in baseCardinalityAxis.
  // If a concrete (axisInst) port is in a zipBroadcast, the filtering logic above is broken.
  for (const c of cardinality) {
    if (c.kind !== 'zipBroadcast') continue;
    for (const p of c.ports) {
      const ax = baseCardinalityAxis.get(p);
      if (!ax || !isAxisVar(ax)) {
        throw new Error(`zipBroadcast includes non-var port ${p} (axis: ${ax ? 'inst' : 'missing'})`);
      }
    }
  }

  // Phase B: Edge constraints — unify from.out with to.in
  for (const edge of g.edges) {
    const fromKey = draftPortKey(edge.from.blockId, edge.from.port, 'out');
    const toKey = draftPortKey(edge.to.blockId, edge.to.port, 'in');

    // Skip edges targeting collect ports — each edge validated independently
    if (collectPorts.has(toKey)) continue;

    // Only emit constraints for ports we have types for
    if (portBaseTypes.has(fromKey) && portBaseTypes.has(toKey)) {
      const edgeOrigin: ConstraintOrigin = { kind: 'edge', edgeId: edge.id };
      payloadUnit.push({ kind: 'payloadEq', a: fromKey, b: toKey, origin: edgeOrigin });
      payloadUnit.push({ kind: 'unitEq', a: fromKey, b: toKey, origin: edgeOrigin });
      // Edge cardinality equality — solver unifies cardinality across edges
      cardinality.push({ kind: 'equal', a: fromKey, b: toKey, origin: edgeOrigin });
    }
  }

  return { portBaseTypes, payloadUnit, cardinality, baseCardinalityAxis, collectPorts };
}

// =============================================================================
// Template Var Instantiation
// =============================================================================

/**
 * Instantiate (alpha-rename) template payload/unit var IDs into block-scoped var IDs.
 *
 * Template var IDs in block defs (e.g., `payloadVar('const_payload')`) are placeholders
 * shared across all instances of that block type. When multiple instances exist in the
 * same graph, the raw template IDs collide in the solver's Substitution output map
 * (last-write-wins). This function rewrites them into deterministic, collision-free IDs.
 *
 * Format:
 * - payloadVar: `p:{blockId}:{templateVarName}` (block-scoped generic)
 * - unitVar:    `u:{blockId}:{templateVarName}` (block-scoped generic)
 * - cardVar:    `c:{blockId}:{templateVarName}` (block-scoped cardinality generic)
 *
 * This preserves the "ports sharing the same template var within one block instance
 * resolve to the same type" property, while ensuring different block instances get
 * independent var resolutions.
 *
 * // NEXT TRIGGER (scoped var instantiation):
 * // If two different block instances can share a template var ID (eg 'const_payload'),
 * // then template vars MUST be instantiated into block-scoped (or port-scoped) var IDs here.
 * // Any last-write-wins behavior in Substitution maps means instantiation is missing or incorrect.
 *
 * // [LAW:single-enforcer] This is the single place that instantiates template vars.
 * // [LAW:dataflow-not-control-flow] Always runs; produces different values, not different control paths.
 */
function instantiateTemplateVars(
  type: InferenceCanonicalType,
  blockId: string,
): InferenceCanonicalType {
  let result = type;
  if (isPayloadVar(type.payload)) {
    const scopedId = `p:${blockId}:${type.payload.id}`;
    result = { ...result, payload: { kind: 'var' as const, id: scopedId } };
  }
  if (isUnitVar(type.unit)) {
    const scopedId = `u:${blockId}:${type.unit.id}`;
    result = { ...result, unit: { kind: 'var' as const, id: scopedId } };
  }
  if (isAxisVar(type.extent.cardinality)) {
    // [LAW:one-source-of-truth] Cardinality template vars are instance-scoped exactly like payload/unit vars.
    const scopedVar = cardinalityVarId(`c:${blockId}:${type.extent.cardinality.var as string}`);
    result = {
      ...result,
      extent: {
        ...result.extent,
        cardinality: {
          ...type.extent.cardinality,
          var: scopedVar,
        },
      },
    };
  }
  return result;
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
  blockType: string,
  portName: string,
  dir: 'in' | 'out',
): void {
  // Payload
  if (isPayloadVar(type.payload)) {
    const arr = payloadVarPorts.get(type.payload.id) ?? [];
    arr.push(key);
    payloadVarPorts.set(type.payload.id, arr);
  } else if (isConcretePayload(type.payload)) {
    payloadUnit.push({
      kind: 'concretePayload',
      port: key,
      value: type.payload,
      origin: { kind: 'portDef', blockType, port: portName, dir },
    });
  }

  // Unit
  if (isUnitVar(type.unit)) {
    const arr = unitVarPorts.get(type.unit.id) ?? [];
    arr.push(key);
    unitVarPorts.set(type.unit.id, arr);
  } else if (isConcreteUnit(type.unit)) {
    payloadUnit.push({
      kind: 'concreteUnit',
      port: key,
      value: type.unit,
      origin: { kind: 'portDef', blockType, port: portName, dir },
    });
  }
}

/**
 * Emit cardinality constraints from declared CT/ICT cardinality axes.
 * // [LAW:one-source-of-truth] Cardinality behavior is read only from port types.
 * // [LAW:single-enforcer] Constraint extraction is the only boundary that converts CT/ICT policy to solver constraints.
 */
function rewriteCardinalityAxes(
  block: DraftBlock,
  _def: BlockDef,
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

  rewriteFromDeclaredCardinalityPolicy(block, portBaseTypes, constraints, blockPorts);

  // Record solver-facing axes (normalized zero→one).
  for (const key of blockPorts) {
    const type = portBaseTypes.get(key);
    if (type) {
      baseCardinalityAxis.set(key, normalizeCardinalityForSolver(type.extent.cardinality));
    }
  }
}

/**
 * Read cardinality behavior directly from declared CT/ICT cardinality vars.
 *
 * - shared var id => group membership
 * - relation => equal vs zipBroadcast
 * - acceptance => clampOne / forceMany
 * - instanceBinding => inherit vs create(domainType) for many-only ports
 */
function rewriteFromDeclaredCardinalityPolicy(
  block: DraftBlock,
  portBaseTypes: Map<DraftPortKey, InferenceCanonicalType>,
  constraints: CardinalityConstraint[],
  blockPorts: DraftPortKey[],
): void {
  const groupMembers = new Map<string, DraftPortKey[]>();
  const groupRelation = new Map<string, 'uniform' | 'promoteToMany'>();
  const groupInstanceBinding = new Map<string, 'inherit' | { kind: 'create'; domainType: string }>();

  for (const key of blockPorts) {
    const type = portBaseTypes.get(key);
    if (!type) continue;

    const axis = type.extent.cardinality;
    if (isAxisVar(axis)) {
      const policy = resolveCardinalityPolicy(axis);
      if (!policy) continue;

      const groupId = axis.var as string;
      const members = groupMembers.get(groupId) ?? [];
      members.push(key);
      groupMembers.set(groupId, members);

      const relation = policy.relation;
      const existingRelation = groupRelation.get(groupId);
      if (existingRelation && existingRelation !== relation) {
        throw new Error(`Conflicting cardinality relation for group ${groupId} in block ${block.type}`);
      }
      groupRelation.set(groupId, relation);

      const existingBinding = groupInstanceBinding.get(groupId);
      if (!existingBinding) {
        groupInstanceBinding.set(
          groupId,
          policy.instanceBinding === 'inherit'
            ? 'inherit'
            : { kind: 'create', domainType: policy.instanceBinding.domainType as string },
        );
      } else {
        const sameKind = existingBinding === 'inherit'
          ? policy.instanceBinding === 'inherit'
          : policy.instanceBinding !== 'inherit'
            && existingBinding.kind === policy.instanceBinding.kind
            && existingBinding.domainType === (policy.instanceBinding.domainType as string);
        if (!sameKind) {
          throw new Error(`Conflicting instanceBinding for cardinality group ${groupId} in block ${block.type}`);
        }
      }

      if (policy.acceptance === 'oneOnly') {
        constraints.push({
          kind: 'clampOne',
          port: key,
          origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'declared.acceptance.oneOnly' },
        });
      } else if (policy.acceptance === 'manyOnly') {
        const binding = groupInstanceBinding.get(groupId);
        const instTerm: InstanceTerm = (!binding || binding === 'inherit')
          ? { kind: 'var', id: instanceVarId(`declared:${block.id}:${groupId}`) }
          : { kind: 'inst', ref: instanceRef(binding.domainType, block.id) };
        constraints.push({
          kind: 'forceMany',
          port: key,
          instance: instTerm,
          origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'declared.acceptance.manyOnly' },
        });
      }
    } else if (axis.value.kind === 'one') {
      // Concrete one ports are fixed signal by declaration.
      constraints.push({
        kind: 'clampOne',
        port: key,
        origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'declared.inst.one' },
      });
    }
  }

  for (const [groupId, members] of groupMembers) {
    if (members.length <= 1) continue;
    const relation = groupRelation.get(groupId) ?? 'uniform';
    const sorted = [...members].sort();
    if (relation === 'promoteToMany') {
      constraints.push({
        kind: 'zipBroadcast',
        ports: sorted,
        origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'declared.relation.promoteToMany' },
      });
    } else {
      for (let i = 1; i < sorted.length; i++) {
        constraints.push({
          kind: 'equal',
          a: sorted[0],
          b: sorted[i],
          origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'declared.relation.uniform' },
        });
      }
    }
  }
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
