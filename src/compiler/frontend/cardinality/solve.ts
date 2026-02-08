/**
 * Cardinality Constraint Solver
 *
 * Pure, substitution-based solver that resolves cardinality variables to
 * concrete CardinalityValue and instance variables to concrete InstanceRef.
 *
 * 5-phase algorithm:
 *   1. Build equality UF from equal(a,b) constraints
 *   2. Collect group facts: forcedOne (from clampOne), forcedMany (from forceMany/base axis)
 *   3. Local group resolution: detect conflicts, resolve to one/many/unknown
 *   4. ZipBroadcast fixpoint: propagate many across zip groups
 *   5. Finalize: build substitution maps, report unresolved vars
 *
 * // [LAW:one-source-of-truth] Substitution maps are the only output.
 * // [LAW:single-enforcer] This is the single place that resolves cardinality vars.
 * // [LAW:dataflow-not-control-flow] All 5 phases execute unconditionally; emptiness is data.
 */

import type { CardinalityValue, InstanceRef } from '../../../core/canonical-types';
import { isAxisVar, isAxisInst, type Axis } from '../../../core/canonical-types';
import type { CardinalityVarId } from '../../../core/ids';
import type { InstanceVarId } from '../../../core/ids';
import type { DraftPortKey } from '../type-facts';
import type { ConstraintOrigin } from '../payload-unit/solve';

// =============================================================================
// InstanceTerm (solver-internal)
// =============================================================================

export type InstanceTerm =
  | { readonly kind: 'inst'; readonly ref: InstanceRef }
  | { readonly kind: 'var'; readonly id: InstanceVarId };

// =============================================================================
// Constraints
// =============================================================================

export type CardinalityConstraint =
  | { readonly kind: 'equal'; readonly a: DraftPortKey; readonly b: DraftPortKey; readonly origin: ConstraintOrigin }
  | { readonly kind: 'clampOne'; readonly port: DraftPortKey; readonly origin: ConstraintOrigin }
  | { readonly kind: 'forceMany'; readonly port: DraftPortKey; readonly instance: InstanceTerm; readonly origin: ConstraintOrigin }
  | { readonly kind: 'zipBroadcast'; readonly ports: readonly DraftPortKey[]; readonly origin: ConstraintOrigin };

// =============================================================================
// Input
// =============================================================================

export interface CardinalitySolveInput {
  readonly ports: readonly DraftPortKey[];
  readonly baseCardinalityAxis: ReadonlyMap<DraftPortKey, Axis<CardinalityValue, CardinalityVarId>>;
  readonly constraints: readonly CardinalityConstraint[];
  readonly trace?: boolean;
}

// =============================================================================
// Errors
// =============================================================================

export type CardinalitySolveError =
  | {
      readonly kind: 'ZipBroadcastClampOneConflict';
      readonly zipPorts: readonly DraftPortKey[];
      readonly clampOneMembers: readonly DraftPortKey[];
      readonly manyMembers: readonly DraftPortKey[];
      readonly zipOrigin: ConstraintOrigin;
      readonly clampOneOrigins: readonly ConstraintOrigin[];
      readonly manyEvidenceOrigins: readonly ConstraintOrigin[];
      readonly message: string;
    }
  | { readonly kind: 'ClampManyConflict'; readonly ports: readonly DraftPortKey[]; readonly message: string }
  | { readonly kind: 'InstanceConflict'; readonly ports: readonly DraftPortKey[]; readonly message: string }
  | { readonly kind: 'UnresolvedInstanceVar'; readonly ports: readonly DraftPortKey[]; readonly message: string };

// =============================================================================
// Output
// =============================================================================

export interface CardinalitySolveResult {
  readonly cardinalities: ReadonlyMap<CardinalityVarId, CardinalityValue>;
  readonly instances: ReadonlyMap<InstanceVarId, InstanceRef>;
  readonly errors: readonly CardinalitySolveError[];
}

