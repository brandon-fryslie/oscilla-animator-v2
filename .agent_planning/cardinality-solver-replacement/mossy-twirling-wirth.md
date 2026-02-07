# Cardinality Solver Replacement Plan (Revised v3)

## Objective

Replace the current cardinality solver with a constraint-graph-based approach. The new solver:
- Eliminates placeholder hacks (`isPlaceholderInstance()`)
- Properly handles instance variables via union-find
- Produces targeted diagnostics with block/port context
- Maintains strict separation: **vars are inference-only, never in canonical types**

---

## Key Design Decisions

### 1. Inference-Only Instance Terms

**Canonical types remain unchanged.** `CardinalityValue.many.instance` stays as `InstanceRef`.

Inference-only types introduce instance vars:
- `InferenceInstanceTerm` may be `{ kind: 'var'; id: InstanceVarId }` or `{ kind: 'inst'; ref: InstanceRef }`
- `InferenceCardinalityValue.many.instance` is `InferenceInstanceTerm`

This satisfies TYPE-SYSTEM-INVARIANTS rule 4 and avoids breaking 14+ call sites.

### 2. Instance Variable Unification Algorithm

Union-find for var equivalence + representative→concrete binding map:
- `InstanceVarUF`: standard union-find with **rank/size** and deterministic tie-breakers
- `resolvedRef: Map<InstanceVarId, InstanceRef>`: representative → concrete binding
- All operations return discriminated results (no `null as any`)
- Operations report whether they caused a material change (for fixpoint detection)

### 3. Edge Policy: All Edges Are Equal

**Broadcastability is NOT an edge property.** It's a block-level constraint (zipBroadcast).

All edges emit `Equal(from, to)` constraints. Zip/broadcast semantics are encoded as block-level `ZipBroadcast` constraints only. This prevents solver behavior from depending on traversal order or implicit context.

### 4. Minimal Constraint Primitives

Four constraint types that map directly to block metadata:
- `ClampOne(node)` — signalOnly blocks
- `ForceMany(node, instanceTerm)` — transform blocks OR fieldOnly ports (accepts `inst(ref)` OR `var(id)`)
- `Equal(a, b)` — edges + preserve blocks
- `ZipBroadcast(ports[])` — allowZipSig blocks (all inputs + all outputs as a single set)

`ForceMany` accepts `InferenceInstanceTerm`, not just concrete `InstanceRef`. This makes the solver complete for all "must be many" constraints:
- Transform blocks: `ForceMany(outPort, inst(ref))` with concrete instance
- FieldOnly ports: `ForceMany(inPort, var(ivX))` with fresh **existential** instance var

**Constraint normalization**: `Equal(a, b)` is normalized so `a < b` before computing sort keys. This ensures the same semantic constraint produces the same key regardless of construction order.

### 5. Existential Instance Variables

`var(id)` semantics are **existential**: "there exists some instance identity that must become consistent with anything this port equals."

- A `var(id)` is NOT a universally quantified variable ("any instance is accepted")
- A `var(id)` MUST resolve to a concrete `inst(ref)` via equality or zipBroadcast propagation
- Unresolved `var(id)` at finalization is fatal because `CanonicalType` requires concrete `InstanceRef`

This makes "fatal unresolved" semantically coherent, not arbitrary.

### 6. ZipBroadcast is Bidirectional

`ZipBroadcast(ports[])` is a **set constraint** over all ports (inputs + outputs) of an allowZipSig block:

- If ANY port in the set is `many`, ALL ports in the set must be `many` with unified instance
- If ALL ports are `one` (or unknown), zipBroadcast imposes NO new information (it does NOT force `one`)
- If there's a conflict (`one` forced vs `many` forced on same port), emit error

This is bidirectional: `many` propagates from outputs back to inputs (for lane alignment) AND from inputs to outputs.

**Important**: When nothing is `many`, zipBroadcast is a no-op. It does not "helpfully" force everything to `one`. This prevents solver magic.

### 7. Solver Does Not Invent Equality

`ZipBroadcast` may impose many-ness and unify instance terms, but it **must not merge equality classes**. Equality classes remain a structural fact of the graph (from edges + preserve strict blocks only).

### 8. Unresolved Vars Are Fatal

`UnresolvedInstanceVar` is a **fatal error** for finalization. No placeholder `InstanceRef` values are created. If UI needs best-effort types, that's a separate diagnostic-only output structure that backend compilation never sees.

### 9. Explicit Determinism

All iteration over Maps uses sorted keys. Determinism is explicit, not implicit via insertion order.

**Sources of identity (all stable):**
- `blockIndex`: stable from normalization pass
- `portName`: stable from block definition
- Sorted port keys: `[...map.keys()].sort()`
- Instance var IDs: derived from `blockIndex` + `portName` (e.g., `fieldOnly:${blockIndex}:${portName}`)
- Constraint sort key: `${kind}:${normalizedNodeIds.join(',')}` (where `Equal(a,b)` uses `min(a,b),max(a,b)`)

### 10. Fixpoint Termination (Monotonicity)

The solver fixpoint terminates because state transitions are monotonic:

**Per equality group:**
- `unknown` → `one` (once, never reverses)
- `unknown` → `many(term)` (once, never reverses)
- `one` ↔ `many` = conflict (stops iteration)

