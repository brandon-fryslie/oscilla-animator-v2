/**
 * Payload/Unit Constraint Solver for DraftGraph
 *
 * Union-find solver that resolves payload and unit variables to concrete types.
 * Produces substitution maps that can be applied to InferenceCanonicalTypes.
 *
 * Adapted from the union-find logic in analyze-type-constraints.ts for use with
 * DraftPortKey-based constraints from extract-constraints.ts.
 *
 * // [LAW:one-source-of-truth] Substitution is the only output; no side-channel mutations.
 * // [LAW:single-enforcer] This is the single place that resolves payload/unit vars.
 */

import type { PayloadType, UnitType } from '../../core/canonical-types';
import type { DraftPortKey } from './type-facts';
import type { PayloadUnitConstraint } from './extract-constraints';

// =============================================================================
// Union-Find (generic, tagged)
// =============================================================================

type UFNodeId = string & { readonly __brand: 'PayloadUnitUFNodeId' };
function ufNodeId(s: string): UFNodeId { return s as UFNodeId; }

type UFParent<T> =
  | { readonly tag: 'parent'; readonly id: UFNodeId }
  | { readonly tag: 'value'; readonly value: T };

class UnionFind<T> {
  private parent = new Map<UFNodeId, UFParent<T>>();

  ensure(id: UFNodeId): void {
    if (!this.parent.has(id)) this.parent.set(id, { tag: 'parent', id });
  }

  find(id: UFNodeId): UFParent<T> {
    this.ensure(id);
    const p = this.parent.get(id)!;
    if (p.tag === 'value') return p;
    if (p.id === id) return p; // root
    const root = this.find(p.id);
    // path compression
    if (root.tag === 'parent') this.parent.set(id, { tag: 'parent', id: root.id });
    else this.parent.set(id, root);
    return root;
  }

  assign(id: UFNodeId, value: T, eq: (a: T, b: T) => boolean): { ok: true } | { ok: false; conflict: [T, T] } {
    const r = this.find(id);
    if (r.tag === 'value') {
      if (eq(r.value, value)) return { ok: true };
      return { ok: false, conflict: [r.value, value] };
    }
    this.parent.set(r.id, { tag: 'value', value });
    return { ok: true };
  }

  union(a: UFNodeId, b: UFNodeId, eq: (a: T, b: T) => boolean): { ok: true } | { ok: false; conflict: [T, T] } {
    const ra = this.find(a);
    const rb = this.find(b);

    if (ra.tag === 'value' && rb.tag === 'value') {
      if (eq(ra.value, rb.value)) return { ok: true };
      return { ok: false, conflict: [ra.value, rb.value] };
    }

    if (ra.tag === 'value' && rb.tag === 'parent') {
      this.parent.set(rb.id, ra);
      return { ok: true };
    }
    if (rb.tag === 'value' && ra.tag === 'parent') {
      this.parent.set(ra.id, rb);
      return { ok: true };
    }

    if (ra.tag === 'parent' && rb.tag === 'parent') {
      if (ra.id !== rb.id) this.parent.set(ra.id, { tag: 'parent', id: rb.id });
      return { ok: true };
    }

    return { ok: true };
  }

  resolved(id: UFNodeId): T | null {
    const r = this.find(id);
    return r.tag === 'value' ? r.value : null;
  }
}

// =============================================================================
// Equality
// =============================================================================

function payloadsEqual(a: PayloadType, b: PayloadType): boolean {
  return a.kind === b.kind;
}

function unitsEqual(a: UnitType, b: UnitType): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// =============================================================================
// Result
// =============================================================================

export interface PayloadUnitSolveError {
  readonly kind: 'ConflictingPayloads' | 'ConflictingUnits';
  readonly port: DraftPortKey;
  readonly message: string;
}

export interface PayloadUnitSolveResult {
  /** Resolved payloads per var id */
  readonly payloads: ReadonlyMap<string, PayloadType>;
  /** Resolved units per var id */
  readonly units: ReadonlyMap<string, UnitType>;
  /** Resolved payloads per port key (for ports with concrete or resolved types) */
  readonly portPayloads: ReadonlyMap<DraftPortKey, PayloadType>;
  /** Resolved units per port key */
  readonly portUnits: ReadonlyMap<DraftPortKey, UnitType>;
  /** Solver errors */
  readonly errors: readonly PayloadUnitSolveError[];
}

// =============================================================================
// Node ID constructors
// =============================================================================

