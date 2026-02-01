/**
 * Cardinality Constraint Solver (Sprint 2)
 *
 * Resolves cardinality variables to concrete CardinalityValue via union-find.
 *
 * Key insight: zipBroadcast ports must NOT be eagerly unioned in Phase 1.
 * They are kept as independent UF nodes. In Phase 3, edges involving zip
 * members attempt union — compatible edges (many-many) succeed and propagate
 * instance refs, while one-vs-many conflicts are suppressed (broadcast case).
 * Phase 4 then upgrades placeholder many values to concrete refs.
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

/**
 * Union-Find with properly separated parent pointers and values.
 * Values are stored only on root nodes. All nodes in a group share
 * the root's value, so updating the root propagates to all members.
 */
class CardinalityUnionFind {
  private parent = new Map<UFNodeId, UFNodeId>();
  private value = new Map<UFNodeId, CardinalityValue>();

  ensure(id: UFNodeId): void {
    if (!this.parent.has(id)) this.parent.set(id, id); // self-root
  }

  /** Returns the root node ID (with path compression). */
  find(id: UFNodeId): UFNodeId {
    this.ensure(id);
    const p = this.parent.get(id)!;
    if (p === id) return id;
    const root = this.find(p);
    this.parent.set(id, root); // path compression
    return root;
  }

  assign(id: UFNodeId, val: CardinalityValue): { ok: true } | { ok: false; conflict: [CardinalityValue, CardinalityValue] } {
    const root = this.find(id);
    const existing = this.value.get(root);
    if (existing !== undefined) {
      if (cardinalitiesEqual(existing, val)) {
        this.value.set(root, preferConcreteCardinality(existing, val));
        return { ok: true };
      }
      return { ok: false, conflict: [existing, val] };
    }
    this.value.set(root, val);
    return { ok: true };
  }

  union(a: UFNodeId, b: UFNodeId): { ok: true } | { ok: false; conflict: [CardinalityValue, CardinalityValue] } {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return { ok: true };

    const valA = this.value.get(rootA);
    const valB = this.value.get(rootB);

    if (valA !== undefined && valB !== undefined) {
      if (!cardinalitiesEqual(valA, valB)) {
        return { ok: false, conflict: [valA, valB] };
      }
      const preferred = preferConcreteCardinality(valA, valB);
      // Merge B into A, keep preferred value on new root
      this.parent.set(rootB, rootA);
      this.value.set(rootA, preferred);
      this.value.delete(rootB);
      return { ok: true };
    }

    if (valA !== undefined) {
      // A has value, merge B into A
      this.parent.set(rootB, rootA);
      return { ok: true };
    }
    if (valB !== undefined) {
      // B has value, merge A into B
      this.parent.set(rootA, rootB);
      return { ok: true };
    }
    // Neither has value, merge A into B
    this.parent.set(rootA, rootB);
    return { ok: true };
  }

  resolved(id: UFNodeId): CardinalityValue | null {
    const root = this.find(id);
    return this.value.get(root) ?? null;
  }
}

// =============================================================================
// Equality helpers
// =============================================================================

function isPlaceholderInstance(val: CardinalityValue): boolean {
  if (val.kind !== 'many') return false;
  return val.instance.domainTypeId === 'default' && val.instance.instanceId === 'default';
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
            message: `Cardinality conflict in group ${constraint.varId} at ${formatPort(port, blockName)}`,
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
          message: `Cardinality conflict at ${formatPort(constraint.port, blockName)}: fixed value conflicts`,
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

  // Phase 3: Propagate along edges.
  // For zip member edges: try union. Suppress one-vs-many conflicts (broadcast case).
  // Compatible edges (many-many, one-one) succeed and propagate instance refs.
  for (const edge of input.edges) {
    const fromPort: PortKey = `${edge.fromBlock}:${edge.fromPort}:out` as PortKey;
    const toPort: PortKey = `${edge.toBlock}:${edge.toPort}:in` as PortKey;
    const fromNode = portToNode.get(fromPort);
    const toNode = portToNode.get(toPort);
    if (fromNode && toNode) {
      const hasZipMember = zipMemberPorts.has(fromPort) || zipMemberPorts.has(toPort);
      const res = uf.union(fromNode, toNode);
      if (!res.ok) {
        const [conflictA, conflictB] = res.conflict;
        const isOneVsMany = (conflictA.kind === 'one' && conflictB.kind === 'many') ||
                            (conflictA.kind === 'many' && conflictB.kind === 'one');
        if (hasZipMember && isOneVsMany) {
          // Suppress: this is the broadcast case. Pass 2 handles it.
        } else {
          const [blockIndex, portName] = parsePortKey(toPort);
          errors.push({
            kind: 'CardinalityConflict', port: toPort, blockIndex, portName,
            message: `Cardinality conflict along edge from ${formatPort(fromPort, blockName)} to ${formatPort(toPort, blockName)}`,
            details: { conflict: res.conflict },
          });
        }
      }
    }
  }

  // Phase 4: Resolve zipBroadcast groups.
  // Find best concrete many value. Upgrade placeholder many to concrete.
  // Commit pending ones for signal ports. Assign many to truly unresolved.
  for (const [_varId, ports] of zipBroadcastGroups) {
    let bestMany: CardinalityValue | null = null;
    for (const port of ports) {
      const nodeId = portToNode.get(port);
      if (!nodeId) continue;
      const resolved = uf.resolved(nodeId);
      if (resolved && resolved.kind === 'many') {
        if (!bestMany || (isPlaceholderInstance(bestMany) && !isPlaceholderInstance(resolved))) {
          bestMany = resolved;
        }
      }
    }
    if (bestMany) {
      for (const port of ports) {
        const nodeId = portToNode.get(port);
        if (!nodeId) continue;
        const resolved = uf.resolved(nodeId);
        if (!resolved) {
          if (pendingOneNodes.has(nodeId)) {
            // Signal port: commit as one (broadcast adapter handles it)
            uf.assign(nodeId, pendingOneNodes.get(nodeId)!);
            pendingOneNodes.delete(nodeId);
          } else {
            // Truly unresolved: assign many
            uf.assign(nodeId, bestMany);
          }
        } else if (resolved.kind === 'many' && isPlaceholderInstance(resolved) && !isPlaceholderInstance(bestMany)) {
          // Upgrade placeholder many to concrete ref
          uf.assign(nodeId, bestMany);
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