**Per instance term:**
- `var(id)` → resolved to `inst(ref)` (once, never reverses)
- `inst(ref1)` + `inst(ref2)` where `ref1 ≠ ref2` = conflict (stops iteration)

**Termination proof:**
- Finite groups (bounded by port count)
- Each group changes cardinality at most once
- Each instance var resolves at most once
- Conflicts halt early

### 11. Change Detection Includes Term Refinement

The fixpoint's `changed` flag must include **term refinement**, not just undefined→many transitions:

- `many(var(iv0))` refined by unifying with `many(inst(ref))` changes the binding, even though the outer shape (`many(...)`) is unchanged
- `InstanceVarUF` operations report whether they caused a no-op vs merged/resolved

This ensures the fixpoint converges correctly when instance vars get bound.

### 12. All Ports Get GroupFacts

Every port's equality group gets a `GroupFacts` entry, even if it has no constraints and no concrete cardinality from port types. This avoids "missing map entry" being conflated with "unresolved."

Implementation: call `getGroup(nodeId)` for every node during finalization, or pre-initialize all reps for all nodes.

### 13. Error Reporting: Canonical Culprit Port

For conflicts that occur at an equality-group level, pick a **deterministic anchor port** for the diagnostic:
- Smallest `PortKey` in the group (lexicographic)
- Include the full involved port set in the diagnostic payload

This provides "helpful targeted diag" rather than "maddening whack-a-mole."

### 14. Test-First Approach

Create correctness tests BEFORE rewriting solver. These become the regression baseline.

---

## Foundational Improvements

Before or during implementation, these improvements would make the architecture more sound:

### 1. Separate "Best-Effort UI Types" from "Validated Compilation Types"

**Current state**: `TypedPatch` is used for both UI display and backend compilation input.

**Problem**: If we make unresolved vars fatal, the frontend can't produce a `TypedPatch` at all for invalid graphs, breaking UI feedback.

**Recommended fix**: Split into two outputs:
- `TypedPatch` (strict): Only produced when all types resolve. Used by backend.
- `UITypeHints` (best-effort): Always produced. Contains resolved types where available, `null` or diagnostic markers where not. Used only by UI for display.

Concrete structure:
```typescript
interface UITypeHint {
  type?: CanonicalType;           // when solved
  status: 'ok' | 'unknown' | 'conflict';
  diagnosticIds: DiagnosticCode[];
}

interface UITypeHints {
  ports: ReadonlyMap<PortKey, UITypeHint>;
}

// Frontend returns both
interface FrontendResult {
  typedPatch: TypedPatch | null;  // null if fatal
  uiHints: UITypeHints;           // always present
  errors: readonly CompileError[];
}
```

This keeps backend inputs pure while giving UI enough for tooltips, red squiggles, and "unknown" badges.

### 2. Formalize Block Cardinality Metadata

**Current state**: `getBlockCardinalityMetadata()` extracts cardinality mode/policy from block definitions, but this metadata isn't formalized in the block schema.

**Problem**: Constraint generation depends on implicit conventions in block definitions.

**Recommended fix**: Add explicit `cardinalityBehavior` field to `BlockDefinition`:
```typescript
interface BlockCardinalityBehavior {
  mode: 'signalOnly' | 'preserve' | 'transform' | 'fieldOnly';
  broadcastPolicy?: 'strict' | 'allowZipSig';
  domainType?: string; // for transform blocks
}
```

This makes constraint generation mechanical and auditable.

### 3. Canonical Axis Wrapper Clarity

**Current state**: `Cardinality = Axis<CardinalityValue, CardinalityVarId>` conflates "the value" with "the axis wrapper."

**Problem**: Easy to accidentally return `CardinalityValue` where `Cardinality` is expected (or vice versa), especially in solver code that manipulates values.

**Recommended fix**: Adopt naming convention:
- `CardinalityValue` — the discriminated union (`zero | one | many`)
- `Cardinality` — always the axis-wrapped form
- Helper functions named explicitly: `cardinalityValueOne()` vs `cardinalityOne()` (axis-wrapped)

Consider a lint rule or type-level enforcement that `CardinalityValue` is never used where `Cardinality` is expected.

---

## Step 1: Add InstanceVarId

**File:** `src/core/ids.ts`

Add branded ID type for instance variables:

```typescript
export type InstanceVarId = Brand<string, 'InstanceVarId'>;
export const instanceVarId = (s: string) => s as InstanceVarId;
```

**Verification:**
```bash
npm run typecheck
```

---

## Step 2: Create Inference-Only Types

**File:** `src/compiler/frontend/inference-types.ts` (NEW)

```typescript
import type { InstanceRef } from '../../core/canonical-types';
import type { InstanceVarId, CardinalityVarId } from '../../core/ids';
import type { Axis } from '../../core/canonical-types/axis';

/**
 * Instance term used ONLY during inference.
 * Must be resolved to InstanceRef before leaving frontend.
 */
export type InferenceInstanceTerm =
  | { readonly kind: 'inst'; readonly ref: InstanceRef }
  | { readonly kind: 'var'; readonly id: InstanceVarId };

/**
 * Cardinality value used ONLY during inference.
 * Must be resolved to CardinalityValue before leaving frontend.
 */
export type InferenceCardinalityValue =
  | { readonly kind: 'zero' }
  | { readonly kind: 'one' }
  | { readonly kind: 'many'; readonly instance: InferenceInstanceTerm };

export type InferenceCardinality = Axis<InferenceCardinalityValue, CardinalityVarId>;

// Constructors
export function inferenceInstTerm(ref: InstanceRef): InferenceInstanceTerm {
  return { kind: 'inst', ref };
}

export function inferenceVarTerm(id: InstanceVarId): InferenceInstanceTerm {
  return { kind: 'var', id };
}

export function isInferenceVar(t: InferenceInstanceTerm): t is { kind: 'var'; id: InstanceVarId } {
  return t.kind === 'var';
}
```

