# Sprint 2: Frontend Solver Completeness (Cardinality + Instance)

Generated: 2026-02-01T14:00:00Z
Updated: 2026-02-01T15:00:00Z
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Supersedes: SPRINT-20260201-120000-type-compat-purity (remaining), SPRINT-20260201-120000-frontend-instance
Depends on: Sprint 1 (purity-authority)

## Sprint Goal

Replace the removed "cheats" (block-name exceptions, backend type rewriting) with real constraints that the frontend solver resolves. After this sprint, the frontend produces fully resolved CanonicalTypes for every port, and the backend is genuinely read-only.

## Design Decision: Type-Level Polymorphism (Decided)

**Cardinality polymorphism via constraints** (not runtime metadata dispatch).

Blocks like Add/Mul/Sin impose constraints, not compatibility exceptions:
- `preserve`: out.cardinality = in.cardinality (all inputs same cardinality, output same)
- `generic/zipSig`: allow (many, one) -> many for specific ops, expressed as a **constraint template** emitted by the block definition during Pass 1, not looked up during compatibility

The solver:
1. Introduces a cardinality variable `C` per relevant port
2. Unifies them according to block constraint rules
3. Resolves `C` to `one` | `many(inst X)` based on connected edges
4. If an edge connects mismatched concrete cardinalities after resolution → insert explicit Broadcast adapter or reject

This restores the invariant: compatibility is about types only. Policy (broadcast/zipSig) is about graph rewriting and explicit adapters.

**Instance resolution** follows the same pattern:
- Frontend solver produces CanonicalTypes whose `extent.cardinality` already contains the resolved instance ref when it's `many(inst ...)`.
- Instance ref comes from graph constraints (edges + instance-producing intrinsics + external inputs).
- Backend reads portTypes and uses them only for stride sizing, evaluation path selection, buffer allocation.

## Scope

**Deliverables:**
1. Cardinality constraint system in frontend type solver
2. Instance identity resolution in frontend type solver
3. Adapter insertion operates on fully resolved CanonicalTypes (no special exceptions)
4. All Sprint 1 regressions resolved (tests green again)

## Work Items

### P0: Cardinality Constraint Variables [MEDIUM]

**Files:** `src/compiler/frontend/analyze-type-constraints.ts`, `src/core/inference-types.ts`

**What to do:**
1. Block definitions emit cardinality constraints during Pass 1 (e.g., "all inputs share cardinality C", "output cardinality = C")
2. Type solver resolves cardinality variables using union-find / graph unification
3. Unresolved variables after constraint propagation → compile error (not silent default)
4. Cardinality-generic blocks (Mul, Add) declare constraint templates instead of relying on compatibility exceptions

**Implementation approach:**

The infrastructure already exists. `Cardinality = Axis<CardinalityValue, CardinalityVarId>` (in `src/core/canonical-types.ts:550`) already supports `{ kind: 'var', var: CardinalityVarId }`. The branded `CardinalityVarId` type exists in `src/core/ids.ts:24`. What's missing is the solver that creates and resolves these variables.

**Step-by-step implementation:**

1. **Create cardinality constraint types** in `src/core/inference-types.ts`:
   ```typescript
   // Cardinality constraint: all ports sharing a CardinalityVarId must resolve to the same CardinalityValue
   type CardinalityConstraint =
     | { kind: 'equal'; ports: readonly PortKey[] }           // all ports share cardinality
     | { kind: 'propagate'; from: PortKey; to: PortKey }      // to.cardinality = from.cardinality
     | { kind: 'fixed'; port: PortKey; value: CardinalityValue } // port has known cardinality
   ```

2. **Map existing `BlockCardinalityMetadata` to constraints** in Pass 1:
   - `cardinalityMode: 'preserve'` → emit `{ kind: 'equal', ports: [all inputs + all outputs] }` constraint
   - `cardinalityMode: 'transform'` → emit `{ kind: 'fixed', port: output, value: many(instance) }` (output cardinality from instance context)
   - `cardinalityMode: 'signalOnly'` → emit `{ kind: 'fixed', port: each, value: one }` for all ports
   - `cardinalityMode: 'fieldOnly'` → no constraint on cardinality value, but all ports must be `many`
   - `broadcastPolicy: 'allowZipSig'` → allow mixed `(many, one)` inputs; output follows the `many` input

