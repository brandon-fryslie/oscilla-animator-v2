/**
 * Payload/Unit Constraint Solver for DraftGraph
 *
 * Union-find solver that resolves payload and unit variables to concrete types,
 * with support for allowed-set constraints (from BlockPayloadMetadata),
 * unitless requirements (for trig/mul/div ops), and error classification.
 *
 * Follows the cardinality solver pattern: self-contained module with types + solver.
 *
 * // [LAW:one-source-of-truth] Substitution is the only output; no side-channel mutations.
 * // [LAW:single-enforcer] This is the single place that resolves payload/unit vars.
 * // [LAW:dataflow-not-control-flow] All phases execute unconditionally; emptiness is data.
 */

import type { PayloadType, UnitType } from '../../../core/canonical-types';
import { payloadsEqual, unitsEqual, unitNone } from '../../../core/canonical-types';
import type { InferenceCanonicalType } from '../../../core/inference-types';
import { isPayloadVar, isUnitVar, isConcretePayload, isConcreteUnit } from '../../../core/inference-types';
import type { DraftPortKey } from '../type-facts';

// =============================================================================
// Constraint Origin
// =============================================================================

export type ConstraintOrigin =
  | { readonly kind: 'edge'; readonly edgeId: string }
  | { readonly kind: 'blockRule'; readonly blockId: string; readonly blockType: string; readonly rule: string }
  | { readonly kind: 'portDef'; readonly blockType: string; readonly port: string; readonly dir: 'in' | 'out' }
  | { readonly kind: 'payloadMetadata'; readonly blockType: string; readonly port: string };

// =============================================================================
// Constraint Types
// =============================================================================

export interface PayloadEqConstraint {
  readonly kind: 'payloadEq';
  readonly a: DraftPortKey;
  readonly b: DraftPortKey;
  readonly origin: ConstraintOrigin;
}

export interface UnitEqConstraint {
  readonly kind: 'unitEq';
  readonly a: DraftPortKey;
  readonly b: DraftPortKey;
  readonly origin: ConstraintOrigin;
}

export interface RequirePayloadInConstraint {
  readonly kind: 'requirePayloadIn';
  readonly port: DraftPortKey;
  readonly allowed: readonly PayloadType[];
  readonly origin: ConstraintOrigin;
}

export interface RequireUnitlessConstraint {
  readonly kind: 'requireUnitless';
  readonly port: DraftPortKey;
  readonly origin: ConstraintOrigin;
}

export interface ConcretePayloadConstraint {
  readonly kind: 'concretePayload';
  readonly port: DraftPortKey;
  readonly value: PayloadType;
  readonly origin: ConstraintOrigin;
}

export interface ConcreteUnitConstraint {
  readonly kind: 'concreteUnit';
  readonly port: DraftPortKey;
  readonly value: UnitType;
  readonly origin: ConstraintOrigin;
}

export type PayloadUnitConstraint =
  | PayloadEqConstraint
  | UnitEqConstraint
  | RequirePayloadInConstraint
  | RequireUnitlessConstraint
  | ConcretePayloadConstraint
  | ConcreteUnitConstraint;

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

  /** Get the root node id for a given node (needed for metadata tracking). */
  findRoot(id: UFNodeId): UFNodeId {
    this.ensure(id);
    const p = this.parent.get(id)!;
    if (p.tag === 'value') return id;
    if (p.id === id) return id;
    const root = this.find(p.id);
    if (root.tag === 'parent') return root.id;
    // Value node — find which node holds the value
    return this.findRoot(p.id);
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

  union(a: UFNodeId, b: UFNodeId, eq: (a: T, b: T) => boolean): { ok: true; winner: UFNodeId } | { ok: false; conflict: [T, T] } {
    const ra = this.find(a);
    const rb = this.find(b);

    if (ra.tag === 'value' && rb.tag === 'value') {
      if (eq(ra.value, rb.value)) return { ok: true, winner: this.findRoot(a) };
      return { ok: false, conflict: [ra.value, rb.value] };
    }

    if (ra.tag === 'value' && rb.tag === 'parent') {
      this.parent.set(rb.id, ra);
      return { ok: true, winner: this.findRoot(a) };
    }
    if (rb.tag === 'value' && ra.tag === 'parent') {
      this.parent.set(ra.id, rb);
      return { ok: true, winner: this.findRoot(b) };
    }

    if (ra.tag === 'parent' && rb.tag === 'parent') {
      if (ra.id !== rb.id) this.parent.set(ra.id, { tag: 'parent', id: rb.id });
      return { ok: true, winner: rb.id };
    }

    return { ok: true, winner: this.findRoot(a) };
  }

  resolved(id: UFNodeId): T | null {
    const r = this.find(id);
    return r.tag === 'value' ? r.value : null;
  }
}