**Verification:**
```bash
npm run typecheck
```

---

## Step 3: Create Correctness Test Baseline

**File:** `src/compiler/frontend/__tests__/solve-cardinality-correctness.test.ts` (NEW)

Create tests that assert actual solver outcomes (not just trace format):

```typescript
describe('cardinality solver correctness', () => {
  describe('signalOnly blocks', () => {
    it('forces all ports to cardinality one', () => {
      // A signalOnly block output must be one regardless of connections
    });
  });

  describe('transform blocks', () => {
    it('outputs many with block-specific instance', () => {
      // Array output is many(instanceId=<blockIndex>)
    });
  });

  describe('preserve blocks', () => {
    it('propagates many and preserves instance', () => {
      // Array → Add makes Add output many with same instance
    });
  });

  describe('zipBroadcast', () => {
    it('one + many → many with field instance', () => {
      // Add with allowZipSig: one input signal, one input field → output many
    });

    it('errors on instance mismatch', () => {
      // two different many instances into zipBroadcast → ZipBroadcastInstanceMismatch
    });

    it('imposes no constraint when nothing is many', () => {
      // zipBroadcast with all one/unknown inputs does NOT force one
    });
  });

  describe('unresolved is fatal', () => {
    it('produces UnresolvedInstanceVar error', () => {
      // Port with unresolved instance var → fatal error, no output
    });
  });
});
```

**Verification:**
```bash
npm run test -- src/compiler/frontend/__tests__/solve-cardinality-correctness.test.ts
```

---

## Step 4: Add Instance Variable Union-Find

**File:** `src/compiler/frontend/instance-var-uf.ts` (NEW)

All operations return discriminated results. No `null as any`. Operations report whether they caused a material change.

```typescript
import type { InstanceVarId } from '../../core/ids';
import type { InstanceRef } from '../../core/canonical-types';
import type { InferenceInstanceTerm } from './inference-types';

// Result types for all operations
export type UnionResult =
  | { readonly ok: true; readonly rep: InstanceVarId; readonly changed: boolean }
  | { readonly ok: false; readonly conflict: [InstanceRef, InstanceRef] };

export type ResolveResult =
  | { readonly ok: true; readonly changed: boolean }
  | { readonly ok: false; readonly conflict: [InstanceRef, InstanceRef] };

export type UnifyTermsResult =
  | { readonly ok: true; readonly term: InferenceInstanceTerm; readonly changed: boolean }
  | { readonly ok: false; readonly conflict: [InstanceRef, InstanceRef] };

/**
 * Union-Find for instance variable equivalence classes.
 * Each class may optionally resolve to a concrete InstanceRef.
 * Uses union-by-rank for performance and deterministic tie-breakers.
 */
export class InstanceVarUF {
  private parent = new Map<InstanceVarId, InstanceVarId>();
  private rank = new Map<InstanceVarId, number>();
  private resolvedRef = new Map<InstanceVarId, InstanceRef>();

  make(x: InstanceVarId): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: InstanceVarId): InstanceVarId {
    this.make(x);
    const p = this.parent.get(x)!;
    if (p === x) return x;
    const r = this.find(p);
    this.parent.set(x, r); // path compression
    return r;
  }

  union(a: InstanceVarId, b: InstanceVarId): UnionResult {
    this.make(a);
    this.make(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return { ok: true, rep: ra, changed: false };

    const ka = this.rank.get(ra)!;
    const kb = this.rank.get(rb)!;

    // Deterministic tie-break: lexicographic when ranks equal
    let winner: InstanceVarId;
    let loser: InstanceVarId;
    if (ka < kb || (ka === kb && ra > rb)) {
      winner = rb;
      loser = ra;
    } else {
      winner = ra;
      loser = rb;
    }

    // Check for ref conflicts before merging
    const refWinner = this.resolvedRef.get(winner);
    const refLoser = this.resolvedRef.get(loser);
    if (refWinner && refLoser && !instanceRefEq(refWinner, refLoser)) {
      return { ok: false, conflict: [refWinner, refLoser] };
    }

    this.parent.set(loser, winner);
    if (ka === kb) this.rank.set(winner, ka + 1);

    // Merge resolved refs
    if (!refWinner && refLoser) {
      this.resolvedRef.set(winner, refLoser);
    }
    this.resolvedRef.delete(loser);

    return { ok: true, rep: winner, changed: true };
  }

  resolveToRef(varId: InstanceVarId, ref: InstanceRef): ResolveResult {
    this.make(varId);
    const r = this.find(varId);
    const existing = this.resolvedRef.get(r);
    if (!existing) {
      this.resolvedRef.set(r, ref);
      return { ok: true, changed: true };
    }
    if (!instanceRefEq(existing, ref)) {
      return { ok: false, conflict: [existing, ref] };
    }
    return { ok: true, changed: false };
  }

  getResolved(varId: InstanceVarId): InstanceRef | null {
    const r = this.find(varId);
    return this.resolvedRef.get(r) ?? null;
  }
}

function instanceRefEq(a: InstanceRef, b: InstanceRef): boolean {
  return a.domainTypeId === b.domainTypeId && a.instanceId === b.instanceId;
}

/**
 * Unify two inference instance terms.
 * Returns discriminated result with unified term or conflict.
 * Reports whether any material change occurred.
 */
export function unifyInstanceTerms(
  uf: InstanceVarUF,
  t1: InferenceInstanceTerm,
  t2: InferenceInstanceTerm,
): UnifyTermsResult {
  if (t1.kind === 'inst' && t2.kind === 'inst') {
    if (!instanceRefEq(t1.ref, t2.ref)) {
      return { ok: false, conflict: [t1.ref, t2.ref] };
    }
    return { ok: true, term: t1, changed: false };
  }
  if (t1.kind === 'var' && t2.kind === 'var') {
    const res = uf.union(t1.id, t2.id);
    if (!res.ok) return res;
    return { ok: true, term: { kind: 'var', id: res.rep }, changed: res.changed };
  }
  // var + inst
  const v = t1.kind === 'var' ? t1.id : (t2 as { kind: 'var'; id: InstanceVarId }).id;
  const ref = t1.kind === 'inst' ? t1.ref : (t2 as { kind: 'inst'; ref: InstanceRef }).ref;
  const res = uf.resolveToRef(v, ref);
  if (!res.ok) return res;
  return { ok: true, term: { kind: 'inst', ref }, changed: res.changed };
}
```

