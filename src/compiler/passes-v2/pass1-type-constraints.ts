/**
 * Pass 1: Type Constraint Solving
 *
 * Resolves all polymorphic type variables (unit and payload) through
 * constraint propagation using union-find.
 *
 * Input: NormalizedPatch (from graph normalization)
 * Output: TypeResolvedPatch (same structure + resolved port types)
 *
 * The output is THE source of truth for all port types in downstream passes.
 * No downstream pass should look up types from BlockDef - always use
 * TypeResolvedPatch.portTypes.
 */

import type { NormalizedPatch, NormalizedEdge, BlockIndex } from '../ir/patches';
import type { Block } from '../../graph/Patch';
import type { SignalType, Unit, PayloadType, ConcretePayloadType } from '../../core/canonical-types';
import { isUnitVar, unitsEqual, isPayloadVar, payloadsEqual } from '../../core/canonical-types';
import { getBlockDefinition } from '../../blocks/registry';

// =============================================================================
// Types
// =============================================================================

/**
 * Key for a port: "blockIndex:portName:direction"
 */
export type PortKey = `${number}:${string}:${'in' | 'out'}`;

function portKey(blockIndex: BlockIndex, portName: string, direction: 'in' | 'out'): PortKey {
  return `${blockIndex}:${portName}:${direction}` as PortKey;
}

/**
 * TypeResolvedPatch - Output of Pass 1
 *
 * Identical structure to NormalizedPatch, plus resolved port types.
 * This is THE source of truth for all port types in downstream passes.
 */
export interface TypeResolvedPatch extends NormalizedPatch {
  /**
   * Resolved types for ALL ports.
   * Key: "blockIndex:portName:in" or "blockIndex:portName:out"
   * Value: Fully resolved SignalType (no variables)
   *
   * This is the ONLY place to look up port types after pass1.
   */
  readonly portTypes: ReadonlyMap<PortKey, SignalType>;
}

export interface TypeConstraintError {
  readonly kind: 'UnresolvedUnit' | 'ConflictingUnits' | 'UnresolvedPayload' | 'ConflictingPayloads';
  readonly blockIndex: BlockIndex;
  readonly portName: string;
  readonly message: string;
  readonly suggestions: readonly string[];
}

export interface Pass1Error {
  readonly kind: 'error';
  readonly errors: readonly TypeConstraintError[];
}

export type Pass1Result = TypeResolvedPatch | Pass1Error;

// =============================================================================
// Union-Find for Unit Variables
// =============================================================================

class UnitUnionFind {
  private parent: Map<string, string | Unit> = new Map();

  find(unit: Unit): Unit {
    if (unit.kind !== 'var') return unit;

    const id = unit.id;
    const p = this.parent.get(id);

    if (p === undefined) return unit;

    if (typeof p === 'string') {
      const root = this.find({ kind: 'var', id: p });
      if (root.kind === 'var') {
        this.parent.set(id, root.id);
      } else {
        this.parent.set(id, root);
      }
      return root;
    }

    return p;
  }

  union(a: Unit, b: Unit): { ok: true } | { ok: false; conflict: [Unit, Unit] } {
    const rootA = this.find(a);
    const rootB = this.find(b);

    if (rootA.kind !== 'var' && rootB.kind !== 'var') {
      if (unitsEqual(rootA, rootB)) return { ok: true };
      return { ok: false, conflict: [rootA, rootB] };
    }

    if (rootA.kind === 'var' && rootB.kind !== 'var') {
      this.parent.set(rootA.id, rootB);
      return { ok: true };
    }
    if (rootB.kind === 'var' && rootA.kind !== 'var') {
      this.parent.set(rootB.id, rootA);
      return { ok: true };
    }

    if (rootA.kind === 'var' && rootB.kind === 'var' && rootA.id !== rootB.id) {
      this.parent.set(rootA.id, rootB.id);
    }

    return { ok: true };
  }
}

// =============================================================================
// Union-Find for Payload Variables
// =============================================================================

const CONCRETE_PAYLOADS = new Set(['float', 'int', 'vec2', 'vec3', 'color', 'bool', 'shape', 'cameraProjection']);

class PayloadUnionFind {
  private parent: Map<string, string> = new Map();

  find(payload: PayloadType): PayloadType {
    if (!isPayloadVar(payload)) return payload;

    const id = payload.id;
    const p = this.parent.get(id);

    if (p === undefined) return payload;

    if (CONCRETE_PAYLOADS.has(p)) return p as ConcretePayloadType;

    const root = this.find({ kind: 'var', id: p });
    if (isPayloadVar(root)) {
      this.parent.set(id, root.id);
    } else {
      this.parent.set(id, root as string);
    }
    return root;
  }

