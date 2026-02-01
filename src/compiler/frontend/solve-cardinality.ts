/**
 * Cardinality Constraint Solver (Sprint 2)
 *
 * Resolves cardinality variables to concrete CardinalityValue via union-find.
 *
 * Key principles:
 * - Cardinality variables are created during constraint gathering
 * - Concrete values propagate through union-find groups
 * - Conflicts (two different concrete values in same group) → error
 * - zipBroadcast groups allow mixed one+many (many wins, one ports get broadcast)
 *
 * IMPORTANT: zipBroadcast ports must NOT be eagerly unioned in Phase 1.
 * They are kept as independent UF nodes and resolved in Phase 4 after
 * all concrete values have propagated. This prevents false one-vs-many conflicts.
 */

import type { BlockIndex } from '../ir/patches';
import type { CanonicalType, Cardinality, CardinalityValue } from '../../core/canonical-types';
import { isAxisInst, cardinalityOne, cardinalityMany } from '../../core/canonical-types';
import type { CardinalityVarId } from '../../core/ids';
import type { PortKey } from './analyze-type-constraints';

// =============================================================================
// Constraint Types
// =============================================================================

export type CardinalityConstraint =
  | { readonly kind: 'equal'; readonly varId: CardinalityVarId; readonly ports: readonly PortKey[] }
  | { readonly kind: 'fixed'; readonly port: PortKey; readonly value: CardinalityValue }
  | { readonly kind: 'zipBroadcast'; readonly varId: CardinalityVarId; readonly ports: readonly PortKey[] };

// =============================================================================
// Union-Find for Cardinality
// =============================================================================

type UFNodeId = string & { readonly __brand: 'CardinalityUFNodeId' };
function ufNodeId(s: string): UFNodeId { return s as UFNodeId; }

type UFParent =
  | { readonly tag: 'parent'; readonly id: UFNodeId }
  | { readonly tag: 'value'; readonly value: CardinalityValue };

class CardinalityUnionFind {
  private parent = new Map<UFNodeId, UFParent>();

  ensure(id: UFNodeId): void {
    if (!this.parent.has(id)) this.parent.set(id, { tag: 'parent', id });
  }

  find(id: UFNodeId): UFParent {
    this.ensure(id);
    const p = this.parent.get(id)!;
    if (p.tag === 'value') return p;
    if (p.id === id) return p;
    const root = this.find(p.id);
    if (root.tag === 'parent') this.parent.set(id, { tag: 'parent', id: root.id });
    else this.parent.set(id, root);
    return root;
  }

  assign(id: UFNodeId, value: CardinalityValue): { ok: true } | { ok: false; conflict: [CardinalityValue, CardinalityValue] } {
    const r = this.find(id);
    if (r.tag === 'value') {
      if (cardinalitiesEqual(r.value, value)) {
        const preferred = preferConcreteCardinality(r.value, value);
        this.parent.set(id, { tag: 'value', value: preferred });
        return { ok: true };
      }
      return { ok: false, conflict: [r.value, value] };
    }
    this.parent.set(r.id, { tag: 'value', value });
    return { ok: true };
  }

  union(a: UFNodeId, b: UFNodeId): { ok: true } | { ok: false; conflict: [CardinalityValue, CardinalityValue] } {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra.tag === 'value' && rb.tag === 'value') {
      if (cardinalitiesEqual(ra.value, rb.value)) {
        const preferred = preferConcreteCardinality(ra.value, rb.value);
        this.parent.set(a, { tag: 'value', value: preferred });
        this.parent.set(b, { tag: 'value', value: preferred });
        return { ok: true };
      }
      return { ok: false, conflict: [ra.value, rb.value] };
    }
    if (ra.tag === 'value' && rb.tag === 'parent') { this.parent.set(rb.id, ra); return { ok: true }; }
    if (rb.tag === 'value' && ra.tag === 'parent') { this.parent.set(ra.id, rb); return { ok: true }; }
    if (ra.tag === 'parent' && rb.tag === 'parent') {
      if (ra.id !== rb.id) this.parent.set(ra.id, { tag: 'parent', id: rb.id });
      return { ok: true };
    }
    return { ok: true };
  }

  resolved(id: UFNodeId): CardinalityValue | null {
    const r = this.find(id);
    return r.tag === 'value' ? r.value : null;
  }
}

// =============================================================================
// Equality helpers
// =============================================================================

function isPlaceholderInstance(instance: CardinalityValue): boolean {
  if (instance.kind !== 'many') return false;
  return instance.instance.domainTypeId === 'default' && instance.instance.instanceId === 'default';
}

