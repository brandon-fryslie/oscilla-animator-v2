/**
 * src/pillars/types/solve/cardinality.ts
 *
 * The cardinality sub-solver: resolves every port's lane count (one / many) and,
 * for many, its lane-set identity. A distinct domain from payload/unit with a
 * distinct mechanism, so a distinct solver. [LAW:decomposition]
 *
 * Two union-finds: `CardinalityUF` groups ports that must share a cardinality
 * (so a fact proven for one is proven for all), and `InstanceUF` unifies the
 * instance *terms* a `many` can carry — a concrete lane set or a variable
 * standing for one. Five phases turn a flat constraint set into resolved
 * cardinalities; a sixth concern, propagating `many` across zip sets, is a
 * bounded inner fixpoint inside phase 4 — it converges within this call, before
 * the outer graph fixpoint (wzm3.5) ever sees the result. [LAW:no-ambient-temporal-coupling]
 *
 * Pure: no input mutated, deterministic output. [LAW:effects-at-boundaries]
 *
 * Two deliberate departures from V1, both because the pillar schema is tighter:
 *   - No subdomain escape hatch in instance unification — the pillar has no
 *     subdomain relation, so two distinct concrete instances simply conflict.
 *   - A `many` whose instance is still a variable is its own `GroupResolution`
 *     state, not a concrete cardinality smuggling a `__var__` sentinel string.
 *     The intermediate is honestly typed; only phase 5 produces `ZCardinality`.
 *     [LAW:types-are-the-program]
 */

import { instanceRef } from '../schemas';
import type {
  CardinalityVarId,
  InstanceRef,
  ZCardinality,
  ZInferenceCardinality,
} from '../schemas';
import type { ConstraintOrigin, PortKey, SolveDiagnostic } from './shared';

/**
 * The lane-set identity a `many` aligns by: a concrete reference, or a variable
 * standing for one until evidence resolves it. The variable reuses
 * `CardinalityVarId` — the pillar mints no separate instance-variable space, so
 * a cardinality variable doubles as the identity of the lane set it resolves to.
 * Kept a solver-internal term (never a schema type) so this reuse stays local.
 */
export type InstanceTerm =
  | { readonly kind: 'inst'; readonly ref: InstanceRef }
  | { readonly kind: 'var'; readonly var: CardinalityVarId };

export type ZCardinalityConstraint =
  | { readonly kind: 'equal'; readonly a: PortKey; readonly b: PortKey; readonly origin: ConstraintOrigin }
  | { readonly kind: 'clampOne'; readonly port: PortKey; readonly origin: ConstraintOrigin }
  | { readonly kind: 'forceMany'; readonly port: PortKey; readonly instance: InstanceTerm; readonly origin: ConstraintOrigin }
  | { readonly kind: 'promoteToMany'; readonly ports: readonly PortKey[]; readonly origin: ConstraintOrigin };

export interface CardinalitySolveInput {
  /** Each port's declared base cardinality axis. A concrete `many` is many-evidence; a `var` is what phase 5 writes a substitution for. */
  readonly ports: ReadonlyMap<PortKey, ZInferenceCardinality>;
  readonly constraints: readonly ZCardinalityConstraint[];
  /**
   * Cardinality variables whose group may keep an unbound lane set rather than
   * failing when no concrete instance is found — the `inherit` binding policy,
   * supplied as data by the extraction layer (the schema carries no policy
   * field, so the solver receives it, never reads it off the type).
   */
  readonly inheritInstanceVars?: ReadonlySet<CardinalityVarId>;
}

/**
 * The deferred-binding sentinel: a `many` whose lane set is legitimately not yet
 * known (an `inherit`-binding group with no concrete evidence). A later backend
 * repass binds it; until then it is a concrete-but-sentinel `InstanceRef` so it
 * satisfies `ZCardinality` while remaining recognizable.
 */
export const UNBOUND_INSTANCE: InstanceRef = instanceRef('__unbound__');

export type CardinalitySolveError =
  | {
      readonly kind: 'ClampManyConflict';
      readonly ports: readonly PortKey[];
      readonly clampOneMembers: readonly PortKey[];
      readonly forceManyMembers: readonly PortKey[];
      readonly clampOneOrigins: readonly ConstraintOrigin[];
      readonly forceManyOrigins: readonly ConstraintOrigin[];
      readonly message: string;
    }
  | { readonly kind: 'InstanceConflict'; readonly ports: readonly PortKey[]; readonly origins: readonly ConstraintOrigin[]; readonly message: string }
  | { readonly kind: 'UnresolvedInstanceVar'; readonly ports: readonly PortKey[]; readonly origins: readonly ConstraintOrigin[]; readonly message: string };

