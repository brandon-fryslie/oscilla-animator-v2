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
import type { BlockDef, BlockCardinalityMetadata } from '../../blocks/registry';
import { getBlockCardinalityMetadata } from '../../blocks/registry';
import type { InferenceCanonicalType } from '../../core/inference-types';
import { isPayloadVar, isUnitVar, isConcretePayload, isConcreteUnit } from '../../core/inference-types';
import type { PayloadType, UnitType, CardinalityValue, Axis } from '../../core/canonical-types';
import { axisVar, axisInst, isAxisInst, isAxisVar, instanceRef, isMany, resolveCardinalityPolicy } from '../../core/canonical-types';
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

  // CT/ICT cardinality policy takes precedence when explicitly declared.
  // [LAW:one-source-of-truth] Port type declarations are the authority for cardinality behavior.
  if (hasExplicitCardinalityPolicy(portBaseTypes, blockPorts)) {
    rewriteFromDeclaredCardinalityPolicy(block, portBaseTypes, constraints, blockPorts);
    for (const key of blockPorts) {
      const type = portBaseTypes.get(key);
      if (type) {
        baseCardinalityAxis.set(key, normalizeCardinalityForSolver(type.extent.cardinality));
      }
    }
    return;
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

function hasExplicitCardinalityPolicy(
  portBaseTypes: Map<DraftPortKey, InferenceCanonicalType>,
  blockPorts: DraftPortKey[],
): boolean {
  for (const key of blockPorts) {
    const type = portBaseTypes.get(key);
    if (!type || !isAxisVar(type.extent.cardinality)) continue;
    const axis = type.extent.cardinality as any;
    if (axis.relation !== undefined || axis.acceptance !== undefined || axis.instanceBinding !== undefined) {
      return true;
    }
  }
  return false;
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

/** signalOnly → keep axisInst(one), emit clampOne */
function rewriteSignalOnly(
  block: DraftBlock,
  portBaseTypes: Map<DraftPortKey, InferenceCanonicalType>,
  constraints: CardinalityConstraint[],
  blockPorts: DraftPortKey[],
): void {
  const origin: ConstraintOrigin = { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'signalOnly.clampOne' };
  for (const key of blockPorts) {
    // Keep cardinality as axisInst(one) — no rewrite needed
    constraints.push({ kind: 'clampOne', port: key, origin });
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
  // [LAW:single-enforcer] Adapter-inserted Broadcast uses instanceVar, not concrete instanceRef.
  // This lets the solver unify the Broadcast's instance with downstream instances.
  // Gate specifically on block type 'Broadcast' with adapter origin — other adapters keep concrete refs.
  const isBroadcastAdapter = block.type === 'Broadcast'
    && typeof block.origin === 'object'
    && (block.origin as { kind: string }).kind === 'elaboration'
    && (block.origin as { role: string }).role === 'adapter';

  const ref = instanceRef(meta.domainType as string, block.id);

  for (const key of blockPorts) {
    const dir = key.endsWith(':out') ? 'out' : 'in';

    if (dir === 'out') {
      if (isBroadcastAdapter) {
        // Adapter-inserted Broadcast: use instanceVar so solver can unify with downstream
        rewritePortToVar(key, block.id, portBaseTypes);
        const instVar: InstanceTerm = { kind: 'var', id: instanceVarId(`adapter:${block.id}`) };
        constraints.push({ kind: 'forceMany', port: key, instance: instVar, origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'transform.forceMany' } });
      } else {
        const type = portBaseTypes.get(key)!;
        const declaredCard = type.extent.cardinality;
        // [LAW:one-source-of-truth] Signal-declared outputs stay signal on transform blocks.
        // Only field-declared outputs (cardinality many) get forced to many(ref).
        // This enables generators/assemblers to output both shapes (signal) and fields.
        if (isAxisInst(declaredCard) && declaredCard.value.kind === 'one') {
          constraints.push({ kind: 'clampOne', port: key, origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'transform.signalOutput.clampOne' } });
        } else {
          // Normal transform outputs → deterministic axisInst(many(ref))
          const rewritten: InferenceCanonicalType = {
            ...type,
            extent: {
              ...type.extent,
              cardinality: axisInst({ kind: 'many', instance: ref }),
            },
          };
          portBaseTypes.set(key, rewritten);
          constraints.push({ kind: 'forceMany', port: key, instance: { kind: 'inst', ref }, origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'transform.forceMany' } });
        }
      }
    } else {
      // Transform inputs → axisVar
      rewritePortToVar(key, block.id, portBaseTypes);
    }
  }

  // If allowZipSig, zipBroadcast over axisVar ports only (not concrete outputs)
  if (meta.broadcastPolicy === 'allowZipSig') {
    const varPorts = blockPorts.filter(key => {
      const type = portBaseTypes.get(key);
      return type && isAxisVar(type.extent.cardinality);
    });
    if (varPorts.length > 0) {
      constraints.push({ kind: 'zipBroadcast', ports: [...varPorts].sort(), origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'transform.allowZipSig.zipBroadcast' } });
    }
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
    constraints.push({ kind: 'zipBroadcast', ports: [...blockPorts].sort(), origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'preserve.allowZipSig.zipBroadcast' } });
  } else {
    // strict equality: pairwise equal
    const sorted = [...blockPorts].sort();
    for (let i = 1; i < sorted.length; i++) {
      constraints.push({ kind: 'equal', a: sorted[0], b: sorted[i], origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'preserve.strict.equal' } });
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
  // [LAW:one-source-of-truth] Capture original cardinality BEFORE rewritePortToVar overwrites it
  const originalCardinality = new Map<DraftPortKey, CardinalityValue>();
  for (const key of blockPorts) {
    const type = portBaseTypes.get(key);
    if (type && isAxisInst(type.extent.cardinality)) {
      originalCardinality.set(key, type.extent.cardinality.value);
    }
  }

  // Field-typed ports for zipBroadcast (exclude signal-typed ports)
  const fieldPorts: DraftPortKey[] = [];

  for (const key of blockPorts) {
    const origCard = originalCardinality.get(key);
    const isFieldTyped = origCard && isMany(origCard);

    rewritePortToVar(key, block.id, portBaseTypes);
    const dir = key.endsWith(':out') ? 'out' : 'in';

    if (dir === 'in' && isFieldTyped) {
      // Only emit forceMany for field-typed inputs (cardinality: many)
      // Signal-typed inputs (cardinality: one) keep their var and default to one
      const parts = key.split(':');
      const portName = parts.slice(1, -1).join(':');
      const instVar: InstanceTerm = { kind: 'var', id: instanceVarId(`fieldOnly:${block.id}:${portName}`) };
      constraints.push({ kind: 'forceMany', port: key, instance: instVar, origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'fieldOnly.forceMany' } });
      fieldPorts.push(key);
    } else if (dir === 'out' && isFieldTyped) {
      // Outputs with field typing also go in the zipBroadcast group
      fieldPorts.push(key);
    }
    // Signal-typed ports (both in and out) are excluded from zipBroadcast
  }

  // Only include field-typed ports in zipBroadcast
  if (meta.broadcastPolicy === 'allowZipSig' && fieldPorts.length > 0) {
    constraints.push({ kind: 'zipBroadcast', ports: [...fieldPorts].sort(), origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'fieldOnly.allowZipSig.zipBroadcast' } });
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
      constraints.push({ kind: 'zipBroadcast', ports: [...ports].sort(), origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'laneTopology.zipBroadcast' } });
    } else {
      // allEqual, reducible, broadcastOnly, custom → pairwise equal
      const sorted = [...ports].sort();
      for (let i = 1; i < sorted.length; i++) {
        constraints.push({ kind: 'equal', a: sorted[0], b: sorted[i], origin: { kind: 'blockRule', blockId: block.id, blockType: block.type, rule: 'laneTopology.equal' } });
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