function cardinalitiesEqual(a: CardinalityValue, b: CardinalityValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'many' && b.kind === 'many') {
    if (isPlaceholderInstance(a) || isPlaceholderInstance(b)) return true;
    return a.instance.domainTypeId === b.instance.domainTypeId && a.instance.instanceId === b.instance.instanceId;
  }
  return true;
}

function preferConcreteCardinality(a: CardinalityValue, b: CardinalityValue): CardinalityValue {
  if (a.kind === 'many' && b.kind === 'many') {
    if (isPlaceholderInstance(a) && !isPlaceholderInstance(b)) return b;
    if (!isPlaceholderInstance(a) && isPlaceholderInstance(b)) return a;
  }
  return a;
}

// =============================================================================
// Error Types
// =============================================================================

export interface CardinalityConstraintError {
  readonly kind: 'CardinalityConflict' | 'UnresolvedCardinality' | 'InvalidZipBroadcast';
  readonly port: PortKey;
  readonly blockIndex: BlockIndex;
  readonly portName: string;
  readonly message: string;
  readonly details?: {
    readonly conflict?: [CardinalityValue, CardinalityValue];
    readonly varId?: CardinalityVarId;
  };
}

// =============================================================================
// Solver interface
// =============================================================================

export interface SolveCardinalityInput {
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
  readonly constraints: readonly CardinalityConstraint[];
  readonly edges: ReadonlyArray<{
    readonly fromBlock: BlockIndex;
    readonly fromPort: string;
    readonly toBlock: BlockIndex;
    readonly toPort: string;
  }>;
  readonly blockName?: (index: BlockIndex) => string;
}

export interface SolveCardinalityResult {
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
  readonly errors: readonly CardinalityConstraintError[];
}

function formatPort(port: PortKey, blockName?: (index: BlockIndex) => string): string {
  const [blockIndex, portName] = parsePortKey(port);
  if (blockName) return `${blockName(blockIndex)}.${portName}`;
  return `block#${blockIndex}.${portName}`;
}

// =============================================================================
// Solver
// =============================================================================