**Verification:**
```bash
npm run typecheck
npm run test -- src/compiler/frontend/__tests__/instance-var-uf.test.ts
```

---

## Step 5: Add Constraint Graph Types

**File:** `src/compiler/frontend/cardinality-constraints.ts` (NEW)

Minimal constraint set that maps directly to block metadata:

```typescript
import type { InstanceRef } from '../../core/canonical-types';
import type { BlockIndex } from '../ir/patches';
import type { InferenceInstanceTerm } from './inference-types';

export type PortKey = `${number}:${string}:${'in' | 'out'}`;

export interface CardNode {
  readonly id: number;
  readonly port: PortKey;
  readonly blockIndex: BlockIndex;
  readonly portName: string;
  readonly direction: 'in' | 'out';
}

/**
 * Minimal constraint primitives.
 * These map directly to block metadata with no redundancy.
 */
export type CardConstraint =
  // signalOnly blocks: force cardinality one
  | { readonly kind: 'clampOne'; readonly node: number }
  // transform blocks OR fieldOnly ports: force cardinality many
  // Accepts inst(ref) for concrete, var(id) for existential instance var
  | { readonly kind: 'forceMany'; readonly node: number; readonly instance: InferenceInstanceTerm }
  // edges + preserve blocks: cardinality equality
  // Normalized: a < b for deterministic sort keys
  | { readonly kind: 'equal'; readonly a: number; readonly b: number }
  // allowZipSig blocks: zip broadcast semantics (bidirectional set constraint)
  // All ports (inputs + outputs) as single set: if any is many, all are many with same instance
  | { readonly kind: 'zipBroadcast'; readonly ports: readonly number[] };

/**
 * Compute deterministic sort key for a constraint.
 * Equal(a,b) is normalized so a < b.
 */
export function constraintSortKey(c: CardConstraint): string {
  switch (c.kind) {
    case 'clampOne':
      return `clampOne:${c.node}`;
    case 'forceMany':
      return `forceMany:${c.node}`;
    case 'equal': {
      const min = Math.min(c.a, c.b);
      const max = Math.max(c.a, c.b);
      return `equal:${min},${max}`;
    }
    case 'zipBroadcast':
      return `zipBroadcast:${[...c.ports].sort((a, b) => a - b).join(',')}`;
  }
}

/**
 * Constraint graph bundle.
 * All edges are equality constraints (no "broadcastable" policy on edges).
 */
export interface CardinalityConstraintGraph {
  readonly nodes: readonly CardNode[];
  readonly constraints: readonly CardConstraint[];
  readonly nodeByPort: ReadonlyMap<PortKey, number>;
}
```

**Note:** No `EdgeConstraint` type. All edges emit `Equal(from, to)` constraints. Broadcast semantics are block-level only via `ZipBroadcast`.

**Verification:**
```bash
npm run typecheck
```

---

## Step 6: Implement New Solver

**File:** `src/compiler/frontend/solve-cardinality.ts` (REWRITE)

The new solver uses union-find for equality groups + constraint folding + zipBroadcast fixpoint. No traversal-order dependence, no ad-hoc propagation.

### Data Structures