// =============================================================================
// Internal Union-Find for Port Equality Groups
// =============================================================================

interface CardinalityUFNode {
  parent: DraftPortKey;
  rank: number;
}

interface GroupFacts {
  forcedOne: boolean;
  forcedManyTerms: InstanceTerm[];
  /** Resolved cardinality for this group (set in phase 3+) */
  resolved: CardinalityValue | null;
  clampOneOrigins: ConstraintOrigin[];
  forceManyOrigins: ConstraintOrigin[];
}

class CardinalityUF {
  private nodes = new Map<DraftPortKey, CardinalityUFNode>();
  private facts = new Map<DraftPortKey, GroupFacts>();

  ensure(id: DraftPortKey): void {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { parent: id, rank: 0 });
    }
  }

  find(id: DraftPortKey): DraftPortKey {
    this.ensure(id);
    const node = this.nodes.get(id)!;
    if (node.parent === id) return id;
    // Path compression
    const root = this.find(node.parent);
    node.parent = root;
    return root;
  }

  union(a: DraftPortKey, b: DraftPortKey): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;

    const na = this.nodes.get(ra)!;
    const nb = this.nodes.get(rb)!;

    // Union by rank; lexicographic tiebreak when ranks equal
    let winner: DraftPortKey;
    let loser: DraftPortKey;
    if (na.rank > nb.rank) {
      winner = ra; loser = rb;
    } else if (nb.rank > na.rank) {
      winner = rb; loser = ra;
    } else {
      // Equal rank — lower lexicographic wins
      if (ra < rb) {
        winner = ra; loser = rb;
      } else {
        winner = rb; loser = ra;
      }
      this.nodes.get(winner)!.rank++;
    }

    this.nodes.get(loser)!.parent = winner;

    // Merge facts
    const wf = this.getOrCreateFacts(winner);
    const lf = this.facts.get(loser);
    if (lf) {
      if (lf.forcedOne) wf.forcedOne = true;
      wf.forcedManyTerms.push(...lf.forcedManyTerms);
      wf.clampOneOrigins.push(...lf.clampOneOrigins);
      wf.forceManyOrigins.push(...lf.forceManyOrigins);
      this.facts.delete(loser);
    }
  }

  getOrCreateFacts(id: DraftPortKey): GroupFacts {
    const root = this.find(id);
    let f = this.facts.get(root);
    if (!f) {
      f = { forcedOne: false, forcedManyTerms: [], resolved: null, clampOneOrigins: [], forceManyOrigins: [] };
      this.facts.set(root, f);
    }
    return f;
  }

  getFacts(id: DraftPortKey): GroupFacts | undefined {
    return this.facts.get(this.find(id));
  }

  /** Get all unique group roots. */
  roots(): DraftPortKey[] {
    const rs = new Set<DraftPortKey>();
    for (const id of this.nodes.keys()) {
      rs.add(this.find(id));
    }
    return [...rs].sort();
  }

  /** Get all members of a group (sorted). */
  members(root: DraftPortKey): DraftPortKey[] {
    const result: DraftPortKey[] = [];
    for (const id of this.nodes.keys()) {
      if (this.find(id) === root) result.push(id);
    }
    return result.sort();
  }
}

// =============================================================================
// Internal Union-Find for Instance Terms
// =============================================================================

interface InstanceUFNode {
  parent: string;  // InstanceTerm serialized key
  rank: number;
}

class InstanceUF {
  private nodes = new Map<string, InstanceUFNode>();
  private values = new Map<string, InstanceTerm>();

  private key(t: InstanceTerm): string {
    return t.kind === 'inst'
      ? `inst:${t.ref.domainTypeId}:${t.ref.instanceId}`
      : `var:${t.id}`;
  }

  ensure(t: InstanceTerm): string {
    const k = this.key(t);
    if (!this.nodes.has(k)) {
      this.nodes.set(k, { parent: k, rank: 0 });
      this.values.set(k, t);
    }
    return k;
  }