export function solveCardinality(input: SolveCardinalityInput): SolveCardinalityResult {
  const uf = new CardinalityUnionFind();
  const errors: CardinalityConstraintError[] = [];
  const { blockName } = input;
  const portToNode = new Map<PortKey, UFNodeId>();
  const zipBroadcastGroups = new Map<CardinalityVarId, readonly PortKey[]>();
  const zipMemberPorts = new Set<PortKey>();
  const pendingOneNodes = new Map<UFNodeId, CardinalityValue>();

  // Phase 1: Create nodes. Union 'equal' groups. zipBroadcast ports stay independent.
  for (const constraint of input.constraints) {
    if (constraint.kind === 'equal') {
      const groupNodeId = ufNodeId(`var:${constraint.varId}`);
      uf.ensure(groupNodeId);
      for (const port of constraint.ports) {
        const portNodeId = ufNodeId(`port:${port}`);
        uf.ensure(portNodeId);
        portToNode.set(port, portNodeId);
        const res = uf.union(portNodeId, groupNodeId);
        if (!res.ok) {
          const [blockIndex, portName] = parsePortKey(port);
          errors.push({
            kind: 'CardinalityConflict', port, blockIndex, portName,
            message: `Cardinality conflict in constraint group ${constraint.varId} at ${formatPort(port, blockName)}`,
            details: { conflict: res.conflict, varId: constraint.varId },
          });
        }
      }
    } else if (constraint.kind === 'zipBroadcast') {
      zipBroadcastGroups.set(constraint.varId, constraint.ports);
      for (const port of constraint.ports) {
        const portNodeId = ufNodeId(`port:${port}`);
        uf.ensure(portNodeId);
        portToNode.set(port, portNodeId);
        zipMemberPorts.add(port);
      }
    } else if (constraint.kind === 'fixed') {
      const portNodeId = ufNodeId(`port:${constraint.port}`);
      uf.ensure(portNodeId);
      portToNode.set(constraint.port, portNodeId);
      const res = uf.assign(portNodeId, constraint.value);
      if (!res.ok) {
        const [blockIndex, portName] = parsePortKey(constraint.port);
        errors.push({
          kind: 'CardinalityConflict', port: constraint.port, blockIndex, portName,
          message: `Cardinality conflict at ${formatPort(constraint.port, blockName)}: fixed value conflicts with inferred`,
          details: { conflict: res.conflict },
        });
      }
    }
  }

  // Phase 2: Propagate concrete values from port types. Defer 'one' for zip members.
  for (const [port, type] of input.portTypes) {
    const card = type.extent.cardinality;
    if (isAxisInst(card)) {
      let nodeId = portToNode.get(port);
      if (!nodeId) {
        nodeId = ufNodeId(`port:${port}`);
        uf.ensure(nodeId);
        portToNode.set(port, nodeId);
      }
      if (zipMemberPorts.has(port) && card.value.kind === 'one') {
        pendingOneNodes.set(nodeId, card.value);
        continue;
      }
      const res = uf.assign(nodeId, card.value);
      if (!res.ok) {
        const [blockIndex, portName] = parsePortKey(port);
        errors.push({
          kind: 'CardinalityConflict', port, blockIndex, portName,
          message: `Cardinality conflict at ${formatPort(port, blockName)}: ${JSON.stringify(res.conflict[0])} vs ${JSON.stringify(res.conflict[1])}`,
          details: { conflict: res.conflict },
        });
      }
    }
  }

  // Phase 3: Propagate along edges. Skip zip member edges (allow mismatch).
  for (const edge of input.edges) {
    const fromPort: PortKey = `${edge.fromBlock}:${edge.fromPort}:out` as PortKey;
    const toPort: PortKey = `${edge.toBlock}:${edge.toPort}:in` as PortKey;
    const fromNode = portToNode.get(fromPort);
    const toNode = portToNode.get(toPort);
    if (fromNode && toNode) {
      if (zipMemberPorts.has(fromPort) || zipMemberPorts.has(toPort)) continue;
      const res = uf.union(fromNode, toNode);
      if (!res.ok) {
        const [blockIndex, portName] = parsePortKey(toPort);
        errors.push({
          kind: 'CardinalityConflict', port: toPort, blockIndex, portName,
          message: `Cardinality conflict along edge from ${formatPort(fromPort, blockName)} to ${formatPort(toPort, blockName)}`,
          details: { conflict: res.conflict },
        });
      }
    }
  }

  // Phase 4: Resolve zipBroadcast groups. Many wins; unresolved get many; one stays one.
  for (const [_varId, ports] of zipBroadcastGroups) {
    let manyValue: CardinalityValue | null = null;
    for (const port of ports) {
      const nodeId = portToNode.get(port);
      if (!nodeId) continue;
      const resolved = uf.resolved(nodeId);
      if (resolved && resolved.kind === 'many') { manyValue = resolved; break; }
    }
    if (manyValue) {
      for (const port of ports) {
        const nodeId = portToNode.get(port);
        if (!nodeId) continue;
        const resolved = uf.resolved(nodeId);
        if (!resolved) {
          uf.assign(nodeId, manyValue);
          pendingOneNodes.delete(nodeId);
        }
      }
    }
  }

  // Phase 4b: Commit remaining deferred one-values
  for (const [nodeId, value] of pendingOneNodes) {
    if (!uf.resolved(nodeId)) uf.assign(nodeId, value);
  }

  // Phase 5: Write resolved cardinalities back to port types
  const resolvedPortTypes = new Map<PortKey, CanonicalType>();
  for (const [port, type] of input.portTypes) {
    const nodeId = portToNode.get(port);
    let resolvedCard: Cardinality;
    if (nodeId) {
      const resolved = uf.resolved(nodeId);
      if (resolved) {
        if (resolved.kind === 'one') resolvedCard = cardinalityOne();
        else if (resolved.kind === 'many') resolvedCard = cardinalityMany(resolved.instance);
        else resolvedCard = { kind: 'inst', value: resolved };
      } else {
        const [blockIndex, portName] = parsePortKey(port);
        errors.push({
          kind: 'UnresolvedCardinality', port, blockIndex, portName,
          message: `Cannot infer cardinality for ${formatPort(port, blockName)}`,
        });
        resolvedCard = type.extent.cardinality;
      }
    } else {
      resolvedCard = type.extent.cardinality;
    }
    resolvedPortTypes.set(port, { ...type, extent: { ...type.extent, cardinality: resolvedCard } });
  }

  return { portTypes: resolvedPortTypes, errors };
}

// =============================================================================
// Helpers
// =============================================================================

function parsePortKey(key: PortKey): [BlockIndex, string] {
  const parts = key.split(':');
  const blockIndex = parseInt(parts[0], 10) as BlockIndex;
  const portName = parts[1];
  return [blockIndex, portName];
}