```typescript
// Group facts accumulated per equality group
interface GroupFacts {
  forcedOne: boolean;
  forcedManyTerms: InferenceInstanceTerm[];
  finalCard?: InferenceCardinalityValue;
}

// Equality union-find for nodes (uses rank/size)
class EqualityUF {
  private parent = new Map<number, number>();
  private rank = new Map<number, number>();

  make(x: number): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: number): number {
    this.make(x);
    const p = this.parent.get(x)!;
    if (p === x) return x;
    const r = this.find(p);
    this.parent.set(x, r); // path compression
    return r;
  }

  union(a: number, b: number): void {
    this.make(a);
    this.make(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;

    const ka = this.rank.get(ra)!;
    const kb = this.rank.get(rb)!;

    // Deterministic tie-break: smaller id wins when ranks equal
    let winner: number;
    let loser: number;
    if (ka < kb || (ka === kb && ra > rb)) {
      winner = rb;
      loser = ra;
    } else {
      winner = ra;
      loser = rb;
    }

    this.parent.set(loser, winner);
    if (ka === kb) this.rank.set(winner, ka + 1);
  }
}
```

### Algorithm Phases

**Phase 0: Normalize for determinism**
- Sort port keys
- Sort constraints by stable key using `constraintSortKey()` (Equal normalized so a < b)

**Phase 1: Build equality groups**
- For every `Equal(a, b)` constraint: `EqUF.union(a, b)`
- After this, treat "node" as "group" everywhere

**Phase 2: Collect hard facts into groups**
- For each `ClampOne(node)`: `group(node).forcedOne = true`
- For each `ForceMany(node, term)`: `group(node).forcedManyTerms.push(term)`

**Phase 3: Seed from existing port types**
- If port type has concrete cardinality:
  - `one` → `forcedOne = true`
  - `many(ref)` → `forcedManyTerms.push(inst(ref))`

**Phase 4: Solve each group locally (no zipBroadcast yet)**

For each group g:
1. If `forcedOne` AND `forcedManyTerms.length > 0` → emit `CardinalityConflict`
2. If `forcedOne` → `finalCard = { kind: 'one' }`
3. Else if `forcedManyTerms` non-empty:
   - Unify all instance terms via `InstanceVarUF`
   - If conflict between concrete refs → emit `CardinalityConflict`
   - `finalCard = { kind: 'many', instance: unifiedTerm }`
4. Else: `finalCard = undefined` (still unknown)

**Phase 5: ZipBroadcast fixpoint (bidirectional)**

For each `ZipBroadcast(ports[])`:
- `groups = ports.map(group).dedupe()`
- Find all groups with `finalCard.kind === 'many'` → collect their instance terms
- If multiple instance terms conflict → emit `ZipBroadcastInstanceMismatch`
- If any `candidateManyTerm` exists (unified from all many groups):
  - For EACH group in the set (bidirectional propagation):
    - If `finalCard` is `one` → emit `CardinalityConflict`
    - If `finalCard` is `many(term)` → unify `term` with `candidateManyTerm` via `InstanceVarUF`
    - If `finalCard` is `undefined` → set to `many(candidateManyTerm)`, mark changed
- **If NO candidateManyTerm exists** (nothing is many): zipBroadcast imposes no constraint

Track `changed` including:
- Any group transitions undefined → many(term)
- Any `unifyInstanceTerms` call returns `changed: true` (new UF union or new resolvedRef binding)

Iterate to fixpoint (stop when stable).

**Termination**: Monotonic state transitions guarantee convergence (see §10 above).

**Phase 6: Finalization (fatal unresolved)**

**Pre-initialize all groups**: Call `getGroup(nodeId)` for every nodeId to ensure all ports have a GroupFacts entry.

For each group corresponding to a port:
- If `finalCard` undefined → emit `UnresolvedCardinality` (fatal)
  - *Meaning: couldn't even decide one vs many*
- If `finalCard` is `many(var(iv))`:
  - Require `InstanceVarUF.getResolved(iv)` exists
  - Otherwise emit `UnresolvedInstanceVar` (fatal)
  - *Meaning: decided many, but couldn't resolve which instance*
- Produce canonical `CardinalityValue`:
  - `one` → `{ kind: 'one' }`
  - `many(inst(ref))` → `{ kind: 'many', instance: ref }`
  - `many(var(iv))` → `{ kind: 'many', instance: resolvedRef }`

**Error anchor port**: For group-level errors, pick smallest PortKey in the group (lexicographic). Include full port set in diagnostic payload.

**No placeholders, no escape hatches.**

Note: Phase 4 should prefer landing in `many(var)` (when forceMany exists) rather than staying `undefined`, so diagnostics are as precise as possible.

### Implementation