3. **Add union-find solver** in new file `src/compiler/frontend/solve-cardinality.ts`:
   - Input: `Map<PortKey, Cardinality>` (initial port types from Pass 1) + `CardinalityConstraint[]`
   - Union-find groups ports by `CardinalityVarId`
   - Concrete values propagate through unions: if any port in a group has concrete cardinality, all get it
   - Conflict detection: two concrete values in same group → compile error
   - Output: `Map<PortKey, Cardinality>` with all vars resolved to concrete values

4. **Wire into existing pass flow** in `analyze-type-constraints.ts`:
   - Replace the existing `findFieldCardinalityFromUpstream` fixpoint loop (lines 456-485) with `solveCardinality()` call
   - The existing loop IS the cardinality solver prototype — it just needs to be generalized from "find upstream field" to "union-find with constraints"

**No changes to `BlockDef` interface required.** The existing `cardinality: BlockCardinalityMetadata` field on `BlockDef` already declares the constraint policy. The constraint emitter reads `BlockCardinalityMetadata` and generates `CardinalityConstraint[]`. This is a pure read of existing metadata, not a new field.

**Acceptance Criteria:**
- [ ] Cardinality variables exist in inference types (`InferenceCardinality` or similar)
- [ ] Block definitions emit cardinality constraints (derived from existing `BlockCardinalityMetadata`)
- [ ] Type solver resolves cardinality variables to concrete values via union-find
- [ ] Unresolved cardinality → compile error with context
- [ ] Mixed signal+field connections through cardinality-generic blocks work correctly
- [ ] `isTypeCompatible` remains pure (no regressions from Sprint 1)
- [ ] Performance: solver runs in < 1ms for typical graph sizes (union-find is O(α(n)))

### P1: Instance Identity Resolution in Frontend [MEDIUM]

**Files:** `src/compiler/frontend/analyze-type-constraints.ts`, `src/compiler/frontend/analyze-type-graph.ts`

**What to do:**
1. Instance identity becomes a constraint propagation problem
2. Any port whose cardinality is `inst` must carry a concrete instance ref by TypedPatch output
3. Instance ref source: edges + known instance-producing intrinsics + external inputs
4. Propagation: if block A's output feeds block B's input, and A's output has `many(inst X)`, then B's input acquires `many(inst X)`

**Acceptance Criteria:**
- [ ] TypedPatch.portTypes contains fully resolved instance refs where cardinality is `many`
- [ ] No `withInstance()` calls in backend (Sprint 1 enforcement test stays green)
- [ ] Instance propagation follows edges (deterministic)
- [ ] Missing instance ref → compile error (not silent default)

### P2: Adapter Insertion on Resolved Types [HIGH]

**Files:** `src/compiler/frontend/normalize-adapters.ts`

**What to do:**
1. Verify adapter insertion only uses `(fromType: CanonicalType, toType: CanonicalType)` and adapter registry patterns
2. Remove any remaining "temporary backward compatibility" comments
3. If adapter insertion needs block policy info, that info must come from TypedPatch constraints emitted during Pass 1, not from block-name lookups

**Rule:** Adapter insertion uses ONLY:
- `(fromType, toType)` — the resolved types
- Adapter registry patterns — `findAdapter(from, to)`
- Edge-level metadata from the typed graph (not block-name lookups)

**Acceptance Criteria:**
- [ ] No block-name lookups in adapter insertion code
- [ ] "Temporary backward compatibility" comments removed
- [ ] Adapter insertion works on fully resolved CanonicalTypes
- [ ] Un-skip enforcement test 5 from Sprint 1

## Dependencies
- Sprint 1 must be complete (impurities removed, enforcement tests in place)

## Risks
- **Risk**: Constraint solver complexity. **Mitigation**: Keep it structural and local — union-find for cardinality vars, deterministic propagation for instance refs. No global backtracking.
- **Risk**: Block definition changes required. **Mitigation**: Changes are additive (adding constraint templates alongside existing metadata), not breaking.
- **Risk**: Performance of constraint solving. **Mitigation**: Union-find is O(α(n)) per operation. Instance propagation is a single graph traversal.