  union(a: PayloadType, b: PayloadType): { ok: true } | { ok: false; conflict: [PayloadType, PayloadType] } {
    const rootA = this.find(a);
    const rootB = this.find(b);

    if (!isPayloadVar(rootA) && !isPayloadVar(rootB)) {
      if (payloadsEqual(rootA, rootB)) return { ok: true };
      return { ok: false, conflict: [rootA, rootB] };
    }

    if (isPayloadVar(rootA) && !isPayloadVar(rootB)) {
      this.parent.set(rootA.id, rootB as string);
      return { ok: true };
    }
    if (isPayloadVar(rootB) && !isPayloadVar(rootA)) {
      this.parent.set(rootB.id, rootA as string);
      return { ok: true };
    }

    if (isPayloadVar(rootA) && isPayloadVar(rootB) && rootA.id !== rootB.id) {
      this.parent.set(rootA.id, rootB.id);
    }

    return { ok: true };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function getDefinitionPortType(
  block: Block,
  portName: string,
  direction: 'in' | 'out'
): SignalType | null {
  const blockDef = getBlockDefinition(block.type);
  if (!blockDef) return null;

  if (direction === 'in') {
    const inputDef = blockDef.inputs[portName];
    return inputDef?.type ?? null;
  } else {
    const outputDef = blockDef.outputs[portName];
    return outputDef?.type ?? null;
  }
}

function instanceUnitVar(blockIndex: BlockIndex, portName: string, direction: 'in' | 'out'): Unit {
  return { kind: 'var', id: `${blockIndex}:${portName}:${direction}` };
}

function instancePayloadVar(blockIndex: BlockIndex, portName: string, direction: 'in' | 'out'): PayloadType {
  return { kind: 'var', id: `${blockIndex}:${portName}:${direction}:payload` };
}

// =============================================================================
// Main Pass
// =============================================================================

/**
 * Pass 1: Type Constraint Solving
 *
 * Resolves all polymorphic types and returns a TypeResolvedPatch with
 * concrete types for every port.
 */
export function pass1TypeConstraints(normalized: NormalizedPatch): Pass1Result {
  const unitUf = new UnitUnionFind();
  const payloadUf = new PayloadUnionFind();
  const errors: TypeConstraintError[] = [];

  // Track polymorphic ports and their instance-specific types
  interface PortInfo {
    block: Block;
    blockIndex: BlockIndex;
    portName: string;
    direction: 'in' | 'out';
    defType: SignalType;
    instanceUnit: Unit;
    instancePayload: PayloadType;
    hasUnitVar: boolean;
    hasPayloadVar: boolean;
  }
  const portInfos = new Map<PortKey, PortInfo>();

  // Maps for intra-block unification: blockIndex -> defVarId -> first port key
  const blockUnitVarToFirst = new Map<number, Map<string, PortKey>>();
  const blockPayloadVarToFirst = new Map<number, Map<string, PortKey>>();

  // Phase 1: Collect all ports and create instance-specific variables for polymorphic ones
  for (let i = 0; i < normalized.blocks.length; i++) {
    const block = normalized.blocks[i];
    const blockIndex = i as BlockIndex;
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    const unitVarMap = new Map<string, PortKey>();
    const payloadVarMap = new Map<string, PortKey>();
    blockUnitVarToFirst.set(i, unitVarMap);
    blockPayloadVarToFirst.set(i, payloadVarMap);

    // Process outputs
    for (const [portName, outputDef] of Object.entries(blockDef.outputs)) {
      if (!outputDef.type) continue;

      const key = portKey(blockIndex, portName, 'out');
      const hasUnitVariable = isUnitVar(outputDef.type.unit);
      const hasPayloadVariable = isPayloadVar(outputDef.type.payload);

      const instanceUnit = hasUnitVariable
        ? instanceUnitVar(blockIndex, portName, 'out')
        : outputDef.type.unit;
      const instancePayload = hasPayloadVariable
        ? instancePayloadVar(blockIndex, portName, 'out')
        : outputDef.type.payload;

      portInfos.set(key, {
        block,
        blockIndex,
        portName,
        direction: 'out',
        defType: outputDef.type,
        instanceUnit,
        instancePayload,
        hasUnitVar: hasUnitVariable,
        hasPayloadVar: hasPayloadVariable,
      });

      // Track for intra-block unification
      if (hasUnitVariable && isUnitVar(outputDef.type.unit)) {
        const defVarId = outputDef.type.unit.id;
        if (!unitVarMap.has(defVarId)) unitVarMap.set(defVarId, key);
      }
      if (hasPayloadVariable && isPayloadVar(outputDef.type.payload)) {
        const defVarId = outputDef.type.payload.id;
        if (!payloadVarMap.has(defVarId)) payloadVarMap.set(defVarId, key);
      }
    }

    // Process inputs
    for (const [portName, inputDef] of Object.entries(blockDef.inputs)) {
      if (!inputDef.type) continue;
      if (inputDef.exposedAsPort === false) continue;

      const key = portKey(blockIndex, portName, 'in');
      const hasUnitVariable = isUnitVar(inputDef.type.unit);
      const hasPayloadVariable = isPayloadVar(inputDef.type.payload);

      const instanceUnit = hasUnitVariable
        ? instanceUnitVar(blockIndex, portName, 'in')
        : inputDef.type.unit;
      const instancePayload = hasPayloadVariable
        ? instancePayloadVar(blockIndex, portName, 'in')
        : inputDef.type.payload;

      portInfos.set(key, {
        block,
        blockIndex,
        portName,
        direction: 'in',
        defType: inputDef.type,
        instanceUnit,
        instancePayload,
        hasUnitVar: hasUnitVariable,
        hasPayloadVar: hasPayloadVariable,
      });

      // Track for intra-block unification
      if (hasUnitVariable && isUnitVar(inputDef.type.unit)) {
        const defVarId = inputDef.type.unit.id;
        if (!unitVarMap.has(defVarId)) unitVarMap.set(defVarId, key);
      }
      if (hasPayloadVariable && isPayloadVar(inputDef.type.payload)) {
        const defVarId = inputDef.type.payload.id;
        if (!payloadVarMap.has(defVarId)) payloadVarMap.set(defVarId, key);
      }
    }
  }

  // Phase 1.5: Unify ports within same block that share definition-level variable IDs
  for (let i = 0; i < normalized.blocks.length; i++) {
    const blockIndex = i as BlockIndex;
    const blockDef = getBlockDefinition(normalized.blocks[i].type);
    if (!blockDef) continue;

    const unitVarMap = blockUnitVarToFirst.get(i);
    const payloadVarMap = blockPayloadVarToFirst.get(i);

    // Unify units within block
    if (unitVarMap) {
      for (const [portName, outputDef] of Object.entries(blockDef.outputs)) {
        if (!outputDef.type || !isUnitVar(outputDef.type.unit)) continue;
        const defVarId = outputDef.type.unit.id;
        const firstKey = unitVarMap.get(defVarId);
        const thisKey = portKey(blockIndex, portName, 'out');
        if (firstKey && firstKey !== thisKey) {
          const first = portInfos.get(firstKey);
          const current = portInfos.get(thisKey);
          if (first && current) unitUf.union(first.instanceUnit, current.instanceUnit);
        }
      }
      for (const [portName, inputDef] of Object.entries(blockDef.inputs)) {
        if (!inputDef.type || !isUnitVar(inputDef.type.unit)) continue;
        const defVarId = inputDef.type.unit.id;
        const firstKey = unitVarMap.get(defVarId);
        const thisKey = portKey(blockIndex, portName, 'in');
        if (firstKey && firstKey !== thisKey) {
          const first = portInfos.get(firstKey);
          const current = portInfos.get(thisKey);
          if (first && current) unitUf.union(first.instanceUnit, current.instanceUnit);
        }
      }
    }

    // Unify payloads within block
    if (payloadVarMap) {
      for (const [portName, outputDef] of Object.entries(blockDef.outputs)) {
        if (!outputDef.type || !isPayloadVar(outputDef.type.payload)) continue;
        const defVarId = outputDef.type.payload.id;
        const firstKey = payloadVarMap.get(defVarId);
        const thisKey = portKey(blockIndex, portName, 'out');
        if (firstKey && firstKey !== thisKey) {
          const first = portInfos.get(firstKey);
          const current = portInfos.get(thisKey);
          if (first && current) payloadUf.union(first.instancePayload, current.instancePayload);
        }
      }
      for (const [portName, inputDef] of Object.entries(blockDef.inputs)) {
        if (!inputDef.type || !isPayloadVar(inputDef.type.payload)) continue;
        const defVarId = inputDef.type.payload.id;
        const firstKey = payloadVarMap.get(defVarId);
        const thisKey = portKey(blockIndex, portName, 'in');
        if (firstKey && firstKey !== thisKey) {
          const first = portInfos.get(firstKey);
          const current = portInfos.get(thisKey);
          if (first && current) payloadUf.union(first.instancePayload, current.instancePayload);
        }
      }
    }
  }

  // Phase 2: Collect constraints from edges
  for (const edge of normalized.edges) {
    const fromKey = portKey(edge.fromBlock, edge.fromPort, 'out');
    const toKey = portKey(edge.toBlock, edge.toPort, 'in');
    const fromInfo = portInfos.get(fromKey);
    const toInfo = portInfos.get(toKey);

    if (!fromInfo || !toInfo) continue;

    // Unit constraint
    const unitResult = unitUf.union(fromInfo.instanceUnit, toInfo.instanceUnit);
    if (!unitResult.ok) {
      const fromBlock = normalized.blocks[edge.fromBlock];
      const toBlock = normalized.blocks[edge.toBlock];
      errors.push({
        kind: 'ConflictingUnits',
        blockIndex: edge.toBlock,
        portName: edge.toPort,
        message: `Conflicting units: ${unitResult.conflict[0].kind} vs ${unitResult.conflict[1].kind} (${fromBlock.type} -> ${toBlock.type})`,
        suggestions: [
          'Insert a unit adapter between these blocks',
          'Change the source block to output the expected unit',
        ],
      });
    }

    // Payload constraint
    const payloadResult = payloadUf.union(fromInfo.instancePayload, toInfo.instancePayload);
    if (!payloadResult.ok) {
      const fromBlock = normalized.blocks[edge.fromBlock];
      const toBlock = normalized.blocks[edge.toBlock];
      const p0 = payloadResult.conflict[0];
      const p1 = payloadResult.conflict[1];
      const p0Str = isPayloadVar(p0) ? `var(${p0.id})` : p0;
      const p1Str = isPayloadVar(p1) ? `var(${p1.id})` : p1;
      errors.push({
        kind: 'ConflictingPayloads',
        blockIndex: edge.toBlock,
        portName: edge.toPort,
        message: `Conflicting payloads: ${p0Str} vs ${p1Str} (${fromBlock.type} -> ${toBlock.type})`,
        suggestions: [
          'Ensure connected ports have compatible payload types',
          'Insert an adapter block for payload conversion',
        ],
      });
    }
  }

  // Phase 3: Resolve all ports and build output map
  const portTypes = new Map<PortKey, SignalType>();

  for (const [key, info] of portInfos) {
    let resolvedUnit = unitUf.find(info.instanceUnit);
    let resolvedPayload = payloadUf.find(info.instancePayload);

    // Check for unresolved variables
    if (info.hasUnitVar && isUnitVar(resolvedUnit)) {
      errors.push({
        kind: 'UnresolvedUnit',
        blockIndex: info.blockIndex,
        portName: info.portName,
        message: `Cannot resolve unit for ${info.block.type}.${info.portName}`,
        suggestions: [
          'Connect this port to a typed consumer',
          'Set an explicit unit on this block',
        ],
      });
      continue;
    }

    if (info.hasPayloadVar && isPayloadVar(resolvedPayload)) {
      errors.push({
        kind: 'UnresolvedPayload',
        blockIndex: info.blockIndex,
        portName: info.portName,
        message: `Cannot resolve payload for ${info.block.type}.${info.portName}`,
        suggestions: [
          'Connect this port to a typed source or consumer',
          'Ensure the block is properly wired',
        ],
      });
      continue;
    }

    // Build resolved type
    portTypes.set(key, {
      ...info.defType,
      payload: resolvedPayload as ConcretePayloadType,
      unit: resolvedUnit,
    });
  }

  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  // Return the same graph structure with resolved types added
  return {
    ...normalized,
    portTypes,
  };
}

// =============================================================================
// Helper for downstream passes
// =============================================================================

/**
 * Get the resolved type for a port from a TypeResolvedPatch.
 * This is the ONLY way to look up port types after pass1.
 */
export function getPortType(
  patch: TypeResolvedPatch,
  blockIndex: BlockIndex,
  portName: string,
  direction: 'in' | 'out'
): SignalType | undefined {
  return patch.portTypes.get(portKey(blockIndex, portName, direction));
}