  find(k: string): string {
    const node = this.nodes.get(k)!;
    if (node.parent === k) return k;
    const root = this.find(node.parent);
    node.parent = root;
    return root;
  }

  /**
   * Unify two instance terms.
   * Returns an error message if two different concrete instances conflict.
   */
  unify(a: InstanceTerm, b: InstanceTerm): string | null {
    const ka = this.ensure(a);
    const kb = this.ensure(b);
    const ra = this.find(ka);
    const rb = this.find(kb);
    if (ra === rb) return null;

    const va = this.values.get(ra)!;
    const vb = this.values.get(rb)!;

    // Two concrete instances that differ → conflict
    if (va.kind === 'inst' && vb.kind === 'inst') {
      if (va.ref.domainTypeId !== vb.ref.domainTypeId || va.ref.instanceId !== vb.ref.instanceId) {
        return `Instance conflict: ${va.ref.domainTypeId}:${va.ref.instanceId} vs ${vb.ref.domainTypeId}:${vb.ref.instanceId}`;
      }
    }

    const na = this.nodes.get(ra)!;
    const nb = this.nodes.get(rb)!;

    // Prefer concrete over var as winner
    let winner: string;
    let loser: string;
    if (va.kind === 'inst' && vb.kind === 'var') {
      winner = ra; loser = rb;
    } else if (vb.kind === 'inst' && va.kind === 'var') {
      winner = rb; loser = ra;
    } else if (na.rank > nb.rank) {
      winner = ra; loser = rb;
    } else if (nb.rank > na.rank) {
      winner = rb; loser = ra;
    } else {
      winner = ra < rb ? ra : rb;
      loser = ra < rb ? rb : ra;
      this.nodes.get(winner)!.rank++;
    }

    this.nodes.get(loser)!.parent = winner;
    return null;
  }

  /** Resolve an instance term to its canonical form. */
  resolve(t: InstanceTerm): InstanceTerm {
    const k = this.ensure(t);
    const root = this.find(k);
    return this.values.get(root)!;
  }

  /** Get all var→concrete mappings. */
  resolvedVars(): Map<InstanceVarId, InstanceRef> {
    const result = new Map<InstanceVarId, InstanceRef>();
    for (const [k, _node] of this.nodes) {
      const term = this.values.get(k)!;
      if (term.kind !== 'var') continue;
      const root = this.find(k);
      const resolved = this.values.get(root)!;
      if (resolved.kind === 'inst') {
        result.set(term.id, resolved.ref);
      }
    }
    return result;
  }
}

// =============================================================================
// Substitution Helper
// =============================================================================

/** Write substitutions for all ports with axisVar in a resolved group. */
function writeGroupSubstitutions(
  resolved: CardinalityValue,
  members: DraftPortKey[],
  baseCardinalityAxis: ReadonlyMap<DraftPortKey, Axis<CardinalityValue, CardinalityVarId>>,
  cardinalities: Map<CardinalityVarId, CardinalityValue>,
): void {
  for (const port of members) {
    const axis = baseCardinalityAxis.get(port);
    if (axis && isAxisVar(axis)) {
      cardinalities.set(axis.var, resolved);
    }
  }
}

// =============================================================================
// Solver Entry Point
// =============================================================================

/**
 * Solve cardinality constraints.
 *
 * Pure function: same input → same output.
 */