```typescript
export interface SolveCardinalityResult {
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType> | null; // null if fatal errors
  readonly errors: readonly CardinalityConstraintError[];
}

export function solveCardinality(input: SolveCardinalityInput): SolveCardinalityResult {
  const { graph, portTypes, trace, blockName } = input;
  const errors: CardinalityConstraintError[] = [];

  // Phase 0: Sort for determinism
  const sortedConstraints = [...graph.constraints].sort(
    (a, b) => constraintSortKey(a).localeCompare(constraintSortKey(b))
  );
  const sortedPortKeys = [...portTypes.keys()].sort();

  // Phase 1: Build equality groups
  const eqUF = new EqualityUF();
  for (const c of sortedConstraints) {
    if (c.kind === 'equal') {
      eqUF.union(c.a, c.b);
    }
  }

  // Phase 2-3: Collect facts into groups
  const groupFacts = new Map<number, GroupFacts>();
  const getGroup = (node: number) => {
    const rep = eqUF.find(node);
    if (!groupFacts.has(rep)) {
      groupFacts.set(rep, { forcedOne: false, forcedManyTerms: [] });
    }
    return groupFacts.get(rep)!;
  };

  for (const c of sortedConstraints) {
    if (c.kind === 'clampOne') {
      getGroup(c.node).forcedOne = true;
    } else if (c.kind === 'forceMany') {
      getGroup(c.node).forcedManyTerms.push(c.instance);
    }
  }

  // Phase 3: Seed from port types
  for (const portKey of sortedPortKeys) {
    const type = portTypes.get(portKey)!;
    const nodeId = graph.nodeByPort.get(portKey);
    if (nodeId === undefined) continue;
    const card = type.extent.cardinality;
    if (isAxisInst(card)) {
      const g = getGroup(nodeId);
      if (card.value.kind === 'one') {
        g.forcedOne = true;
      } else if (card.value.kind === 'many') {
        g.forcedManyTerms.push({ kind: 'inst', ref: card.value.instance });
      }
    }
  }

  // Phase 4: Solve each group locally
  const instanceUF = new InstanceVarUF();
  for (const [rep, facts] of groupFacts) {
    if (facts.forcedOne && facts.forcedManyTerms.length > 0) {
      errors.push(makeConflictError(graph, eqUF, rep, 'one vs many'));
      continue;
    }
    if (facts.forcedOne) {
      facts.finalCard = { kind: 'one' };
    } else if (facts.forcedManyTerms.length > 0) {
      const unified = unifyAllTerms(instanceUF, facts.forcedManyTerms);
      if (!unified.ok) {
        errors.push(makeConflictError(graph, eqUF, rep, 'instance mismatch', unified.conflict));
        continue;
      }
      facts.finalCard = { kind: 'many', instance: unified.term };
    }
    // else: finalCard remains undefined
  }

  // Phase 5: ZipBroadcast fixpoint (bidirectional)
  const zipConstraints = sortedConstraints.filter(c => c.kind === 'zipBroadcast');
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of zipConstraints) {
      if (c.kind !== 'zipBroadcast') continue;
      // Bidirectional: propagate many-ness to ALL ports in the set
      const result = applyZipBroadcastBidirectional(c.ports, eqUF, groupFacts, instanceUF, errors, getGroup);
      if (result.changed) changed = true;
    }
  }
  // Termination guaranteed by monotonic state transitions (see design decisions §10)

  // Phase 6: Finalization
  // Pre-initialize all groups to avoid missing entries
  for (const node of graph.nodes) {
    getGroup(node.id);
  }

  let hasFatalError = false;
  const resolvedPortTypes = new Map<PortKey, CanonicalType>();

  for (const portKey of sortedPortKeys) {
    const type = portTypes.get(portKey)!;
    const nodeId = graph.nodeByPort.get(portKey);
    if (nodeId === undefined) {
      resolvedPortTypes.set(portKey, type);
      continue;
    }

    const rep = eqUF.find(nodeId);
    const facts = groupFacts.get(rep);

    if (!facts?.finalCard) {
      hasFatalError = true;
      errors.push({
        kind: 'UnresolvedCardinality',
        anchorPort: findAnchorPort(graph, eqUF, rep),
        involvedPorts: findGroupPorts(graph, eqUF, rep),
        blockIndex: graph.nodes[nodeId].blockIndex,
        portName: graph.nodes[nodeId].portName,
        message: 'Cannot infer cardinality',
      });
      continue;
    }

    const result = finalizeCardinalityValue(facts.finalCard, instanceUF);
    if (!result.ok) {
      hasFatalError = true;
      errors.push({
        kind: 'UnresolvedInstanceVar',
        anchorPort: findAnchorPort(graph, eqUF, rep),
        involvedPorts: findGroupPorts(graph, eqUF, rep),
        blockIndex: graph.nodes[nodeId].blockIndex,
        portName: graph.nodes[nodeId].portName,
        message: 'Cannot resolve instance variable to concrete reference',
      });
      continue;
    }

    resolvedPortTypes.set(portKey, {
      ...type,
      extent: { ...type.extent, cardinality: axisInst(result.value) },
    });
  }

  if (hasFatalError) {
    return { portTypes: null, errors };
  }

  return { portTypes: resolvedPortTypes, errors };
}

/**
 * Find anchor port for error reporting: smallest PortKey in the group.
 */
function findAnchorPort(graph: CardinalityConstraintGraph, eqUF: EqualityUF, rep: number): PortKey {
  const ports = findGroupPorts(graph, eqUF, rep);
  return ports.sort()[0];
}

/**
 * Find all ports in an equality group.
 */
function findGroupPorts(graph: CardinalityConstraintGraph, eqUF: EqualityUF, rep: number): PortKey[] {
  return graph.nodes
    .filter(n => eqUF.find(n.id) === rep)
    .map(n => n.port);
}

type FinalizeResult =
  | { readonly ok: true; readonly value: CardinalityValue }
  | { readonly ok: false };

function finalizeCardinalityValue(
  val: InferenceCardinalityValue,
  uf: InstanceVarUF,
): FinalizeResult {
  if (val.kind === 'zero' || val.kind === 'one') {
    return { ok: true, value: val };
  }

  const inst = val.instance;
  if (inst.kind === 'inst') {
    return { ok: true, value: { kind: 'many', instance: inst.ref } };
  }

  // inst.kind === 'var' - must resolve
  const resolved = uf.getResolved(inst.id);
  if (!resolved) {
    return { ok: false };
  }

  return { ok: true, value: { kind: 'many', instance: resolved } };
}
```

