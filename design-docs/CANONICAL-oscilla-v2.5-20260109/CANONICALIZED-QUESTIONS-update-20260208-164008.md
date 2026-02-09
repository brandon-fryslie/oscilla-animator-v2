---
command: /canonicalize-docs design-docs/CANONICAL-oscilla-v2.5-20260109
files: design-docs/_frontend-compiler/*.md design-docs/final-normalization-fixpoint-spec.md design-docs/unit-audit.md design-docs/cardinality-solver.md
indexed: true
resolution_progress: 7/15 resolved
---

# Canonicalization Update: Questions Requiring Resolution

**Run Type**: UPDATE
**Timestamp**: 2026-02-08 16:40:08
**New Sources**: 18 files (frontend compiler architecture documentation)

---

## Resolution Status

| Category | Total | Resolved | Pending |
|----------|-------|----------|---------|
| **Contradictions** | 5 | 1 | 4 |
| **Ambiguities** | 7 | 3 | 4 |
| **Gaps** | 3 | 3 | 0 |
| **TOTAL** | **15** | **7** | **8** |

---

## CONTRADICTIONS

### Q1: [T1-CRITICAL] Type Boundary — When Does CanonicalType Exist?

**Status**: PENDING

**Category**: Contradiction-T1 (Foundational)

#### The Conflict

**Canonical Spec** (`ESSENTIAL-SPEC.md:110`, `topics/01-type-system.md:45-60`):
> "CanonicalType: Single type authority = `{ payload: PayloadType; unit: UnitType; extent: Extent }`. No parallel type systems."

- Implies: CanonicalType is THE type representation, always present
- No mention of "partial" types or "finalization" boundary
- Invariant I32: Single type authority

**New Docs** (`final-normalization-fixpoint-spec.md:29-30`, `07-strict-finalization.md`):
> "CanonicalType must only appear after strict finalization. No vars. No placeholders."
> "InferenceCanonicalType is the only var-bearing type."
> "StrictTypedGraph produced only if all required ports have status:'ok'"

- Implies: CanonicalType exists ONLY after successful finalization
- During compilation: ports have InferenceCanonicalType (with type vars)
- Finalization can FAIL → some ports never get CanonicalType

#### Why This Matters

- **UI/Editor**: What type do ports expose during live editing? (Partial vs. canonical)
- **Type Checking**: Can code check `port.type: CanonicalType` or must it handle `InferenceCanonicalType`?
- **Invariant Compliance**: Does "single type authority" mean CanonicalType always exists, or can InferenceCanonicalType temporarily be authoritative?

#### Resolution Options

**Option A**: CanonicalType is always present (canonical spec position)
- Consequence: Must silently default unresolved vars → violates "no silent defaults" rule
- Consequence: "Strict finalization" concept is unnecessary

**Option B**: InferenceCanonicalType during compilation; CanonicalType only after finalization (new docs position)
- Consequence: Canonical spec must distinguish inference vs. canonical phases
- Consequence: Invariant I32 must clarify "single authority" means one type *system*, not one type always
- Consequence: Frontend API exposes both InferenceCanonicalType and CanonicalType

**Option C**: Hybrid — ports always have CanonicalType, but axes may be `{ kind: 'var' }` during inference
- Consequence: CanonicalType allows var axes (contradicts new docs)
- Consequence: validateAxes() must allow vars during compilation (contradicts Topic 20)

#### Recommendation

**Option B** (adopt inference/canonical distinction)

**Rationale**: Fixpoint architecture requires partial types during iteration. Cannot enforce fully-resolved CanonicalType without silent defaulting (which canonical spec forbids).

#### Resolution Template

```markdown
### Q1: [T1-CRITICAL] Type Boundary

**Status**: RESOLVED

**Resolution**: Option B

**Rationale**: CanonicalType must be canonical - a variable with unresolved type variables is not a concrete type yet and must be resolved first
```

---

### Q2: [T2-STRUCTURAL] Pipeline Architecture — Sequential vs. Fixpoint

**Status**: PENDING

**Category**: Contradiction-T2 (Structural)

#### The Conflict

**Canonical Spec** (`ESSENTIAL-SPEC.md:411-436`, `topics/04-compilation.md:60-145`):
```
RawGraph → GraphNormalization → NormalizedGraph → Compilation Frontend →
TypedPatch → Compilation Backend → CompiledProgramIR
```

- Single linear pass through normalization
- All derived blocks (defaults, adapters) materialized upfront
- Type resolution happens AFTER structure is finalized

**New Docs** (`final-normalization-fixpoint-spec.md:53-66`, `00-order-of-passes.md:1-60`):
```
Patch → Composite expansion → Lens expansion → buildDraftGraph() →
finalizeNormalizationFixpoint()
  [Solve → Derive Obligations → Plan Discharge → Apply Plans]* until convergence
→ Varargs validation → Block indexing → Axis validation → Cycle classification →
TypedPatch / FrontendResult
```

- **Iterative fixpoint loop** (repeat until no new plans apply)
- Defaults and adapters inserted **inside the loop** (type-dependent)
- Type solving happens **before** structural elaboration each iteration

#### Why This Matters

- **Spec vs. Code Alignment**: If code implements fixpoint but spec describes sequential, they're fundamentally misaligned
- **Correctness Verification**: Cannot verify implementation correctness against wrong algorithm spec
- **Contributor Understanding**: New contributors would implement wrong architecture by following canonical spec

#### Resolution Options

**Option A**: Fixpoint is the new official architecture (deprecate sequential)
- Consequence: Rewrite Topic 04 (Compilation) to describe fixpoint
- Consequence: Sequential description moved to "historical context" appendix

The sequential code has been removed.  Fixpoint is all that exists.

#### Recommendation

**Option A** (adopt fixpoint as official architecture)

**Rationale**:
1. New docs are comprehensive (1,850 lines) vs. sequential brief description (150 lines)
2. Fixpoint architecture solves documented problems: "directionality bugs from pre-type elaboration"
3. Type-dependent elaboration (defaults, adapters) requires iteration to avoid ordering hacks

#### Resolution Template

```markdown
### Q2: [T2-STRUCTURAL] Pipeline Architecture

**Status**: RESOLVED

**Resolution**: Option A

**Rationale**: this is the mechanism by which Inference types are Canonicalized

```

---

### Q3: [T2-STRUCTURAL] Default Source Insertion — Pre-Type vs. Type-Driven

**Status**: PENDING

**Category**: Contradiction-T2 (Structural)

#### The Conflict

**Canonical Spec** (`ESSENTIAL-SPEC.md:396-408`, `topics/02-block-system.md:280-310`):
- "Every input ALWAYS has exactly one source (DefaultSource block)"
- Default sources generated during "GraphNormalization" stage
- All inputs "connected" **before** type resolution begins
- Implies: defaults materialized in NormalizedGraph deterministically

**New Docs** (`04.4-default-sources.md:23-24`, `04-fixpoint-loop.md`):
> "Insertion happens inside the fixpoint loop (Solve → Derive → Plan → Apply) so that inserted blocks participate in later solving"

- Default sources created **only when needed** (obligation-driven: `missingInputSource`)
- Created **after** type solving in each fixpoint iteration
- Enables type-dependent default strategies (e.g., float vs. int defaults)

#### Why This Matters

- **Elaboration Timing**: Pre-type elaboration causes "directionality bugs" (new docs claim)
- **Type Inference**: If defaults inserted before types solved, they can't use type-dependent strategies
- **Architecture Coupling**: Timing of defaults is coupled to pipeline architecture (Q2)

#### Dependencies

- **Depends on Q2**: If fixpoint architecture adopted (Q2 Option A), defaults MUST be post-solve (inside loop)
- **Depends on Q2**: If sequential pipeline retained (Q2 Option B), defaults MUST be pre-solve (NormalizedGraph)

#### Resolution Options

**Option A**: Pre-type (canonical NormalizedGraph stage)
- Compatible with: Sequential pipeline (Q2 Option B)
- Consequence: Cannot use type-dependent default strategies
- Consequence: Must resolve "directionality bugs" some other way

**Option B**: Post-type, inside fixpoint loop (new docs obligation-driven)
- Compatible with: Fixpoint architecture (Q2 Option A)
- Consequence: NormalizedGraph concept must be redefined (post-fixpoint artifact)
- Consequence: Default source blocks participate in type solving (desired behavior)

#### Recommendation

**Option B** (post-type, obligation-driven)

**Rationale**: Follows from Q2 recommendation (fixpoint). Pre-type elaboration reintroduces ordering problems fixpoint is designed to solve.

#### Resolution Template

```markdown
### Q3: [T2-STRUCTURAL] Default Source Insertion

**Status**: RESOLVED

**Resolution**:  Option B

**Rationale**: Default sources must be resolved inside fixpoint architecture

**Impact**:
- Topics affected: [02-block-system, 04-compilation, ...]
- NormalizedGraph definition: [Includes defaults (Option A) | Post-fixpoint artifact (Option B)]

**Approved by**: [Name]
**Approved at**: [Timestamp]
```

---

### Q4: [T2-STRUCTURAL] Adapter Insertion — Pre-Type vs. Type-Driven

**Status**: PENDING

**Category**: Contradiction-T2 (Structural)

#### The Conflict

**Canonical Spec** (`ESSENTIAL-SPEC.md:449-458`, `topics/21-adapter-system.md:80-120`):
> "Attempting to infer types before explicit structure exists causes directionality bugs."
> "Adapter blocks are the only place unit conversion is allowed"

- Adapters are explicit blocks in the graph
- No statement about *when* adapters are inserted
- Implies: adapters exist in NormalizedGraph (same as defaults)

**New Docs** (`04.1-adapter-insertion.md:67-87`):
> "Adapter insertion is not part of Solve. Solve produces facts/diagnostics; adapter insertion is Plan/Apply."
> "Adapter planning only uses CanonicalType when a port's hint is status:'ok'."
> "Non-assignable edges trigger `needsAdapter` obligations."

- Adapters inserted **post-solve** via obligations (solving is part of loop, so it's iterative)
- Canonical types **required** before adapter planning (uses TypePattern matching)
- BFS search for adapter chain when edge types mismatch

#### Why This Matters

- **Type Pattern Matching**: Adapter selection requires CanonicalType (TypePattern.match())
- **Type Inference**: If adapters inserted before types solved, can't match on types
- **Iteration**: Adapter insertion may enable new type resolutions → requires iteration

#### Dependencies

- **Depends on Q2**: Same coupling as Q3 (defaults)
- **Depends on Q3**: Adapters and defaults likely need same timing

#### Resolution Options

**Option A**: Pre-type resolution (canonical NormalizedGraph)
- Compatible with: Sequential pipeline (Q2 Option B)
- Consequence: Can't use TypePattern matching (requires CanonicalType)
- Consequence: Must use other criteria for adapter selection (port names? block roles?)

**Option B**: Post-type resolution, inside fixpoint loop (new docs obligation-driven)
- Compatible with: Fixpoint architecture (Q2 Option A)
- Consequence: Adapter blocks participate in later type solving iterations
- Consequence: Enables TypePattern matching (canonical types available)

#### Recommendation

**Option B** (post-type, obligation-driven)

**Rationale**: Same reasoning as Q3. TypePattern matching is superior to heuristic adapter selection (port naming conventions, etc.).

#### Resolution Template

```markdown
### Q4: [T2-STRUCTURAL] Adapter Insertion

**Status**: RESOLVED

**Resolution**: Option B

**Rationale**: It happens in Fixpoint loop, which iteratively solves types.  Due to loop, it happens whenever the necessary types are available

**Impact**:
- Topics affected: [21-adapter-system, 04-compilation, ...]
- TypePattern usage: Option B

**Approved by**: [Name]
**Approved at**: [Timestamp]
```

---

## AMBIGUITIES

### Q5: [CRITICAL] "DraftGraph" vs. "NormalizedGraph" — Same or Different?

**Status**: PENDING

**Category**: Ambiguity-Critical

#### The Ambiguity

**Canonical Spec** uses term `NormalizedGraph`:
- Fully explicit (all defaults, adapters materialized)
- Type-tagged ports (CanonicalType)
- Immutable input to compiler backend

**New Docs** use term `DraftGraph`:
- Blocks, edges, **obligations**
- Mutable during fixpoint iteration
- `buildDraftGraph()` is fixpoint input; unclear what fixpoint outputs

**Neither document clarifies**: Are these the same structure with two names, or different phases?

#### Why This Matters

- **API Clarity**: What type does `compileFrontend()` return?
- **Backend Coupling**: Does backend consume DraftGraph (with obligations) or NormalizedGraph (without)?
- **Naming Confusion**: Inconsistent terminology across docs causes contributor confusion

#### Resolution Options

**Option A**: Same structure — rename one for consistency
- Rename `DraftGraph` → `NormalizedGraph` (canonical term wins)
- Consequence: NormalizedGraph has obligations field (new)

**Option B**: Distinct phases
- **DraftGraph**: Fixpoint-internal mutable graph (with obligations)
- **NormalizedGraph**: Post-fixpoint immutable output (no obligations, fully connected)
- Conversion function: `buildNormalizedGraph(draftGraph) → NormalizedGraph`

#### Recommendation

**Option B** (distinct phases)

**Rationale**:
1. Obligations are fixpoint-internal state; backend shouldn't see them
2. Clear naming distinguishes mutable (Draft) from immutable (Normalized) phases
3. Matches common pattern: "Draft" = work-in-progress, "Normalized" = final artifact

#### Resolution Template

```markdown
### Q5: [CRITICAL] DraftGraph vs. NormalizedGraph

**Status**: RESOLVED

**Resolution**: [Option A | Option B | Custom]

**Rationale**: [Why this naming? What's the lifecycle?]

**Impact**:
- Types affected: [DraftGraph, NormalizedGraph, FrontendResult, ...]
- Conversion function: [None (Option A) | buildNormalizedGraph() (Option B)]

**Approved by**: [Name]
**Approved at**: [Timestamp]
```

---

### Q6: [CRITICAL] "Strict Finalization" Success Criteria

**Status**: PENDING

**Category**: Ambiguity-Critical

#### The Ambiguity

**Canonical Spec**: Doesn't define "finalization" as a success/failure gate.

**New Docs** (`07-strict-finalization.md`, `final-normalization-fixpoint-spec.md:366-382`):
> "StrictTypedGraph produced only if: All required ports `status:'ok'`, No open obligations, No conflicts."
> "Otherwise, `strict` is `null`."

**Unanswered Questions**:
1. **What are "required ports"?**
   - All input ports? (Including derived blocks like defaults?)
   - Only user-authored block ports? (Excludes compiler-generated nodes?)
   - Only ports reachable from outputs? (Dead code allowed to be unresolved?)

2. **If strict is `null`, what does frontend return?**
   - Diagnostics only? (No TypedPatch for UI inspection?)
   - Partial TypedPatch with InferenceCanonicalType? (UI can still render graph?)
   - Error sentinel? (Compilation hard-fails?)

3. **Can backend proceed with non-strict output?**
   - Backend requires strict? (Compilation fails if finalization fails?)
   - Backend tolerates partial? (Lowering handles unresolved ports gracefully?)

#### Why This Matters

- **Partial Compilation**: Can UI show graph with type errors, or must compilation be all-or-nothing?
- **Diagnostics UX**: If strict fails, user needs actionable feedback (which ports failed? why?)
- **Backend Contract**: Must backend handle partial types, or can it assume all types resolved?

#### Resolution Options

**Option A**: Define "required ports" narrowly (user-authored blocks only)
- Consequence: Derived blocks (defaults, adapters) allowed to have unresolved types
- Consequence: UI can show partial graphs with some errors

**Option B**: Define "required ports" broadly (all ports)
- Consequence: Single unresolved var → strict fails
- Consequence: UI cannot render graph until fully resolved

**Option C**: Define "required ports" semantically (reachable from outputs)
- Consequence: Dead code allowed to be unresolved
- Consequence: Enables progressive debugging (fix reachable errors first)

#### Recommendation

**Option C** (reachable from outputs)

**Rationale**:
1. Allows partial compilation (UI shows graph even with errors in dead branches)
2. Focuses user attention on reachable errors (actionable)
3. Matches "semantic correctness" principle (unused code doesn't block compilation)

#### Resolution Template

```markdown
### Q6: [CRITICAL] Strict Finalization Criteria

**Status**: RESOLVED

**Resolution**: [Option A | Option B | Option C | Custom]

**Required Ports Definition**: [User-authored (A) | All ports (B) | Reachable from outputs (C)]

**Frontend Return Value When Strict Fails**: [Diagnostics only | Partial TypedPatch | Error sentinel]

**Backend Behavior**: [Requires strict | Tolerates partial]

**Rationale**: [Why this definition? What UX does it enable?]

**Impact**:
- Topics affected: [04-compilation, 20-type-validation, ...]
- FrontendResult type: [Add `strict: StrictTypedGraph | null` field]

**Approved by**: [Name]
**Approved at**: [Timestamp]
```

---

### Q7: [CRITICAL] Obligation Dependency Semantics — "Waiting" vs. "Blocked"

**Status**: PENDING

**Category**: Ambiguity-Critical (Internal Contradiction in New Docs)

#### The Ambiguity

**New Docs** (`04.4-default-sources.md:180-190`) contain internal contradiction:

```typescript
// Line 180: Policy returns "blocked" when type not ready
if (hint.status !== 'ok'), return {
  kind: 'blocked',
  reason: 'waiting',  // ← "waiting" encoded as blocked
  diagIds: []
}

// Line 189: But discharge planner treats 'waiting' as "remain open"
// "discharge planner MUST treat reason:'waiting' as 'remain open'"
```

**The Problem**: Status `blocked` should mean "cannot proceed"; but `reason:'waiting'` means "not ready yet, check again next iteration." These are semantically different:
- **Blocked**: Permanent obstacle; manual intervention required
- **Waiting**: Temporary state; may resolve in next iteration

**Contradiction**: A `PolicyResult.kind:'blocked'` should NOT transition back to `open` status. But `reason:'waiting'` implies it should.

#### Why This Matters

- **Obligation Lifecycle**: Clear state machine required for fixpoint convergence
- **Diagnostic Quality**: Users need to distinguish "unresolvable error" from "not yet resolved"
- **Policy Contract**: Policy implementers need unambiguous return value semantics

#### Resolution Options

**Option A**: Remove `reason:'waiting'` — use only `blocked` (permanent failure)
- Consequence: Policies cannot express "not ready yet"
- Consequence: Must use different mechanism for temporary dependencies

**Option B**: Add third PolicyResult kind: `waiting`
```typescript
PolicyResult =
  | { kind: 'plan'; plan: ElaborationPlan }
  | { kind: 'blocked'; reason: string; diagIds: string[] }  // permanent
  | { kind: 'waiting'; deps: PortKey[] }  // temporary
```
- Consequence: Discharge planner handles `waiting` → keep obligation open
- Consequence: `blocked` → mark obligation failed (emit diagnostics)

**Option C**: Obligation status ≠ policy result kind (separate state spaces)
- Obligation statuses: `open | discharged | blocked | waiting`
- PolicyResult kinds: `plan | blocked`
- Discharge planner translates: `blocked` with `reason:'waiting'` → set obligation status to `waiting`

#### Recommendation

**Option B** (add `PolicyResult.kind:'waiting'`)

**Rationale**:
1. Clear semantic distinction: `waiting` = temporary, `blocked` = permanent
2. Matches fixpoint iteration model (dependencies resolve over iterations)
3. Enables better diagnostics (user sees "waiting on type X to resolve")

#### Resolution Template

```markdown
### Q7: [CRITICAL] Obligation Status Semantics

**Status**: RESOLVED

**Resolution**: [Option A | Option B | Option C | Custom]

**PolicyResult Type**: [Option B adds `kind:'waiting'`; describe full type]

**Obligation Status Transitions**: [Describe state machine: open → waiting → discharged / blocked]

**Rationale**: [Why this design? How does it support fixpoint iteration?]

**Impact**:
- Types affected: [PolicyResult, ObligationStatus, ...]
- Discharge planner logic: [Update to handle `waiting`]

**Approved by**: [Name]
**Approved at**: [Timestamp]
```

---

### Q8: [HIGH] Unresolved Type Variables Post-Fixpoint

**Status**: PENDING

**Category**: Ambiguity-High

#### The Ambiguity

**Canonical Spec** (`ESSENTIAL-SPEC.md:463-474`):
> "Unresolved generic types are hard errors, never silent defaults."

- Implies: All type vars must resolve, or compilation fails

**New Docs**: Don't explicitly state whether fixpoint loop *guarantees* all types resolve.

**Question**: Can a port remain `status:'unknown'` after fixpoint terminates? If so, is it:
- **Error**: Frontend fails; no TypedPatch produced
- **Warning**: Frontend succeeds; TypedPatch has partial types; backend may fail
- **Acceptable**: TypedPatch always produced; backend handles unresolved ports gracefully

#### Why This Matters

- **Compilation Guarantees**: Can backend assume all types resolved, or must it handle `unknown`?
- **UX**: Can user see graph with unresolved types (warnings), or must all types resolve (errors)?

#### Resolution Options

**Option A**: Fixpoint guarantees all types resolve (or fails)
- Consequence: Fixpoint can only terminate with all ports `status:'ok'` OR compilation fails
- Consequence: No partial compilation

**Option B**: Fixpoint may terminate with unresolved types; strict finalization fails
- Consequence: Frontend always produces TypedPatch (may have `status:'unknown'` ports)
- Consequence: Strict finalization distinguishes "good enough" vs. "has errors"
- Consequence: Backend requires strict; non-strict TypedPatch for UI only

#### Recommendation

**Option B** (fixpoint may leave unresolved types; strict fails)

**Rationale**:
1. Matches strict finalization concept (Q6)
2. Enables partial compilation (UI shows graph with errors)
3. Fixpoint convergence not blocked by type errors (structural convergence: `plans.length === 0`)

#### Resolution Template

```markdown
### Q8: [HIGH] Unresolved Type Variables

**Status**: RESOLVED

**Resolution**: [Option A | Option B | Custom]

**Fixpoint Guarantee**: [All types resolve (A) | May leave unresolved (B)]

**Frontend Behavior**: [Fails on unresolved (A) | Returns partial TypedPatch (B)]

**Backend Requirement**: [Tolerates partial | Requires strict]

**Rationale**: [Why this guarantee level? How does it affect UX?]

**Impact**:
- Topics affected: [04-compilation, 20-type-validation, ...]
- TypedPatch definition: [Always fully typed (A) | May have `status:'unknown'` (B)]

**Approved by**: [Name]
**Approved at**: [Timestamp]
```

---

### Q9: [HIGH] "Varargs Validation/Materialization" Post-Fixpoint

**Status**: RESOLVED

**Category**: Ambiguity-High (Undefined Concept)

#### Resolution

**Resolution**: Varargs are **collect ports** (variable-arity input ports) — *first-class* and required for the `Expression` block.

**Varargs Definition (v2.5)**:
- A **collect port** is an input port whose `InputDef.collectAccepts` is present.
- Semantics: the port accepts **N incoming edges**, and each incoming edge is **typed independently** (no union-find unification across edges).
- This is used by `Expression.refs` to accept arbitrary block references with per-edge types.

**Where it lives in the codebase today**:
- Block definition: `Expression.refs` is a collect port in `src/blocks/math/expression.ts`.
- Collect port constraint type: `InputDef.collectAccepts` in `src/blocks/registry.ts`.
- Edge role supports collect: `EdgeRole.kind === 'collect'` in `src/types/index.ts`.
- Constraint extraction: edges targeting collect ports are excluded from union-find unification in `src/compiler/frontend/extract-constraints.ts`.
- Defaulting behavior: collect ports do **not** receive `missingInputSource` obligations and therefore never get default sources (`src/compiler/frontend/draft-graph.ts`).
- Strict typing: per-edge types are carried via `StrictTypedGraph.collectEdgeTypes` in `src/compiler/frontend/type-facts.ts` and translated in `src/compiler/frontend/draft-graph-bridge.ts`.
- Strict finalization currently *constructs* `collectEdgeTypes` in `src/compiler/frontend/final-normalization.ts` (`tryFinalizeStrict()`), but does not yet validate collect edges against `collectAccepts`.
- Backend lowering: collect inputs are provided to blocks via `collectInputsById` in `src/compiler/backend/lower-blocks.ts`.

**Placement**:
- No standalone “varargs materialization” pass is required in v2.5.
- Required behavior is **validation** + **per-edge typing**:
  1) Validate each incoming edge’s type against `InputDef.collectAccepts`.
  2) Produce stable `collectEdgeTypes` (per-edge) so downstream lowering can consume them deterministically.

**Strict Finalization Rule (collect ports)**:
- Collect ports must NOT require a single fully-resolved port-level `CanonicalType` (they intentionally accept heterogeneous payloads/units).
- Strict finalization must treat collect ports as *satisfied* when:
  - all incoming edges are typed (source output types resolved), and
  - each edge type passes `collectAccepts` validation for the target port.

#### Evidence / Current Mismatch

As of **2026-02-09**, the current frontend strictness gate effectively requires collect ports to be resolved like normal ports (it returns null if *any* port hint is not `status:'ok'`), which breaks `Expression` varargs support. This shows up as:
- `FixpointFailed` and `TypeGraph/PortTypeUnknown` for `Expression.refs` in `src/compiler/__tests__/compile.test.ts` (test: “excludes errors from disconnected subgraph”).

#### Impact

- Update strict finalization criteria (Q6) to include explicit collect-port satisfaction rules.
- Validate collect edges per-edge (against `collectAccepts`) instead of running generic “edge compatibility” checks that assume a single `toPort` type exists.
- Remove/avoid `needsVarargMaterialization` as an obligation kind unless a future feature truly requires structural expansion.

**Approved by**: bmf
**Approved at**: 2026-02-09

---

### Q10: [HIGH] Lens Expansion Ordering vs. Type Dependency

**Status**: RESOLVED

**Category**: Ambiguity-High

#### Resolution

**Resolution**: Lenses are a fully-supported, user-authored feature that **must be expanded to explicit blocks + edges during normalization**, before constraint extraction / solving.

**Lens Definition (v2.5)**:
- Lenses are **port-attached transformations** (`InputPort.lenses`) that annotate a specific incoming connection (via `LensAttachment.sourceAddress`).
- They do not affect “runtime” after compilation because they are expanded into explicit blocks/edges and compiled like any other block.

**Type Impact**: Lens expansion is **purely structural**. Any type constraints come from the inserted lens blocks’ normal port types.

**Placement**: Pre-loop (before `buildDraftGraph()` / `extractConstraints()`), i.e.:
`Patch → composite expansion → lens expansion → buildDraftGraph → fixpoint`.

**Implementation Note (codebase status)**:
- The lens data model is defined in `src/graph/Patch.ts` (`InputPort.lenses`).
- A working expansion implementation exists in `src/compiler/frontend/normalize-adapters.ts` (`expandExplicitLenses()`), but the fixpoint frontend entrypoint `src/compiler/frontend/index.ts` does not currently invoke it.

#### Impact

- Canonical pipeline docs must include lens expansion explicitly (Topic 04).
- Fixpoint frontend must call lens expansion before building DraftGraph so that solvers, obligations, and downstream passes “see the real graph.”

**Approved by**: bmf
**Approved at**: 2026-02-09

---

### Q11: [MEDIUM] Type Inference Defaults for Unresolved Variables

**Status**: RESOLVED

**Category**: Ambiguity-Medium

#### Resolution

Certain inference “defaults” are permitted, but their severity must be **configurable** (warning vs failure vs ignore) via the application settings panel.

**Definition**:
- A “default” is any rule that assigns a concrete type/axis value in the absence of positive evidence.
- Defaults must never be silent: they must emit a diagnostic with a stable code whose severity can be overridden.

**Existing defaults in the codebase (must be surfaced as diagnostics)**:
- Unit inference: unresolved unit vars may default to `unitNone()` (`src/compiler/frontend/payload-unit/solve.ts`).
- Cardinality inference: groups with no evidence default to `one` (“signal chain”) (`src/compiler/frontend/cardinality/solve.ts`).

**Evidence / current mismatch**:
- The defaults above are currently **silent**: the solvers assign defaults directly and do not emit dedicated diagnostics for the defaulting event.
- The “GCC-style” compiler flags/settings system exists (`src/compiler/diagnostic-flags.ts`, `src/settings/tokens/compiler-flags-settings.ts`) but is not currently integrated into the fixpoint’s `solveDiagnostics` or strict-finalization success/failure logic.

**Settings contract**:
- Use the compiler flag settings mechanism:
  - UI token: `src/settings/tokens/compiler-flags-settings.ts`
  - Flag registry: `src/compiler/diagnostic-flags.ts`
- The flags registry must include codes for each inference default that can occur in the normalizer/solvers, and the normalizer must emit those codes.

**Strict finalization interaction**:
- If a default is configured as “error,” strict finalization should fail (backendReady false).
- If configured as “warn,” strict can still succeed but must carry the warning for UI display.

#### Impact

- Canonical spec must allow defaults only when explicitly declared and diagnostic-emitting.
- Application settings must be updated to reflect the actual defaults implemented in the normalizer (and vice versa).

**Approved by**: bmf
**Approved at**: 2026-02-09

---

## GAPS (Undefined Concepts Referenced)

### Q12: [HIGH] "InferenceCanonicalType" Type Definition

**Status**: RESOLVED

**Category**: Gap-High (Undefined Type)

#### Resolution

**Resolution**: Adopt the codebase’s TypeScript definition as the canonical specification.

**Source of truth**:
- `src/core/inference-types.ts` defines:
  - `InferencePayloadType`
  - `InferenceUnitType`
  - `InferenceCanonicalType`
  - `finalizeInferenceType()` as the only inference→canonical boundary.

**Spec note**:
- Inference types allow vars in payload/unit and (via `Axis`) in extent axes.
- CanonicalType must not contain vars (see `src/core/canonical-types/canonical-type.ts`).

#### Impact

- Canonical docs should reference the TypeScript definition verbatim (or as a mechanically equivalent translation).

**Approved by**: bmf
**Approved at**: 2026-02-09

---

### Q13: [MEDIUM] "PortTypeHint" and "TypeFacts" Public API or Internal?

**Status**: RESOLVED

**Category**: Gap-Medium (Undefined API Boundary)

#### Resolution

**Resolution**: Internal-only for now.

**UI-facing requirement**:
- The UI must have a stable, documented way to access user-facing diagnostics and per-port error context.
- This should be achieved via:
  - `FrontendResult.errors` (public, stable), plus
  - purpose-built “diagnostic query” helpers (public) that can evolve without exposing the entire internal fixpoint state.

**Guidance**:
- Do not commit to raw `TypeFacts`/`PortTypeHint` as a public stability surface yet.
- It is acceptable to expose TypeFacts under a `debug`/inspector-only channel if needed (non-semver).

**Approved by**: bmf
**Approved at**: 2026-02-09

---

### Q14: [MEDIUM] "ObligationKind" Enumeration — 5 Kinds Specified?

**Status**: RESOLVED

**Category**: Gap-Medium (Incomplete Specification)

#### Resolution (from codebase)

**Implemented kinds (present + created + discharged by a policy)**:
1. `missingInputSource` — created in `src/compiler/frontend/draft-graph.ts`, planned by `defaultSources.v1` (`src/compiler/frontend/policies/default-source-policy.ts`)
2. `needsAdapter` — created in `src/compiler/frontend/create-derived-obligations.ts`, planned by `adapters.v1` (`src/compiler/frontend/policies/adapter-policy.ts`)
3. `needsCardinalityAdapter` — created in `src/compiler/frontend/create-cardinality-obligations.ts`, planned by `cardinalityAdapters.v1` (`src/compiler/frontend/policies/cardinality-adapter-policy.ts`)
4. `needsCycleBreak` — created in `src/compiler/frontend/create-cycle-break-obligations.ts`, planned by `cycleBreak.v1` (`src/compiler/frontend/policies/cycle-break-policy.ts`)
5. `needsPayloadAnchor` — created in `src/compiler/frontend/create-derived-obligations.ts`, planned by `payloadAnchor.v1` (`src/compiler/frontend/policies/payload-anchor-policy.ts`)

**Reserved / future kinds (present in type union, not implemented yet)**:
- `needsLaneAlignment` — declared in `src/compiler/frontend/obligations.ts` but not created/discharged
- `needsDomainElaboration` — declared in `src/compiler/frontend/obligations.ts` but not created/discharged

**Not present in implementation**:
- `needsVarargMaterialization` does not exist in `src/compiler/frontend/obligations.ts` and should be treated as stale wording unless reintroduced intentionally.

#### Impact

- Canonical obligation system docs must list the implemented set above as the normative enumeration for v2.5.
- Any roadmap kinds must be explicitly marked “reserved / deferred.”

**Approved by**: bmf
**Approved at**: 2026-02-09

---

### Q15: [MEDIUM] CombineMode Representation — Structured vs. String Union

**Status**: RESOLVED

**Category**: Contradiction-T3 (API Shape / Implementation Drift)

#### The Conflict

**Canonical docs** currently specify a structured `CombineMode` object form (Topic 02), while the codebase uses a string union.

**Codebase** (`src/types/index.ts`) defines:
- `CombineMode` as a string union including `'collect'`.

#### Resolution

**Resolution**: Align UI/spec/compiler around the codebase representation (string union).

**Rationale**:
- It is already implemented and used across the app.
- `'collect'` is required for collect ports / varargs (Q9).

#### Impact

- Update canonical Topic 02 (Block System) to match the string-union representation and document `'collect'`.
- Ensure UI validation and compiler behavior refer to the same set and semantics.

**Approved by**: bmf
**Approved at**: 2026-02-09

---

## SUMMARY FOR USER

### Critical Path (Must Resolve Before Integration)

1. **Q1 [T1]**: Type boundary (CanonicalType vs. InferenceCanonicalType)
2. **Q2 [T2]**: Pipeline architecture (sequential vs. fixpoint)
3. **Q3 [T2]**: Default source insertion timing (depends on Q2)
4. **Q4 [T2]**: Adapter insertion timing (depends on Q2)
5. **Q5 [CRITICAL]**: DraftGraph vs. NormalizedGraph naming
6. **Q6 [CRITICAL]**: Strict finalization success criteria
7. **Q7 [CRITICAL]**: Obligation status semantics (internal contradiction in new docs)

### High Priority (Should Resolve for Clarity)

8. **Q8 [HIGH]**: Unresolved type variables post-fixpoint

### Resolved (2026-02-09)

9. **Q9 [HIGH]**: Varargs semantics (collect ports / Expression)
10. **Q10 [HIGH]**: Lens expansion semantics
11. **Q11 [MEDIUM]**: Type inference defaults (configurable severity)
12. **Q12 [HIGH]**: InferenceCanonicalType definition
13. **Q13 [MEDIUM]**: TypeFacts API boundary
14. **Q14 [MEDIUM]**: ObligationKind enumeration completeness
15. **Q15 [MEDIUM]**: CombineMode representation

---

**Next Steps**: Resolve remaining open questions (Q1–Q8) by marking each with:
```markdown
### Qn: [TITLE]

**Status**: RESOLVED

**Resolution**: [Decision]

**Rationale**: [Why]

**Impact**: [What changes]

**Approved by**: [Name]
**Approved at**: [Timestamp]
```

After resolution, re-run canonicalization to integrate approved content into canonical topics.

---

**End of Questions Document**