// =============================================================================
// Per-Group Metadata
// =============================================================================

interface PayloadGroupMeta {
  /** Intersection of allowed payload sets from RequirePayloadIn constraints. null = unconstrained. */
  allowedPayloads: PayloadType[] | null;
  /** Origins that contributed to the allowed set (for error classification). */
  allowedOrigins: ConstraintOrigin[];
}

interface UnitGroupMeta {
  /** Whether this group must be unitless (from RequireUnitless constraints). */
  mustBeUnitless: boolean;
  /** Origins that contributed to the unitless requirement. */
  unitlessOrigins: ConstraintOrigin[];
}

// =============================================================================
// Error Classification
// =============================================================================

export type PUSolveErrorClass =
  | 'UserPatchTypeError'
  | 'BlockDefTooSpecific'
  | 'Unresolved';

export interface PUSolveError {
  readonly kind: 'ConflictingPayloads' | 'ConflictingUnits' | 'PayloadNotInAllowedSet' | 'UnitlessMismatch' | 'EmptyAllowedSet' | 'UnresolvedPayload' | 'UnresolvedUnit';
  readonly errorClass: PUSolveErrorClass;
  readonly port: DraftPortKey;
  readonly message: string;
  readonly origins: readonly ConstraintOrigin[];
}

// =============================================================================
// Result
// =============================================================================

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
  readonly errors: readonly PUSolveError[];
}

// =============================================================================
// Node ID constructors
// =============================================================================

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
// Helpers
// =============================================================================

function getPayloadNode(portKey: DraftPortKey, varInfo: { payloadVarId: string | null }): UFNodeId {
  return varInfo.payloadVarId
    ? payloadNodeForVar(portKey, varInfo.payloadVarId)
    : payloadNodeForPort(portKey);
}

function getUnitNode(portKey: DraftPortKey, varInfo: { unitVarId: string | null }): UFNodeId {
  return varInfo.unitVarId
    ? unitNodeForVar(portKey, varInfo.unitVarId)
    : unitNodeForPort(portKey);
}

/** Intersect two payload allowed sets. */
function intersectAllowed(a: readonly PayloadType[], b: readonly PayloadType[]): PayloadType[] {
  return a.filter(pa => b.some(pb => payloadsEqual(pa, pb)));
}

/**
 * Classify an error based on its origins.
 * - If any origin is 'edge' → UserPatchTypeError (user wired wrong types)
 * - If any origin is 'payloadMetadata' → BlockDefTooSpecific (metadata declares
 *   polymorphism but concrete value doesn't fit the allowed set)
 * - Otherwise → Unresolved
 */
function classifyError(origins: readonly ConstraintOrigin[]): PUSolveErrorClass {
  const hasEdge = origins.some(o => o.kind === 'edge');
  if (hasEdge) return 'UserPatchTypeError';

  const hasMetadata = origins.some(o => o.kind === 'payloadMetadata');
  if (hasMetadata) return 'BlockDefTooSpecific';

  return 'Unresolved';
}

// =============================================================================
// Solver
// =============================================================================

/**
 * Solve payload/unit constraints using union-find with per-group metadata.
 *
 * Returns resolved maps suitable for building a Substitution.
 *
 * Algorithm:
 * 1. Create UF nodes for each port's payload and unit
 * 2. Process equality constraints (PayloadEq, UnitEq): union nodes
 * 3. Process concrete constraints: assign inst to node
 * 4. Process RequirePayloadIn: intersect allowed sets per group
 * 5. Process RequireUnitless: mark groups as must-be-unitless
 * 6. Finalize: resolve vars, validate allowed sets, check unitless
 */