// Each port gets a UF node. Ports sharing a var within a block share a node.
function payloadNodeForPort(portKey: DraftPortKey): UFNodeId {
  return ufNodeId(`payload:port:${portKey}`);
}

function unitNodeForPort(portKey: DraftPortKey): UFNodeId {
  return ufNodeId(`unit:port:${portKey}`);
}

function payloadNodeForVar(portKey: DraftPortKey, varId: string): UFNodeId {
  // Extract blockId from portKey (format: blockId:portName:dir)
  const blockId = portKey.split(':').slice(0, -2).join(':');
  return ufNodeId(`payload:var:${blockId}:${varId}`);
}

function unitNodeForVar(portKey: DraftPortKey, varId: string): UFNodeId {
  const blockId = portKey.split(':').slice(0, -2).join(':');
  return ufNodeId(`unit:var:${blockId}:${varId}`);
}

// =============================================================================
// Solver
// =============================================================================

/**
 * Solve payload/unit constraints using union-find.
 *
 * Returns resolved maps suitable for building a Substitution.
 */
export function solvePayloadUnit(
  constraints: readonly PayloadUnitConstraint[],
  portVarMapping: ReadonlyMap<DraftPortKey, { payloadVarId: string | null; unitVarId: string | null }>,
): PayloadUnitSolveResult {
  const payloadUF = new UnionFind<PayloadType>();
  const unitUF = new UnionFind<UnitType>();
  const errors: PayloadUnitSolveError[] = [];

  // Ensure all port nodes exist
  for (const [portKey, varInfo] of portVarMapping) {
    const pNode = varInfo.payloadVarId
      ? payloadNodeForVar(portKey, varInfo.payloadVarId)
      : payloadNodeForPort(portKey);
    const uNode = varInfo.unitVarId
      ? unitNodeForVar(portKey, varInfo.unitVarId)
      : unitNodeForPort(portKey);
    payloadUF.ensure(pNode);
    unitUF.ensure(uNode);
  }

  // Process constraints
  for (const constraint of constraints) {
    switch (constraint.kind) {
      case 'concrete': {
        const varInfo = portVarMapping.get(constraint.port);
        if (!varInfo) break;

        if (constraint.axis === 'payload') {
          const node = varInfo.payloadVarId
            ? payloadNodeForVar(constraint.port, varInfo.payloadVarId)
            : payloadNodeForPort(constraint.port);
          const res = payloadUF.assign(node, constraint.value, payloadsEqual);
          if (!res.ok) {
            errors.push({
              kind: 'ConflictingPayloads',
              port: constraint.port,
              message: `Conflicting payloads: ${res.conflict[0].kind} vs ${res.conflict[1].kind}`,
            });
          }
        } else {
          const node = varInfo.unitVarId
            ? unitNodeForVar(constraint.port, varInfo.unitVarId)
            : unitNodeForPort(constraint.port);
          const res = unitUF.assign(node, constraint.value, unitsEqual);
          if (!res.ok) {
            errors.push({
              kind: 'ConflictingUnits',
              port: constraint.port,
              message: `Conflicting units: ${JSON.stringify(res.conflict[0])} vs ${JSON.stringify(res.conflict[1])}`,
            });
          }
        }
        break;
      }

      case 'sameVar': {
        // Union all ports that share the same var
        const ports = constraint.ports;
        if (ports.length < 2) break;

        for (let i = 1; i < ports.length; i++) {
          const varInfoA = portVarMapping.get(ports[0]);
          const varInfoB = portVarMapping.get(ports[i]);
          if (!varInfoA || !varInfoB) continue;

          if (constraint.axis === 'payload') {
            const nodeA = varInfoA.payloadVarId
              ? payloadNodeForVar(ports[0], varInfoA.payloadVarId)
              : payloadNodeForPort(ports[0]);
            const nodeB = varInfoB.payloadVarId
              ? payloadNodeForVar(ports[i], varInfoB.payloadVarId)
              : payloadNodeForPort(ports[i]);
            const res = payloadUF.union(nodeA, nodeB, payloadsEqual);
            if (!res.ok) {
              errors.push({
                kind: 'ConflictingPayloads',
                port: ports[i],
                message: `Conflicting payloads in same-var group: ${res.conflict[0].kind} vs ${res.conflict[1].kind}`,
              });
            }
          } else {
            const nodeA = varInfoA.unitVarId
              ? unitNodeForVar(ports[0], varInfoA.unitVarId)
              : unitNodeForPort(ports[0]);
            const nodeB = varInfoB.unitVarId
              ? unitNodeForVar(ports[i], varInfoB.unitVarId)
              : unitNodeForPort(ports[i]);
            const res = unitUF.union(nodeA, nodeB, unitsEqual);
            if (!res.ok) {
              errors.push({
                kind: 'ConflictingUnits',
                port: ports[i],
                message: `Conflicting units in same-var group: ${JSON.stringify(res.conflict[0])} vs ${JSON.stringify(res.conflict[1])}`,
              });
            }
          }
        }
        break;
      }

      case 'edge': {
        const varInfoFrom = portVarMapping.get(constraint.from);
        const varInfoTo = portVarMapping.get(constraint.to);
        if (!varInfoFrom || !varInfoTo) break;

        // Union payload
        {
          const fromNode = varInfoFrom.payloadVarId
            ? payloadNodeForVar(constraint.from, varInfoFrom.payloadVarId)
            : payloadNodeForPort(constraint.from);
          const toNode = varInfoTo.payloadVarId
            ? payloadNodeForVar(constraint.to, varInfoTo.payloadVarId)
            : payloadNodeForPort(constraint.to);
          const res = payloadUF.union(fromNode, toNode, payloadsEqual);
          if (!res.ok) {
            errors.push({
              kind: 'ConflictingPayloads',
              port: constraint.to,
              message: `Conflicting payloads across edge: ${res.conflict[0].kind} vs ${res.conflict[1].kind}`,
            });
          }
        }

        // Union unit
        {
          const fromNode = varInfoFrom.unitVarId
            ? unitNodeForVar(constraint.from, varInfoFrom.unitVarId)
            : unitNodeForPort(constraint.from);
          const toNode = varInfoTo.unitVarId
            ? unitNodeForVar(constraint.to, varInfoTo.unitVarId)
            : unitNodeForPort(constraint.to);
          const res = unitUF.union(fromNode, toNode, unitsEqual);
          if (!res.ok) {
            errors.push({
              kind: 'ConflictingUnits',
              port: constraint.to,
              message: `Conflicting units across edge: ${JSON.stringify(res.conflict[0])} vs ${JSON.stringify(res.conflict[1])}`,
            });
          }
        }
        break;
      }
    }
  }

  // Read results
  const payloads = new Map<string, PayloadType>();
  const units = new Map<string, UnitType>();
  const portPayloads = new Map<DraftPortKey, PayloadType>();
  const portUnits = new Map<DraftPortKey, UnitType>();

  for (const [portKey, varInfo] of portVarMapping) {
    // Payload
    const pNode = varInfo.payloadVarId
      ? payloadNodeForVar(portKey, varInfo.payloadVarId)
      : payloadNodeForPort(portKey);
    const resolvedPayload = payloadUF.resolved(pNode);
    if (resolvedPayload) {
      portPayloads.set(portKey, resolvedPayload);
      if (varInfo.payloadVarId) {
        payloads.set(varInfo.payloadVarId, resolvedPayload);
      }
    }

    // Unit
    const uNode = varInfo.unitVarId
      ? unitNodeForVar(portKey, varInfo.unitVarId)
      : unitNodeForPort(portKey);
    const resolvedUnit = unitUF.resolved(uNode);
    if (resolvedUnit) {
      portUnits.set(portKey, resolvedUnit);
      if (varInfo.unitVarId) {
        units.set(varInfo.unitVarId, resolvedUnit);
      }
    }
  }

  return { payloads, units, portPayloads, portUnits, errors };
}

/**
 * Build the port-to-var-id mapping from portBaseTypes.
 *
 * This is a helper that extracts which ports have payload/unit vars vs concrete.
 */
export function buildPortVarMapping(
  portBaseTypes: ReadonlyMap<DraftPortKey, import('../../core/inference-types').InferenceCanonicalType>,
): Map<DraftPortKey, { payloadVarId: string | null; unitVarId: string | null }> {
  const mapping = new Map<DraftPortKey, { payloadVarId: string | null; unitVarId: string | null }>();

  for (const [key, type] of portBaseTypes) {
    const payloadVarId = type.payload.kind === 'var' ? (type.payload as { kind: 'var'; id: string }).id : null;
    const unitVarId = type.unit.kind === 'var' ? (type.unit as { kind: 'var'; id: string }).id : null;
    mapping.set(key, { payloadVarId, unitVarId });
  }

  return mapping;
}