export function solveCardinality(input: CardinalitySolveInput): CardinalitySolveResult {
  const { ports, baseCardinalityAxis, constraints, trace } = input;
  const errors: CardinalitySolveError[] = [];
  const uf = new CardinalityUF();
  const instanceUF = new InstanceUF();

  // Initialize all ports in UF
  for (const p of ports) {
    uf.ensure(p);
  }

  // ---- Phase 1: Equality UF ----
  if (trace) console.log('[CardSolver] Phase 1: Equality UF');

  for (const c of constraints) {
    if (c.kind === 'equal') {
      uf.union(c.a, c.b);
    }
  }

  // ---- Phase 2: Collect group facts ----
  if (trace) console.log('[CardSolver] Phase 2: Collect group facts');

  // From constraints
  for (const c of constraints) {
    if (c.kind === 'clampOne') {
      const facts = uf.getOrCreateFacts(c.port);
      facts.forcedOne = true;
      facts.clampOneOrigins.push(c.origin);
    } else if (c.kind === 'forceMany') {
      const facts = uf.getOrCreateFacts(c.port);
      instanceUF.ensure(c.instance);
      facts.forcedManyTerms.push(c.instance);
      facts.forceManyOrigins.push(c.origin);
    }
  }

  // From base axis — only concrete many(ref) counts as forcedMany
  for (const [port, axis] of baseCardinalityAxis) {
    if (isAxisInst(axis) && axis.value.kind === 'many') {
      const facts = uf.getOrCreateFacts(port);
      const term: InstanceTerm = { kind: 'inst', ref: axis.value.instance };
      instanceUF.ensure(term);
      facts.forcedManyTerms.push(term);
    }
    // NOTE: bare axisInst(one) in base types does NOT set forcedOne.
    // forcedOne comes ONLY from clampOne constraints.
  }

  // ---- Phase 3: Local group resolution ----
  if (trace) console.log('[CardSolver] Phase 3: Local group resolution');

  for (const root of uf.roots()) {
    const facts = uf.getOrCreateFacts(root);
    const hasForcedMany = facts.forcedManyTerms.length > 0;

    if (facts.forcedOne && hasForcedMany) {
      // Conflict: clampOne AND forceMany in same group
      errors.push({
        kind: 'ClampManyConflict',
        ports: uf.members(root),
        message: `Cardinality conflict: ports constrained to both one and many`,
      });
      continue;
    }

    if (facts.forcedOne) {
      facts.resolved = { kind: 'one' };
      continue;
    }

    if (hasForcedMany) {
      // Unify all instance terms
      for (let i = 1; i < facts.forcedManyTerms.length; i++) {
        const err = instanceUF.unify(facts.forcedManyTerms[0], facts.forcedManyTerms[i]);
        if (err) {
          errors.push({
            kind: 'InstanceConflict',
            ports: uf.members(root),
            message: err,
          });
        }
      }
      const resolved = instanceUF.resolve(facts.forcedManyTerms[0]);
      if (resolved.kind === 'inst') {
        facts.resolved = { kind: 'many', instance: resolved.ref };
      } else {
        // many(var) — leave resolved as a sentinel; will check in phase 5
        facts.resolved = { kind: 'many', instance: { domainTypeId: '__var__' as any, instanceId: resolved.id as any } };
      }
      continue;
    }

    // No evidence → default to one (signal chain).
    // [LAW:dataflow-not-control-flow] Groups without many evidence are signal-only.
    facts.resolved = { kind: 'one' };
  }

  // ---- Phase 4: ZipBroadcast fixpoint ----
  if (trace) console.log('[CardSolver] Phase 4: ZipBroadcast fixpoint');

  // Collect zip sets from constraints (with origins for provenance)
  const zipSets: Array<{ ports: DraftPortKey[]; origin: ConstraintOrigin }> = [];
  for (const c of constraints) {
    if (c.kind === 'zipBroadcast') {
      // Sort and dedup
      const sorted = [...new Set(c.ports)].sort();
      if (sorted.length > 0) zipSets.push({ ports: sorted, origin: c.origin });
    }
  }

  // Fixpoint: propagate many across zip sets
  let changed = true;
  while (changed) {
    changed = false;

    for (const { ports: zipPorts, origin: zipOrigin } of zipSets) {
      // Find groups represented in this zip set
      const groupRoots = [...new Set(zipPorts.map(p => uf.find(p)))];

      // Find any group that is resolved to many
      let manyGroup: GroupFacts | null = null;
      let manyRoot: DraftPortKey | null = null;
      let hasConflict = false;

      for (const root of groupRoots) {
        const facts = uf.getFacts(root);
        if (!facts) continue;

        if (facts.resolved && facts.resolved.kind === 'many') {
          if (manyGroup && manyRoot !== root) {
            // Unify instance terms across groups
            if (manyGroup.forcedManyTerms.length > 0 && facts.forcedManyTerms.length > 0) {
              const err = instanceUF.unify(manyGroup.forcedManyTerms[0], facts.forcedManyTerms[0]);
              if (err) {
                errors.push({
                  kind: 'InstanceConflict',
                  ports: zipPorts,
                  message: err,
                });
                hasConflict = true;
              }
            }
          }
          manyGroup = facts;
          manyRoot = root;
        }
      }

      if (hasConflict || !manyGroup) continue;

      // Propagate many to all groups in this zip set.
      // zipBroadcast semantics: signal (one) ports coexist with field (many) ports.
      // clampOne groups stay at one — runtime broadcasts them via kernelZipSig.
      // This is NOT a conflict; it's the expected behavior for allowZipSig blocks.
      for (const root of groupRoots) {
        if (root === manyRoot) continue;
        const facts = uf.getOrCreateFacts(root);

        // clampOne groups stay at one — skip propagation, no conflict.
        // The runtime handles mixed cardinality via kernelZipSig.
        if (facts.forcedOne) continue;

        if (facts.resolved === null || facts.resolved?.kind === 'one') {
          // Propagate many
          if (manyGroup.forcedManyTerms.length > 0) {
            const resolvedTerm = instanceUF.resolve(manyGroup.forcedManyTerms[0]);
            if (resolvedTerm.kind === 'inst') {
              facts.resolved = { kind: 'many', instance: resolvedTerm.ref };
            } else {
              facts.resolved = { kind: 'many', instance: { domainTypeId: '__var__' as any, instanceId: resolvedTerm.id as any } };
            }
            // Also add forcedMany terms so further zips can unify
            facts.forcedManyTerms.push(manyGroup.forcedManyTerms[0]);
          }
          changed = true;
        }
      }
    }
  }

  // ---- Phase 5: Finalize ----
  if (trace) console.log('[CardSolver] Phase 5: Finalize');

  const cardinalities = new Map<CardinalityVarId, CardinalityValue>();
  const resolvedInstanceVars = instanceUF.resolvedVars();

  for (const root of uf.roots()) {
    const facts = uf.getFacts(root);
    const members = uf.members(root);

    if (!facts || facts.resolved === null) {
      // Conflict groups hit continue in Phase 3 before setting resolved.
      // Errors already emitted — skip substitution.
      continue;
    }

    // Check for unresolved instance vars in many(var) sentinel
    let finalResolved = facts.resolved;
    if (finalResolved.kind === 'many') {
      const inst = finalResolved.instance;
      if ((inst.domainTypeId as string) === '__var__') {
        // Check if instance var was resolved
        const varId = inst.instanceId as unknown as InstanceVarId;
        const resolvedRef = resolvedInstanceVars.get(varId);
        if (resolvedRef) {
          finalResolved = { kind: 'many', instance: resolvedRef };
          facts.resolved = finalResolved;
        } else {
          errors.push({
            kind: 'UnresolvedInstanceVar',
            ports: members,
            message: `Instance variable unresolved for group`,
          });
          continue;
        }
      }
    }

    // Write substitution: for each port with axisVar, map var → resolved value
    writeGroupSubstitutions(finalResolved, members, baseCardinalityAxis, cardinalities);
  }

  return {
    cardinalities,
    instances: resolvedInstanceVars,
    errors,
  };
}
