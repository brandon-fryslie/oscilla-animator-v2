/**
 * Cardinality Constraint Solver (Sprint 2)
 *
 * Resolves cardinality variables to concrete CardinalityValue via union-find.
 * Replaces the fixpoint loop in analyze-type-constraints.ts with proper constraint solving.
 *
 * Key principles:
 * - Cardinality variables are created during constraint gathering
 * - Concrete values propagate through union-find groups
 * - Conflicts (two different concrete values in same group) → error
 * - zipBroadcast groups allow mixed one+many (many wins, one ports get broadcast)
 */

import type { BlockIndex } from '../ir/patches';
import type { CanonicalType, Cardinality, CardinalityValue } from '../../core/canonical-types';
import { isAxisInst, cardinalityOne, cardinalityMany } from '../../core/canonical-types';
import type { CardinalityVarId } from '../../core/ids';
import type { PortKey } from './analyze-type-constraints';

// =============================================================================
// Constraint Types
// =============================================================================

/**
 * Cardinality constraint: describes how cardinalities relate across ports.
 *
 * - equal: All ports share the same cardinality (strict match)
 * - fixed: Port has a known concrete cardinality
 * - zipBroadcast: Ports share cardinality, but allow one+many mix (many wins)
 */
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

  /** Ensure a node exists. */
  ensure(id: UFNodeId): void {
    if (!this.parent.has(id)) this.parent.set(id, { tag: 'parent', id });
  }

  /** Find root, with path compression. */
  find(id: UFNodeId): UFParent {
    this.ensure(id);
    const p = this.parent.get(id)!;

    if (p.tag === 'value') return p;
    if (p.id === id) return p; // root (self-parent)

    const root = this.find(p.id);
    // compress:
    if (root.tag === 'parent') this.parent.set(id, { tag: 'parent', id: root.id });
    else this.parent.set(id, root);
    return root;
  }

  /** Assign a concrete value to a node (unifies with existing assignment if present). */
  assign(id: UFNodeId, value: CardinalityValue): { ok: true } | { ok: false; conflict: [CardinalityValue, CardinalityValue] } {
    const r = this.find(id);
    if (r.tag === 'value') {
      if (cardinalitiesEqual(r.value, value)) {
        // Prefer concrete over placeholder
        const preferred = preferConcreteCardinality(r.value, value);
        this.parent.set(id, { tag: 'value', value: preferred });
        return { ok: true };
      }
      return { ok: false, conflict: [r.value, value] };
    }
    // r is root parent
    this.parent.set(r.id, { tag: 'value', value });
    return { ok: true };
  }

  /** Union two nodes. */
  union(a: UFNodeId, b: UFNodeId): { ok: true } | { ok: false; conflict: [CardinalityValue, CardinalityValue] } {
    const ra = this.find(a);
    const rb = this.find(b);

    // both resolved:
    if (ra.tag === 'value' && rb.tag === 'value') {
      if (cardinalitiesEqual(ra.value, rb.value)) {
        // Prefer concrete over placeholder
        const preferred = preferConcreteCardinality(ra.value, rb.value);
        // Update both roots to use the preferred value
        this.parent.set(a, { tag: 'value', value: preferred });
        this.parent.set(b, { tag: 'value', value: preferred });
        return { ok: true };
      }
      return { ok: false, conflict: [ra.value, rb.value] };
    }

    // one resolved:
    if (ra.tag === 'value' && rb.tag === 'parent') {
      this.parent.set(rb.id, ra);
      return { ok: true };
    }
    if (rb.tag === 'value' && ra.tag === 'parent') {
      this.parent.set(ra.id, rb);
      return { ok: true };
    }

    // both parent roots:
    if (ra.tag === 'parent' && rb.tag === 'parent') {
      if (ra.id !== rb.id) this.parent.set(ra.id, { tag: 'parent', id: rb.id });
      return { ok: true };
    }

    // unreachable
    return { ok: true };
  }

  /** If node is resolved, return value. */
  resolved(id: UFNodeId): CardinalityValue | null {
    const r = this.find(id);
    return r.tag === 'value' ? r.value : null;
  }
}

// =============================================================================
// Equality
// =============================================================================

/**
 * Check if an instance ref is a placeholder ('default'/'default').
 * Block definitions use placeholder instance refs for field ports
 * that will be resolved to concrete refs during type inference.
 */
