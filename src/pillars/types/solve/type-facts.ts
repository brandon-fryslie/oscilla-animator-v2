/**
 * src/pillars/types/solve/type-facts.ts
 *
 * Assembles per-port `TypeFacts` from the sub-solvers' results. TypeFacts is
 * what obligation DEPENDENCIES query each iteration — it is computed fresh from
 * the latest solver output and never cached across iterations.
 *
 * The single inference→concrete bridge is `ZCanonicalTypeSchema.safeParse`:
 * a port is 'ok' iff its fully-applied type passes parse. Any surviving
 * variable fails parse and yields 'unknown'. This is the ONLY place where that
 * determination is made — scattered `kind === 'inst'` checks are forbidden.
 * [LAW:single-enforcer] [LAW:types-are-the-program]
 */

import { ZCanonicalTypeSchema } from '../schemas';
import type { ZInferenceCanonicalType } from '../schemas';
import { applySubstitution } from './substitution';
import type { Substitution } from './substitution';
import type { PayloadUnitSolveResult } from './payload-unit';
import type { CardinalitySolveResult } from './cardinality';
import type { DraftPortKey, PortTypeHint, TypeFacts } from './typed-graph';

// ---------------------------------------------------------------------------
// Assemble substitution from sub-solver results
// ---------------------------------------------------------------------------

export function assembleSubstitution(
  puResult: PayloadUnitSolveResult,
  cardResult: CardinalitySolveResult,
): Substitution {
  return {
    payloads: puResult.payloads,
    units: puResult.units,
    cardinalities: cardResult.cardinalities,
  };
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

/**
 * Build TypeFacts for every port in `portBaseTypes`. For each port:
 *   1. Apply the substitution to its declared base type.
 *   2. Try `ZCanonicalTypeSchema.safeParse` — the single bridge.
 *   3. If parse succeeds → `ok`. If parse fails → `unknown` with the inference
 *      type (still carrying unresolved variables). If the solver reported a
 *      conflict touching this port → `conflict`.
 *
 * The `conflictPorts` set is derived from the solver's error list by the caller.
 */
export function computeTypeFacts(
  portBaseTypes: ReadonlyMap<DraftPortKey, ZInferenceCanonicalType>,
  subst: Substitution,
  conflictPorts: ReadonlySet<DraftPortKey>,
): TypeFacts {
  const ports = new Map<DraftPortKey, PortTypeHint>();
  const instances = new Map<string, DraftPortKey[]>();

  for (const [key, baseType] of portBaseTypes) {
    const applied = applySubstitution(baseType, subst);

    if (conflictPorts.has(key)) {
      ports.set(key, { status: 'conflict', inference: applied, diagIds: [] });
      continue;
    }

    const parsed = ZCanonicalTypeSchema.safeParse(applied);
    if (parsed.success) {
      const canonical = parsed.data;
      ports.set(key, { status: 'ok', canonical, diagIds: [] });
      // Index many-cardinality ports by their instance ref
      if (canonical.extent.cardinality.kind === 'many') {
        const ref = canonical.extent.cardinality.instance;
        const bucket = instances.get(ref);
        if (bucket) {
          bucket.push(key);
        } else {
          instances.set(ref, [key]);
        }
      }
    } else {
      ports.set(key, { status: 'unknown', inference: applied, diagIds: [] });
    }
  }

  // portAcceptance: for now, a port that has a cardinality variable in its
  // base type (after alpha-renaming) but no concrete forceMany evidence is
  // treated as 'oneOrMany'. This is the conservative default — it prevents
  // spurious cardinality-adapter obligations for polymorphic modifier blocks.
  const portAcceptance = new Map<DraftPortKey, 'oneOrMany' | 'oneOnly' | 'manyOnly'>();
  for (const [key, baseType] of portBaseTypes) {
    const card = baseType.extent.cardinality;
    if (card.kind === 'var') {
      portAcceptance.set(key, 'oneOrMany');
    } else if (card.kind === 'one') {
      portAcceptance.set(key, 'oneOnly');
    } else if (card.kind === 'many') {
      portAcceptance.set(key, 'manyOnly');
    }
  }

  return { ports, instances, portAcceptance };
}

// ---------------------------------------------------------------------------
// Dependency checkers — used by the fixpoint driver's plan-discharge step
// ---------------------------------------------------------------------------

export function areDependenciesSatisfied(
  deps: readonly import('./typed-graph').FactDependency[],
  facts: TypeFacts,
): boolean {
  for (const dep of deps) {
    switch (dep.kind) {
      case 'portCanonicalizable': {
        const hint = facts.ports.get(dep.port);
        if (!hint || hint.status !== 'ok') return false;
        break;
      }
      case 'portPayloadResolved': {
        const hint = facts.ports.get(dep.port);
        if (!hint || hint.status !== 'ok') return false;
        break;
      }
      case 'portHasUnresolvedPayload': {
        const hint = facts.ports.get(dep.port);
        // Dep is satisfied iff the port still has a payload variable (not yet resolved).
        if (!hint) return false;
        if (hint.status === 'ok') return false; // resolved naturally → dep not satisfied
        const inference = hint.inference;
        if (!inference || inference.payload.kind !== 'var') return false;
        break;
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Helper to build the conflict-port set from solver errors
// ---------------------------------------------------------------------------

/**
 * Only mark ports from BLOCK-INTERNAL conflicts (not edge-level mismatches).
 * When payloadEq(A,B) finds two different concrete types (a UserPatchTypeError),
 * both ports A and B individually resolve to their own concrete values — marking
 * them 'conflict' would prevent needsAdapter obligations from ever firing, since
 * those obligations require 'ok' status on both endpoints. Block-internal conflicts
 * (BlockDefTooSpecific / Unresolved) are truly unresolvable and warrant 'conflict'.
 * [LAW:single-enforcer] [LAW:no-silent-failure]
 */
export function buildConflictPorts(
  puResult: PayloadUnitSolveResult,
): ReadonlySet<DraftPortKey> {
  const set = new Set<DraftPortKey>();
  for (const err of puResult.errors) {
    if (err.errorClass === 'UserPatchTypeError') continue; // edge-level mismatch — let 'ok' flow through
    for (const port of err.ports) {
      set.add(port as DraftPortKey);
    }
  }
  return set;
}