export function solvePayloadUnit(
  constraints: readonly PayloadUnitConstraint[],
  portVarMapping: ReadonlyMap<DraftPortKey, { payloadVarId: string | null; unitVarId: string | null }>,
): PayloadUnitSolveResult {
  const payloadUF = new UnionFind<PayloadType>();
  const unitUF = new UnionFind<UnitType>();
  const errors: PUSolveError[] = [];

  // Per-group metadata tracked by root node id
  const payloadMeta = new Map<UFNodeId, PayloadGroupMeta>();
  const unitMeta = new Map<UFNodeId, UnitGroupMeta>();

  // Helper to get or create payload group meta
  function getPayloadMeta(nodeId: UFNodeId): PayloadGroupMeta {
    const root = payloadUF.findRoot(nodeId);
    let meta = payloadMeta.get(root);
    if (!meta) {
      meta = { allowedPayloads: null, allowedOrigins: [] };
      payloadMeta.set(root, meta);
    }
    return meta;
  }

  // Helper to get or create unit group meta
  function getUnitMeta(nodeId: UFNodeId): UnitGroupMeta {
    const root = unitUF.findRoot(nodeId);
    let meta = unitMeta.get(root);
    if (!meta) {
      meta = { mustBeUnitless: false, unitlessOrigins: [] };
      unitMeta.set(root, meta);
    }
    return meta;
  }

  // Helper to merge payload meta when two groups are unified
  function mergePayloadMeta(winner: UFNodeId, loserMeta: PayloadGroupMeta | undefined): void {
    if (!loserMeta) return;
    const winnerMeta = getPayloadMeta(winner);
    if (loserMeta.allowedPayloads !== null) {
      if (winnerMeta.allowedPayloads === null) {
        winnerMeta.allowedPayloads = [...loserMeta.allowedPayloads];
      } else {
        winnerMeta.allowedPayloads = intersectAllowed(winnerMeta.allowedPayloads, loserMeta.allowedPayloads);
      }
      winnerMeta.allowedOrigins.push(...loserMeta.allowedOrigins);
    }
  }

  // Helper to merge unit meta when two groups are unified
  function mergeUnitMeta(winner: UFNodeId, loserMeta: UnitGroupMeta | undefined): void {
    if (!loserMeta) return;
    const winnerMeta = getUnitMeta(winner);
    if (loserMeta.mustBeUnitless) {
      winnerMeta.mustBeUnitless = true;
      winnerMeta.unitlessOrigins.push(...loserMeta.unitlessOrigins);
    }
  }

  // Ensure all port nodes exist
  for (const [portKey, varInfo] of portVarMapping) {
    const pNode = getPayloadNode(portKey, varInfo);
    const uNode = getUnitNode(portKey, varInfo);
    payloadUF.ensure(pNode);
    unitUF.ensure(uNode);
  }

  // ---- Phase 1: Process constraints ----

  for (const constraint of constraints) {
    switch (constraint.kind) {
      case 'concretePayload': {
        const varInfo = portVarMapping.get(constraint.port);
        if (!varInfo) break;
        const node = getPayloadNode(constraint.port, varInfo);
        const res = payloadUF.assign(node, constraint.value, payloadsEqual);
        if (!res.ok) {
          errors.push({
            kind: 'ConflictingPayloads',
            errorClass: classifyError([constraint.origin]),
            port: constraint.port,
            message: `Conflicting payloads: ${res.conflict[0].kind} vs ${res.conflict[1].kind}`,
            origins: [constraint.origin],
          });
        }
        break;
      }

      case 'concreteUnit': {
        const varInfo = portVarMapping.get(constraint.port);
        if (!varInfo) break;
        const node = getUnitNode(constraint.port, varInfo);
        const res = unitUF.assign(node, constraint.value, unitsEqual);
        if (!res.ok) {
          errors.push({
            kind: 'ConflictingUnits',
            errorClass: classifyError([constraint.origin]),
            port: constraint.port,
            message: `Conflicting units: ${res.conflict[0].kind} vs ${res.conflict[1].kind}`,
            origins: [constraint.origin],
          });
        }
        break;
      }

      case 'payloadEq': {
        const varInfoA = portVarMapping.get(constraint.a);
        const varInfoB = portVarMapping.get(constraint.b);
        if (!varInfoA || !varInfoB) break;
        const nodeA = getPayloadNode(constraint.a, varInfoA);
        const nodeB = getPayloadNode(constraint.b, varInfoB);

        // Save loser meta before union
        const rootA = payloadUF.findRoot(nodeA);
        const rootB = payloadUF.findRoot(nodeB);
        const metaA = payloadMeta.get(rootA);
        const metaB = payloadMeta.get(rootB);

        const res = payloadUF.union(nodeA, nodeB, payloadsEqual);
        if (!res.ok) {
          errors.push({
            kind: 'ConflictingPayloads',
            errorClass: classifyError([constraint.origin]),
            port: constraint.b,
            message: `Conflicting payloads: ${res.conflict[0].kind} vs ${res.conflict[1].kind}`,
            origins: [constraint.origin],
          });
        } else {
          // Merge metadata to winner
          const winner = res.winner;
          if (winner !== rootA && metaA) { payloadMeta.delete(rootA); mergePayloadMeta(winner, metaA); }
          if (winner !== rootB && metaB) { payloadMeta.delete(rootB); mergePayloadMeta(winner, metaB); }
        }
        break;
      }

      case 'unitEq': {
        const varInfoA = portVarMapping.get(constraint.a);
        const varInfoB = portVarMapping.get(constraint.b);
        if (!varInfoA || !varInfoB) break;
        const nodeA = getUnitNode(constraint.a, varInfoA);
        const nodeB = getUnitNode(constraint.b, varInfoB);

        // Save loser meta before union
        const rootA = unitUF.findRoot(nodeA);
        const rootB = unitUF.findRoot(nodeB);
        const metaA = unitMeta.get(rootA);
        const metaB = unitMeta.get(rootB);

        const res = unitUF.union(nodeA, nodeB, unitsEqual);
        if (!res.ok) {
          errors.push({
            kind: 'ConflictingUnits',
            errorClass: classifyError([constraint.origin]),
            port: constraint.b,
            message: `Conflicting units: ${res.conflict[0].kind} vs ${res.conflict[1].kind}`,
            origins: [constraint.origin],
          });
        } else {
          // Merge metadata to winner
          const winner = res.winner;
          if (winner !== rootA && metaA) { unitMeta.delete(rootA); mergeUnitMeta(winner, metaA); }
          if (winner !== rootB && metaB) { unitMeta.delete(rootB); mergeUnitMeta(winner, metaB); }
        }
        break;
      }

      case 'requirePayloadIn': {
        const varInfo = portVarMapping.get(constraint.port);
        if (!varInfo) break;
        const node = getPayloadNode(constraint.port, varInfo);
        const meta = getPayloadMeta(node);

        if (meta.allowedPayloads === null) {
          meta.allowedPayloads = [...constraint.allowed];
        } else {
          meta.allowedPayloads = intersectAllowed(meta.allowedPayloads, constraint.allowed);
        }
        meta.allowedOrigins.push(constraint.origin);
        break;
      }

      case 'requireUnitless': {
        const varInfo = portVarMapping.get(constraint.port);
        if (!varInfo) break;
        const node = getUnitNode(constraint.port, varInfo);
        const meta = getUnitMeta(node);
        meta.mustBeUnitless = true;
        meta.unitlessOrigins.push(constraint.origin);
        break;
      }
    }
  }

  // ---- Phase 2: Finalization + Validation ----

  const payloads = new Map<string, PayloadType>();
  const units = new Map<string, UnitType>();
  const portPayloads = new Map<DraftPortKey, PayloadType>();
  const portUnits = new Map<DraftPortKey, UnitType>();

  // Track which roots we've already validated to avoid duplicate errors
  const validatedPayloadRoots = new Set<UFNodeId>();
  const validatedUnitRoots = new Set<UFNodeId>();

  for (const [portKey, varInfo] of portVarMapping) {
    // ---- Payload ----
    const pNode = getPayloadNode(portKey, varInfo);
    const pRoot = payloadUF.findRoot(pNode);
    let resolvedPayload = payloadUF.resolved(pNode);

    // If unresolved, try to derive from allowed set
    if (!resolvedPayload) {
      const meta = payloadMeta.get(pRoot);
      if (meta?.allowedPayloads !== null && meta?.allowedPayloads !== undefined) {
        if (meta.allowedPayloads.length === 1) {
          // Single allowed payload — resolve to that
          resolvedPayload = meta.allowedPayloads[0];
          payloadUF.assign(pNode, resolvedPayload, payloadsEqual);
        } else if (meta.allowedPayloads.length > 1) {
          // Multiple allowed payloads, no concrete evidence — default to first.
          // [LAW:dataflow-not-control-flow] Polymorphic chains with no concrete
          // evidence resolve to the first allowed payload (float for most blocks).
          resolvedPayload = meta.allowedPayloads[0];
          payloadUF.assign(pNode, resolvedPayload, payloadsEqual);
        } else if (meta.allowedPayloads.length === 0 && !validatedPayloadRoots.has(pRoot)) {
          validatedPayloadRoots.add(pRoot);
          errors.push({
            kind: 'EmptyAllowedSet',
            errorClass: classifyError(meta.allowedOrigins),
            port: portKey,
            message: `No common payload type across constraints`,
            origins: meta.allowedOrigins,
          });
        }
      }
    }

    // If still unresolved (no allowed set at all), default to float for payload vars.
    // A chain of polymorphic blocks with no metadata constraints is assumed float.
    if (!resolvedPayload && varInfo.payloadVarId) {
      resolvedPayload = { kind: 'float' } as PayloadType;
      payloadUF.assign(pNode, resolvedPayload, payloadsEqual);
    }

    // Validate resolved payload against allowed set
    if (resolvedPayload && !validatedPayloadRoots.has(pRoot)) {
      validatedPayloadRoots.add(pRoot);
      const meta = payloadMeta.get(pRoot);
      if (meta?.allowedPayloads !== null && meta?.allowedPayloads !== undefined && meta.allowedPayloads.length > 0) {
        if (!meta.allowedPayloads.some(a => payloadsEqual(a, resolvedPayload!))) {
          errors.push({
            kind: 'PayloadNotInAllowedSet',
            errorClass: classifyError(meta.allowedOrigins),
            port: portKey,
            message: `Payload ${resolvedPayload.kind} not in allowed set [${meta.allowedPayloads.map(p => p.kind).join(', ')}]`,
            origins: meta.allowedOrigins,
          });
        }
      }
    }

    if (resolvedPayload) {
      portPayloads.set(portKey, resolvedPayload);
      if (varInfo.payloadVarId) {
        payloads.set(varInfo.payloadVarId, resolvedPayload);
      }
    }

    // ---- Unit ----
    const uNode = getUnitNode(portKey, varInfo);
    const uRoot = unitUF.findRoot(uNode);
    let resolvedUnit = unitUF.resolved(uNode);

    // If unresolved and mustBeUnitless, resolve to none
    if (!resolvedUnit) {
      const meta = unitMeta.get(uRoot);
      if (meta?.mustBeUnitless) {
        resolvedUnit = unitNone();
        unitUF.assign(uNode, resolvedUnit, unitsEqual);
      }
    }

    // If still unresolved (no concrete evidence at all), default to unitNone().
    // A chain of polymorphic blocks with no concrete unit source is dimensionless.
    if (!resolvedUnit && varInfo.unitVarId) {
      resolvedUnit = unitNone();
      unitUF.assign(uNode, resolvedUnit, unitsEqual);
    }

    // Validate resolved unit against unitless requirement
    if (resolvedUnit && !validatedUnitRoots.has(uRoot)) {
      validatedUnitRoots.add(uRoot);
      const meta = unitMeta.get(uRoot);
      if (meta?.mustBeUnitless && resolvedUnit.kind !== 'none') {
        errors.push({
          kind: 'UnitlessMismatch',
          errorClass: classifyError(meta.unitlessOrigins),
          port: portKey,
          message: `Port requires unitless but has unit: ${resolvedUnit.kind}`,
          origins: meta.unitlessOrigins,
        });
      }
    }

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
  portBaseTypes: ReadonlyMap<DraftPortKey, InferenceCanonicalType>,
): Map<DraftPortKey, { payloadVarId: string | null; unitVarId: string | null }> {
  const mapping = new Map<DraftPortKey, { payloadVarId: string | null; unitVarId: string | null }>();

  for (const [key, type] of portBaseTypes) {
    const payloadVarId = isPayloadVar(type.payload) ? (type.payload as { kind: 'var'; id: string }).id : null;
    const unitVarId = isUnitVar(type.unit) ? (type.unit as { kind: 'var'; id: string }).id : null;
    mapping.set(key, { payloadVarId, unitVarId });
  }

  return mapping;
}