function isPlaceholderInstance(instance: CardinalityValue): boolean {
  if (instance.kind !== 'many') return false;
  return instance.instance.domainTypeId === 'default' && instance.instance.instanceId === 'default';
}

/**
 * Cardinality equality for union-find merging.
 * Placeholder instance refs ('default'/'default') are compatible with any concrete ref.
 */
function cardinalitiesEqual(a: CardinalityValue, b: CardinalityValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'many' && b.kind === 'many') {
    // Placeholder is compatible with anything
    if (isPlaceholderInstance(a) || isPlaceholderInstance(b)) return true;
    return (
      a.instance.domainTypeId === b.instance.domainTypeId &&
      a.instance.instanceId === b.instance.instanceId
    );
  }
  return true;
}

/**
 * When merging two compatible many values, prefer the concrete one over placeholder.
 */
function preferConcreteCardinality(a: CardinalityValue, b: CardinalityValue): CardinalityValue {
  if (a.kind === 'many' && b.kind === 'many') {
    if (isPlaceholderInstance(a) && !isPlaceholderInstance(b)) return b;
    if (!isPlaceholderInstance(a) && isPlaceholderInstance(b)) return a;
  }
  return a; // default: keep first
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
// Solver
// =============================================================================

export interface SolveCardinalityInput {
  /** Initial port types (may have cardinality variables) */
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
  /** Cardinality constraints to solve */
  readonly constraints: readonly CardinalityConstraint[];
  /** Edges for propagation */
  readonly edges: ReadonlyArray<{
    readonly fromBlock: BlockIndex;
    readonly fromPort: string;
    readonly toBlock: BlockIndex;
    readonly toPort: string;
  }>;
}

export interface SolveCardinalityResult {
  /** Resolved port types (all cardinality variables replaced with concrete values) */
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
  /** Errors encountered during solving */
  readonly errors: readonly CardinalityConstraintError[];
}

/**
 * Solve cardinality constraints using union-find.
 *
 * Algorithm:
 * 1. Create union-find groups from constraint variable IDs
 * 2. For 'equal' and 'zipBroadcast' constraints: union all ports in group
 * 3. For 'fixed' constraints: assign concrete values
 * 4. Propagate concrete values along edges
 * 5. For 'zipBroadcast' groups: resolve mixed one+many (many wins)
 * 6. Write resolved cardinalities back to port types
 */
export function solveCardinality(input: SolveCardinalityInput): SolveCardinalityResult {
  const uf = new CardinalityUnionFind();
  const errors: CardinalityConstraintError[] = [];

  // Map from PortKey to UF node
  const portToNode = new Map<PortKey, UFNodeId>();

  // Track zipBroadcast groups for special handling
  const zipBroadcastGroups = new Map<CardinalityVarId, readonly PortKey[]>();

  // Phase 1: Create nodes and union groups
  for (const constraint of input.constraints) {
    if (constraint.kind === 'equal' || constraint.kind === 'zipBroadcast') {
      if (constraint.kind === 'zipBroadcast') {
        zipBroadcastGroups.set(constraint.varId, constraint.ports);
      }

      // Create nodes for all ports in this group
      const groupNodeId = ufNodeId(`var:${constraint.varId}`);
      uf.ensure(groupNodeId);

      for (const port of constraint.ports) {
        const portNodeId = ufNodeId(`port:${port}`);
        uf.ensure(portNodeId);
        portToNode.set(port, portNodeId);

        // Union with group
        const res = uf.union(portNodeId, groupNodeId);
        if (!res.ok) {
          const [blockIndex, portName] = parsePortKey(port);
          errors.push({
            kind: 'CardinalityConflict',
            port,
            blockIndex,
            portName,
            message: `Cardinality conflict in constraint group ${constraint.varId}`,
            details: { conflict: res.conflict, varId: constraint.varId },
          });
        }
      }
    } else if (constraint.kind === 'fixed') {
      // Fixed cardinality: create node and assign value
      const portNodeId = ufNodeId(`port:${constraint.port}`);
      uf.ensure(portNodeId);
      portToNode.set(constraint.port, portNodeId);

      const res = uf.assign(portNodeId, constraint.value);
      if (!res.ok) {
        const [blockIndex, portName] = parsePortKey(constraint.port);
        errors.push({
          kind: 'CardinalityConflict',
          port: constraint.port,
          blockIndex,
          portName,
          message: `Cardinality conflict: fixed value ${JSON.stringify(constraint.value)} conflicts with inferred value`,
          details: { conflict: res.conflict },
        });
      }
    }
  }

  // Phase 2: Propagate concrete values from initial port types
  for (const [port, type] of input.portTypes) {
    const card = type.extent.cardinality;
    if (isAxisInst(card)) {
      // This port has a concrete cardinality, propagate it
      let nodeId = portToNode.get(port);
      if (!nodeId) {
        // Create node for ports not in any constraint
        nodeId = ufNodeId(`port:${port}`);
        uf.ensure(nodeId);
        portToNode.set(port, nodeId);
      }

      const res = uf.assign(nodeId, card.value);
      if (!res.ok) {
        const [blockIndex, portName] = parsePortKey(port);
        errors.push({
          kind: 'CardinalityConflict',
          port,
          blockIndex,
          portName,
          message: `Cardinality conflict at port ${portName}: ${JSON.stringify(res.conflict[0])} vs ${JSON.stringify(res.conflict[1])}`,
          details: { conflict: res.conflict },
        });
      }
    }
  }

  // Phase 3: Propagate along edges
  for (const edge of input.edges) {
    const fromPort: PortKey = `${edge.fromBlock}:${edge.fromPort}:out` as PortKey;
    const toPort: PortKey = `${edge.toBlock}:${edge.toPort}:in` as PortKey;

    const fromNode = portToNode.get(fromPort);
    const toNode = portToNode.get(toPort);

    if (fromNode && toNode) {
      const res = uf.union(fromNode, toNode);
      if (!res.ok) {
        const [blockIndex, portName] = parsePortKey(toPort);
        errors.push({
          kind: 'CardinalityConflict',
          port: toPort,
          blockIndex,
          portName,
          message: `Cardinality conflict along edge from ${fromPort} to ${toPort}`,
          details: { conflict: res.conflict },
        });
      }
    }
  }

  // Phase 4: Special handling for zipBroadcast groups
  for (const [varId, ports] of zipBroadcastGroups) {
    // Check if this group has mixed one+many
    let manyValue: CardinalityValue | null = null;
    let hasOne = false;

    for (const port of ports) {
      const nodeId = portToNode.get(port);
      if (!nodeId) continue;

      const resolved = uf.resolved(nodeId);
      if (resolved) {
        if (resolved.kind === 'many') {
          manyValue = resolved;
        } else if (resolved.kind === 'one') {
          hasOne = true;
        }
      }
    }

    // If we have both one and many, unify to many
    if (manyValue && hasOne) {
      const groupNodeId = ufNodeId(`var:${varId}`);
      uf.assign(groupNodeId, manyValue);
    }
  }

  // Phase 5: Write resolved cardinalities back to port types
  const resolvedPortTypes = new Map<PortKey, CanonicalType>();

  for (const [port, type] of input.portTypes) {
    const nodeId = portToNode.get(port);

    let resolvedCard: Cardinality;
    if (nodeId) {
      const resolved = uf.resolved(nodeId);
      if (resolved) {
        // Resolved to concrete value
        if (resolved.kind === 'one') {
          resolvedCard = cardinalityOne();
        } else if (resolved.kind === 'many') {
          resolvedCard = cardinalityMany(resolved.instance);
        } else {
          // zero cardinality
          resolvedCard = { kind: 'inst', value: resolved };
        }
      } else {
        // Unresolved variable
        const [blockIndex, portName] = parsePortKey(port);
        errors.push({
          kind: 'UnresolvedCardinality',
          port,
          blockIndex,
          portName,
          message: `Cannot infer cardinality for port ${portName}`,
        });
        // Keep original
        resolvedCard = type.extent.cardinality;
      }
    } else {
      // Port not in any constraint, keep original
      resolvedCard = type.extent.cardinality;
    }

    resolvedPortTypes.set(port, {
      ...type,
      extent: {
        ...type.extent,
        cardinality: resolvedCard,
      },
    });
  }

  return {
    portTypes: resolvedPortTypes,
    errors,
  };
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