/**
 * The structural / terminal split is how the solver tells the fixpoint driver
 * which conflicts an adapter can fix (structural → an obligation) versus which
 * are dead ends (terminal → a diagnostic). Defining it as one predicate keeps
 * the taxonomy in a single place rather than re-derived at every callsite.
 * [LAW:single-enforcer]
 *
 * Only `ClampManyConflict` is structural *and* emitted: a clampOne port caught
 * inside a promoteToMany zip is exempt by design (it stays `one`, the runtime
 * zip-promotes it), so the would-be `PromoteToManyClampOneConflict` is never
 * constructed — an unrepresentable state earns no error kind. [LAW:types-are-the-program]
 */
export const isStructuralCardinalityConflict = (e: CardinalitySolveError): boolean =>
  e.kind === 'ClampManyConflict';

export interface CardinalitySolveResult {
  readonly cardinalities: ReadonlyMap<CardinalityVarId, ZCardinality>;
  readonly errors: readonly CardinalitySolveError[];
  readonly diagnostics: readonly SolveDiagnostic[];
}

/** A group's resolution, with `many(var)` an explicit state rather than a sentinel concrete. */
type GroupResolution =
  | { readonly kind: 'one' }
  | { readonly kind: 'manyConcrete'; readonly instance: InstanceRef }
  | { readonly kind: 'manyVar'; readonly var: CardinalityVarId };

interface GroupFacts {
  forcedOne: boolean;
  forcedManyTerms: InstanceTerm[];
  resolved: GroupResolution | null;
  clampOneOrigins: ConstraintOrigin[];
  forceManyOrigins: ConstraintOrigin[];
}

const newGroupFacts = (): GroupFacts => ({
  forcedOne: false,
  forcedManyTerms: [],
  resolved: null,
  clampOneOrigins: [],
  forceManyOrigins: [],
});

// ---------------------------------------------------------------------------
// CardinalityUF — port equality groups, rank + lexicographic, facts on the root
// ---------------------------------------------------------------------------

class CardinalityUF {
  private readonly parent = new Map<PortKey, PortKey>();
  private readonly rank = new Map<PortKey, number>();
  private readonly facts = new Map<PortKey, GroupFacts>();

  ensure(id: PortKey): void {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
    }
  }

  find(id: PortKey): PortKey {
    this.ensure(id);
    let root = id;
    while (this.parent.get(root)! !== root) root = this.parent.get(root)!;
    let cur = id;
    while (this.parent.get(cur)! !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: PortKey, b: PortKey): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;
    // Rank-balanced, with a lexicographic tiebreak so equal-rank merges are deterministic.
    let winner: PortKey;
    let loser: PortKey;
    if (rankA > rankB) [winner, loser] = [ra, rb];
    else if (rankB > rankA) [winner, loser] = [rb, ra];
    else {
      [winner, loser] = ra < rb ? [ra, rb] : [rb, ra];
      this.rank.set(winner, rankA + 1);
    }
    this.parent.set(loser, winner);
    this.mergeFacts(winner, loser);
  }

  private mergeFacts(winner: PortKey, loser: PortKey): void {
    const loserFacts = this.facts.get(loser);
    if (!loserFacts) return;
    const winnerFacts = this.getOrCreateFacts(winner);
    winnerFacts.forcedOne = winnerFacts.forcedOne || loserFacts.forcedOne;
    winnerFacts.forcedManyTerms.push(...loserFacts.forcedManyTerms);
    winnerFacts.clampOneOrigins.push(...loserFacts.clampOneOrigins);
    winnerFacts.forceManyOrigins.push(...loserFacts.forceManyOrigins);
    this.facts.delete(loser);
  }

  getOrCreateFacts(id: PortKey): GroupFacts {
    const root = this.find(id);
    let f = this.facts.get(root);
    if (!f) {
      f = newGroupFacts();
      this.facts.set(root, f);
    }
    return f;
  }

  getFacts(id: PortKey): GroupFacts | undefined {
    return this.facts.get(this.find(id));
  }

  roots(): PortKey[] {
    const set = new Set<PortKey>();
    for (const id of this.parent.keys()) set.add(this.find(id));
    return [...set].sort();
  }

  members(root: PortKey): PortKey[] {
    const out: PortKey[] = [];
    for (const id of this.parent.keys()) if (this.find(id) === root) out.push(id);
    return out.sort();
  }
}