**Verification:**
```bash
npm run test -- src/compiler/frontend/__tests__/solve-cardinality-correctness.test.ts
npm run test -- src/compiler/frontend/__tests__/solve-cardinality-trace.test.ts
```

---

## Step 7: Build Constraint Graph from Block Metadata

**File:** `src/compiler/frontend/analyze-type-constraints.ts`

Replace `gatherCardinalityConstraints()` with `buildCardinalityGraph()`.

**Key changes:**
- All edges become `Equal` constraints (no edge policy)
- `ZipBroadcast` is a block-level constraint, not edge property
- Sorted iteration for determinism

```typescript
function buildCardinalityGraph(
  normalized: NormalizedPatch,
  portInfos: Map<PortKey, PortInfo>,
): CardinalityConstraintGraph {
  const nodes: CardNode[] = [];
  const constraints: CardConstraint[] = [];
  const nodeByPort = new Map<PortKey, number>();

  // Create nodes for all ports (sorted for determinism)
  const sortedPortKeys = [...portInfos.keys()].sort();
  for (const portKey of sortedPortKeys) {
    const info = portInfos.get(portKey)!;
    const id = nodes.length;
    nodes.push({
      id,
      port: portKey,
      blockIndex: info.blockIndex,
      portName: info.portName,
      direction: info.direction,
    });
    nodeByPort.set(portKey, id);
  }

  // Generate block-level constraints from metadata
  for (let i = 0; i < normalized.blocks.length; i++) {
    const block = normalized.blocks[i];
    const blockIndex = i as BlockIndex;
    const meta = getBlockCardinalityMetadata(block.type);
    if (!meta) continue;

    const blockPorts = sortedPortKeys
      .filter(key => portInfos.get(key)!.blockIndex === blockIndex)
      .map(key => nodeByPort.get(key)!);

    switch (meta.cardinalityMode) {
      case 'signalOnly':
        for (const nodeId of blockPorts) {
          constraints.push({ kind: 'clampOne', node: nodeId });
        }
        break;

      case 'transform': {
        // Transform blocks force outputs to many with concrete instance
        const ref: InstanceRef = {
          domainTypeId: domainTypeId(meta.domainType ?? 'default'),
          instanceId: instanceId(`${blockIndex}`),
        };
        const outputs = blockPorts.filter(id => nodes[id].direction === 'out');
        for (const out of outputs) {
          constraints.push({
            kind: 'forceMany',
            node: out,
            instance: { kind: 'inst', ref },
          });
        }
        break;
      }

      case 'preserve':
        if (meta.broadcastPolicy === 'allowZipSig') {
          // ZipBroadcast: single set constraint over ALL ports (inputs + outputs)
          // Bidirectional: if any port is many, all are many with unified instance
          if (blockPorts.length > 0) {
            constraints.push({ kind: 'zipBroadcast', ports: blockPorts });
          }
        } else {
          // Strict equality among all ports
          for (let j = 1; j < blockPorts.length; j++) {
            constraints.push({ kind: 'equal', a: blockPorts[0], b: blockPorts[j] });
          }
        }
        break;

      case 'fieldOnly': {
        // FieldOnly blocks require inputs to be many (with fresh instance var)
        // This makes the solver the single authority for "must be many"
        const inputs = blockPorts.filter(id => nodes[id].direction === 'in');
        for (const input of inputs) {
          const varId = instanceVarId(`fieldOnly:${blockIndex}:${nodes[input].portName}`);
          constraints.push({
            kind: 'forceMany',
            node: input,
            instance: { kind: 'var', id: varId },
          });
        }
        break;
      }
    }
  }

  // Generate edge constraints (all edges are Equal)
  for (const edge of normalized.edges) {
    const fromKey = `${edge.fromBlock}:${edge.fromPort}:out` as PortKey;
    const toKey = `${edge.toBlock}:${edge.toPort}:in` as PortKey;
    const fromNode = nodeByPort.get(fromKey);
    const toNode = nodeByPort.get(toKey);
    if (fromNode === undefined || toNode === undefined) continue;

    constraints.push({ kind: 'equal', a: fromNode, b: toNode });
  }

  return { nodes, constraints, nodeByPort };
}
```

**Verification:**
```bash
npm run test -- src/compiler/frontend
```

---

## Step 8: Add Diagnostic Codes

**File:** `src/compiler/types.ts`

Add to `CompileErrorCode`:
```typescript
| 'ZipBroadcastInstanceMismatch'
| 'UnresolvedInstanceVar'
| 'UnresolvedCardinality'
| 'CardinalityConflict'
```

**File:** `src/compiler/frontend/frontendDiagnosticConversion.ts`

Add mappings:
```typescript
ZipBroadcastInstanceMismatch: 'E_ZIP_INSTANCE_MISMATCH',
UnresolvedInstanceVar: 'E_UNRESOLVED_INSTANCE_VAR',
UnresolvedCardinality: 'E_UNRESOLVED_CARDINALITY',
CardinalityConflict: 'E_CARDINALITY_CONFLICT',
```

**Verification:**
```bash
npm run typecheck
```

---

## Step 9: Wire New Solver into Pipeline

**File:** `src/compiler/frontend/analyze-type-constraints.ts`

At the call site (current ~line 663):

```typescript
// Build constraint graph
const cardGraph = buildCardinalityGraph(normalized, portInfos);

// Solve cardinality constraints
const cardinalityResult = solveCardinality({
  graph: cardGraph,
  portTypes,
  trace: options?.traceCardinalitySolver,
  blockName: (idx) => normalized.blocks[idx].id,
});

// Handle fatal errors
if (cardinalityResult.portTypes === null) {
  // Cardinality solving failed fatally
  // Return errors, do not proceed to backend
  return {
    typedPatch: null,
    errors: cardinalityResult.errors,
  };
}
```

**Verification:**
```bash
npm run test -- src/compiler
```

---

## Step 10: Delete Dead Code

**File:** `src/compiler/frontend/solve-cardinality.ts`

Delete from old implementation:
- `CardinalityUnionFind` class
- `isPlaceholderInstance()` function
- `preferConcreteCardinality()` function
- Old phase iteration logic
- `pendingOneNodes` hack
- `zipOutputPorts` hack

**Verification:**
```bash
npm run test
npm run build
```

---

## Step 11: End-to-End Verification

```bash
npm run test
npm run build
npm run dev  # Manual testing
```

**Manual checks:**
1. Load `golden-spiral` demo - verify Array → CircleLayoutUV → Render works
2. Enable "Trace Cardinality Solver" in Settings → Debug
3. Verify trace output shows new phase structure
4. Verify no regressions in type display on port hover
5. Create a graph with mismatched instances - verify `ZipBroadcastInstanceMismatch` error
6. Verify unresolved instance var produces fatal error (no compilation output)

---

## Files Changed Summary

| File | Action |
|------|--------|
| `src/core/ids.ts` | Add `InstanceVarId` |
| `src/compiler/frontend/inference-types.ts` | NEW: inference-only types |
| `src/compiler/frontend/instance-var-uf.ts` | NEW: union-find with discriminated results |
| `src/compiler/frontend/cardinality-constraints.ts` | NEW: minimal constraint types |
| `src/compiler/frontend/solve-cardinality.ts` | REWRITE: new solver |
| `src/compiler/frontend/analyze-type-constraints.ts` | Replace constraint gathering |
| `src/compiler/types.ts` | Add error codes |
| `src/compiler/frontend/frontendDiagnosticConversion.ts` | Add diagnostic mappings |
| `src/compiler/frontend/__tests__/solve-cardinality-correctness.test.ts` | NEW: correctness tests |
| `src/compiler/frontend/__tests__/instance-var-uf.test.ts` | NEW: UF tests |

---

## Invariants Preserved

1. **CanonicalType unchanged**: `CardinalityValue.many.instance` remains `InstanceRef`
2. **Vars are inference-only**: `InferenceInstanceTerm` with `kind: 'var'` never escapes frontend
3. **Vars are existential**: `var(id)` means "there exists an instance" that must resolve to concrete via equality/zip
4. **No placeholder refs**: Unresolved vars are fatal, not patched with fake InstanceRefs
5. **Deterministic**: All Map iterations use sorted keys; union-find uses rank + lexicographic tie-breakers; Equal(a,b) normalized
6. **14+ call sites unaffected**: No guards needed for `instance.domainTypeId` access
7. **Edges are pure equality**: Broadcast semantics are block-level constraints only
8. **Solver does not invent equality**: ZipBroadcast may unify instance terms but never merges equality classes
9. **Solver is complete authority**: All "must be many" constraints (transform + fieldOnly) are in solver
10. **Monotonic termination**: State transitions are one-way (unknown→resolved, var→inst); conflicts halt early
11. **All ports have groups**: Every port gets a GroupFacts entry, even with no constraints
12. **Change includes refinement**: Fixpoint tracks UF operations, not just cardinality shape changes
13. **ZipBroadcast no-op when nothing many**: Does not force `one`, imposes no constraint when all unknown/one

---

## Verification Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all existing + new tests)
- [ ] `npm run build` succeeds
- [ ] Trace mode produces phase output
- [ ] Demo patches compile without errors
- [ ] Instance mismatch produces targeted diagnostic with anchor port
- [ ] Unresolved instance var produces fatal error
- [ ] No `isPlaceholderInstance()` in final code
- [ ] No `null as any` in union-find code
- [ ] fieldOnly blocks correctly force many with instance var
- [ ] ZipBroadcast fixpoint converges (no infinite loop)
- [ ] ZipBroadcast with all one/unknown inputs does not force any constraint

---

## Notes on Unification

The instance term subproblem IS unification in the narrow sense: we have terms `inst(ref)` and `var(id)`, and we're unifying them with occurs-check-free union-find + a single binding target (`resolvedRef`) per class. That's a unification algorithm for a first-order term language with only variables and constants.

The entire cardinality solve is NOT unification in the type-inference sense: cardinality has additional structure (unknown/one/many, conflicts, zipBroadcast as a non-equality constraint, and "many-ness" propagation) that is not just "equate terms until consistent."

Using union-find for instance identity is exactly right for the subproblem it addresses.