// ---------------------------------------------------------------------------
// InstanceUF — unifies instance terms; concrete beats variable
// ---------------------------------------------------------------------------

const instanceTermKey = (t: InstanceTerm): string => (t.kind === 'inst' ? `inst:${t.ref}` : `var:${t.var}`);

class InstanceUF {
  private readonly parent = new Map<string, string>();
  private readonly rank = new Map<string, number>();
  private readonly value = new Map<string, InstanceTerm>();

  ensure(t: InstanceTerm): string {
    const key = instanceTermKey(t);
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
      this.value.set(key, t);
    }
    return key;
  }

  private find(key: string): string {
    let root = key;
    while (this.parent.get(root)! !== root) root = this.parent.get(root)!;
    let cur = key;
    while (this.parent.get(cur)! !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  /** Unify two terms. Returns a conflict message when two distinct concrete instances meet. */
  unify(a: InstanceTerm, b: InstanceTerm): { conflict: string } | null {
    const ka = this.find(this.ensure(a));
    const kb = this.find(this.ensure(b));
    if (ka === kb) return null;
    const va = this.value.get(ka)!;
    const vb = this.value.get(kb)!;
    if (va.kind === 'inst' && vb.kind === 'inst') {
      // Distinct concrete lane sets cannot be the same — no subdomain rescue in the pillar.
      return { conflict: `Instance conflict: ${va.ref} vs ${vb.ref}` };
    }
    // Prefer a concrete instance as the winner so the variable resolves to it.
    let winner: string;
    let loser: string;
    if (va.kind === 'inst') [winner, loser] = [ka, kb];
    else if (vb.kind === 'inst') [winner, loser] = [kb, ka];
    else {
      const rankA = this.rank.get(ka)!;
      const rankB = this.rank.get(kb)!;
      if (rankA > rankB) [winner, loser] = [ka, kb];
      else if (rankB > rankA) [winner, loser] = [kb, ka];
      else {
        [winner, loser] = ka < kb ? [ka, kb] : [kb, ka];
        this.rank.set(winner, rankA + 1);
      }
    }
    this.parent.set(loser, winner);
    return null;
  }

  resolve(t: InstanceTerm): InstanceTerm {
    return this.value.get(this.find(this.ensure(t)))!;
  }

  /** Every variable term that unified with a concrete instance, mapped to that instance. */
  resolvedVars(): Map<CardinalityVarId, InstanceRef> {
    const out = new Map<CardinalityVarId, InstanceRef>();
    for (const term of this.value.values()) {
      if (term.kind !== 'var') continue;
      const root = this.value.get(this.find(instanceTermKey(term)))!;
      if (root.kind === 'inst') out.set(term.var, root.ref);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// The solve
// ---------------------------------------------------------------------------

export function solveCardinality(input: CardinalitySolveInput): CardinalitySolveResult {
  const { ports, constraints, inheritInstanceVars } = input;
  const uf = new CardinalityUF();
  const instanceUF = new InstanceUF();
  const errors: CardinalitySolveError[] = [];
  const diagnostics: SolveDiagnostic[] = [];

  for (const port of ports.keys()) uf.ensure(port);

  // --- Phase 1: equality UF ------------------------------------------------
  for (const c of constraints) if (c.kind === 'equal') uf.union(c.a, c.b);

  // --- Phase 2: collect group facts ----------------------------------------
  for (const c of constraints) {
    if (c.kind === 'clampOne') {
      const f = uf.getOrCreateFacts(c.port);
      f.forcedOne = true;
      f.clampOneOrigins.push(c.origin);
    } else if (c.kind === 'forceMany') {
      const f = uf.getOrCreateFacts(c.port);
      instanceUF.ensure(c.instance);
      f.forcedManyTerms.push(c.instance);
      f.forceManyOrigins.push(c.origin);
    }
  }
  // A concrete `many` in a port's base axis is many-evidence; a concrete `one`
  // there is NOT clampOne — only an explicit clampOne constraint forces one.
  for (const [port, axis] of ports) {
    if (axis.kind === 'many') {
      const term: InstanceTerm = { kind: 'inst', ref: axis.instance };
      const f = uf.getOrCreateFacts(port);
      instanceUF.ensure(term);
      f.forcedManyTerms.push(term);
    }
  }

  // --- Phase 3: local group resolution -------------------------------------
  for (const root of uf.roots()) {
    const facts = uf.getOrCreateFacts(root);
    const hasForcedMany = facts.forcedManyTerms.length > 0;

    if (facts.forcedOne && hasForcedMany) {
      const members = uf.members(root);
      const clampOneMembers = members.filter((p) => directlyClampOne(p, constraints, uf, root));
      const forceManyMembers = members.filter((p) => directlyForceMany(p, constraints, ports, uf, root));
      errors.push({
        kind: 'ClampManyConflict',
        ports: members,
        clampOneMembers: clampOneMembers.length > 0 ? clampOneMembers : members,
        forceManyMembers: forceManyMembers.length > 0 ? forceManyMembers : members,
        clampOneOrigins: facts.clampOneOrigins,
        forceManyOrigins: facts.forceManyOrigins,
        message: 'A port is constrained to both one and many',
      });
      continue; // leaves resolved === null; phase 5 skips it
    }

    if (facts.forcedOne) {
      facts.resolved = { kind: 'one' };
      continue;
    }

    if (hasForcedMany) {
      facts.resolved = resolveManyTerms(facts.forcedManyTerms, instanceUF, uf.members(root), errors);
      continue;
    }

    // No evidence → default one. Announce it only when a variable was in play —
    // a deliberately concrete-one port is not news. [LAW:no-silent-failure]
    facts.resolved = { kind: 'one' };
    if (uf.members(root).some((p) => ports.get(p)?.kind === 'var')) {
      diagnostics.push({
        code: 'CardinalityDefaultedToOne',
        message: 'Cardinality variable defaulted to one (no many evidence)',
        ports: uf.members(root),
        origins: [],
        stableKey: `CardinalityDefaultedToOne:${root}`,
      });
    }
  }

  // --- Phase 4: promoteToMany inner fixpoint -------------------------------
  const zipSets = constraints
    .filter((c): c is Extract<ZCardinalityConstraint, { kind: 'promoteToMany' }> => c.kind === 'promoteToMany')
    .map((c) => [...new Set(c.ports)].sort())
    .filter((ports2) => ports2.length > 0);

  const isMany = (r: PortKey): boolean => {
    const res = uf.getFacts(r)?.resolved;
    return res?.kind === 'manyConcrete' || res?.kind === 'manyVar';
  };
  const emittedZipConflicts = new Set<string>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const zip of zipSets) {
      const groupRoots = [...new Set(zip.map((p) => uf.find(p)))];
      const manyRoots = groupRoots.filter(isMany);
      if (manyRoots.length === 0) continue;

      // Every many group in a zip must align on one lane set. Unifying their
      // terms lets a variable adopt a concrete instance; two differing concretes
      // are a real conflict, reported once per zip. [LAW:no-silent-failure]
      const lead = uf.getFacts(manyRoots[0])!;
      let conflicted = false;
      for (let i = 1; i < manyRoots.length; i++) {
        const conflict = instanceUF.unify(resolutionToTerm(lead.resolved!), resolutionToTerm(uf.getFacts(manyRoots[i])!.resolved!));
        if (conflict) {
          conflicted = true;
          const key = zip.join(',');
          if (!emittedZipConflicts.has(key)) {
            emittedZipConflicts.add(key);
            errors.push({ kind: 'InstanceConflict', ports: zip, origins: [], message: conflict.conflict });
          }
        }
      }
      if (conflicted) continue;

      for (const r of groupRoots) {
        if (isMany(r)) continue;
        const facts = uf.getFacts(r) ?? uf.getOrCreateFacts(r);
        // clampOne groups are exempt — they stay one and the runtime zip-promotes
        // them lane-by-lane; this is the reason no clampOne-in-zip conflict exists.
        if (facts.forcedOne) continue;
        if (facts.resolved === null || facts.resolved.kind === 'one') {
          facts.resolved = cloneManyResolution(lead.resolved!);
          facts.forcedManyTerms.push(resolutionToTerm(lead.resolved!));
          changed = true;
        }
      }
    }
  }

  // --- Phase 5: finalize ---------------------------------------------------
  const cardinalities = new Map<CardinalityVarId, ZCardinality>();
  const resolvedVars = instanceUF.resolvedVars();

  for (const root of uf.roots()) {
    const facts = uf.getFacts(root);
    if (!facts || facts.resolved === null) continue; // phase-3 conflict groups, already reported
    const members = uf.members(root);

    const final = finalizeResolution(facts.resolved, members, resolvedVars, inheritInstanceVars, errors);
    if (final === null) continue;

    // A member that declares concrete 'one' contributes no evidence, so a
    // group resolving many silently overrides its declaration — surface the
    // promotion instead of leaving it as magic. [LAW:no-silent-failure]
    if (final.kind === 'many') {
      for (const port of members) {
        if (ports.get(port)?.kind === 'one') {
          diagnostics.push({
            code: 'CardinalityPromotedToMany',
            message: `Port ${port} declares cardinality one but its group resolved to many`,
            ports: [port],
            origins: [],
            stableKey: `CardinalityPromotedToMany:${port}`,
          });
        }
      }
    }

    for (const port of members) {
      const axis = ports.get(port);
      if (axis?.kind !== 'var') continue;
      mergeSubstitution(cardinalities, axis.var, final);
    }
  }

  return { cardinalities, errors, diagnostics };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const directlyClampOne = (
  port: PortKey,
  constraints: readonly ZCardinalityConstraint[],
  uf: CardinalityUF,
  root: PortKey,
): boolean =>
  constraints.some((c) => c.kind === 'clampOne' && c.port === port && uf.find(port) === root);

const directlyForceMany = (
  port: PortKey,
  constraints: readonly ZCardinalityConstraint[],
  ports: ReadonlyMap<PortKey, ZInferenceCardinality>,
  uf: CardinalityUF,
  root: PortKey,
): boolean => {
  if (uf.find(port) !== root) return false;
  if (constraints.some((c) => c.kind === 'forceMany' && c.port === port)) return true;
  return ports.get(port)?.kind === 'many';
};

/** Unify every many-evidence term, then read the lane set: concrete, or a still-variable group. */
function resolveManyTerms(
  terms: readonly InstanceTerm[],
  instanceUF: InstanceUF,
  members: readonly PortKey[],
  errors: CardinalitySolveError[],
): GroupResolution {
  const first = terms[0];
  for (let i = 1; i < terms.length; i++) {
    const conflict = instanceUF.unify(first, terms[i]);
    if (conflict) {
      errors.push({ kind: 'InstanceConflict', ports: members, origins: [], message: conflict.conflict });
    }
  }
  const resolved = instanceUF.resolve(first);
  return resolved.kind === 'inst'
    ? { kind: 'manyConcrete', instance: resolved.ref }
    : { kind: 'manyVar', var: resolved.var };
}

const resolutionToTerm = (r: GroupResolution): InstanceTerm => {
  if (r.kind === 'manyConcrete') return { kind: 'inst', ref: r.instance };
  if (r.kind === 'manyVar') return { kind: 'var', var: r.var };
  throw new Error('resolutionToTerm called on a one resolution'); // unreachable: callers guard kind
};

const cloneManyResolution = (r: GroupResolution): GroupResolution => {
  switch (r.kind) {
    case 'manyConcrete':
      return { kind: 'manyConcrete', instance: r.instance };
    case 'manyVar':
      return { kind: 'manyVar', var: r.var };
    case 'one':
      return { kind: 'one' };
  }
};

/** Turn a group resolution into a concrete cardinality, resolving or deferring a variable lane set. */
function finalizeResolution(
  resolution: GroupResolution,
  members: readonly PortKey[],
  resolvedVars: ReadonlyMap<CardinalityVarId, InstanceRef>,
  inheritInstanceVars: ReadonlySet<CardinalityVarId> | undefined,
  errors: CardinalitySolveError[],
): ZCardinality | null {
  if (resolution.kind === 'one') return { kind: 'one' };
  if (resolution.kind === 'manyConcrete') return { kind: 'many', instance: resolution.instance };

  const concrete = resolvedVars.get(resolution.var);
  if (concrete !== undefined) return { kind: 'many', instance: concrete };
  if (inheritInstanceVars?.has(resolution.var)) return { kind: 'many', instance: UNBOUND_INSTANCE };

  errors.push({
    kind: 'UnresolvedInstanceVar',
    ports: members,
    origins: [],
    message: `Cardinality variable ${resolution.var} resolved to many with no instance and no inherit policy`,
  });
  return null;
}

/**
 * A cardinality variable can surface in more than one group via promoteToMany,
 * so resolve write conflicts deterministically: many beats one; a concrete lane
 * set beats the unbound sentinel. [LAW:one-source-of-truth]
 */
function mergeSubstitution(
  out: Map<CardinalityVarId, ZCardinality>,
  varId: CardinalityVarId,
  incoming: ZCardinality,
): void {
  const existing = out.get(varId);
  if (existing === undefined) {
    out.set(varId, incoming);
    return;
  }
  if (existing.kind === 'many' && incoming.kind === 'many') {
    if (existing.instance === UNBOUND_INSTANCE && incoming.instance !== UNBOUND_INSTANCE) out.set(varId, incoming);
    return;
  }
  if (incoming.kind === 'many') out.set(varId, incoming);
}
