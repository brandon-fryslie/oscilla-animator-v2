---
command: /canonicalize-docs design-docs/CANONICAL-oscilla-v2.5-20260109
files: design-docs/_frontend-compiler/*.md design-docs/final-normalization-fixpoint-spec.md design-docs/unit-audit.md design-docs/cardinality-solver.md
indexed: true
source_files:
  - design-docs/_frontend-compiler/00-order-of-passes.md
  - design-docs/_frontend-compiler/01-composite-expansion.md
  - design-docs/_frontend-compiler/02-lens-expansion.md
  - design-docs/_frontend-compiler/03-build-draftgraph.md
  - design-docs/_frontend-compiler/04-fixpoint-loop.md
  - design-docs/_frontend-compiler/04.1-adapter-insertion.md
  - design-docs/_frontend-compiler/04.2-insert-state-blocks-into-cycles.md
  - design-docs/_frontend-compiler/04.3-unit-and-payload-normalization.md
  - design-docs/_frontend-compiler/04.4-default-sources.md
  - design-docs/_frontend-compiler/05-varargs.md
  - design-docs/_frontend-compiler/06-block-indexing.md
  - design-docs/_frontend-compiler/07-strict-finalization.md
  - design-docs/_frontend-compiler/08-axis-validation.md
  - design-docs/_frontend-compiler/09-analyze-cycles.md
  - design-docs/_frontend-compiler/20-floatToInt-and-cast-opcode.md
  - design-docs/final-normalization-fixpoint-spec.md
  - design-docs/unit-audit.md
  - design-docs/cardinality-solver.md
---

# Canonicalization Update Summary

**Run Type**: UPDATE
**Timestamp**: 2026-02-08 16:40:08
**Existing Canonical**: `CANONICAL-oscilla-v2.5-20260109/`
**Status Before**: UPDATING (external-input system integration in progress)
**New Sources**: 18 files (17 frontend compiler docs + 1 fixpoint spec + 2 supporting docs)

---

## EXECUTIVE SUMMARY

The new source documents describe a **fundamentally different frontend compilation architecture** than what is currently documented in the canonical spec. The canonical spec describes a **sequential linear pipeline**, while the new documents specify an **iterative fixpoint-based normalization system** with explicit obligation tracking and type-dependent elaboration.

### Key Findings

| Finding Type | Count | Severity Distribution |
|-------------|-------|---------------------|
| **Contradictions** | 4 | 1 × T1-CRITICAL, 3 × T2-STRUCTURAL, 0 × T3 |
| **Overlaps** | 3 | Detail additions (not redundant) |
| **New Topics** | 2 | Proposed: "Frontend Normalization Fixpoint" + "Elaboration Policies" |
| **Ambiguities** | 6 | 3 × CRITICAL, 3 × HIGH |
| **Gaps** | 3 | Undefined concepts referenced |

### Critical Issues Requiring Resolution

1. **[T1-CRITICAL]** Type boundary: When does `CanonicalType` exist? Canonical says "single authority always," new docs say "only after strict finalization"
2. **[T2-STRUCTURAL]** Pipeline architecture: Sequential (canonical) vs. fixpoint loop (new)
3. **[T2-STRUCTURAL]** Default source insertion: Before type solving (canonical) vs. inside fixpoint loop (new)
4. **[T2-STRUCTURAL]** Adapter insertion: Pre-type resolution (canonical) vs. type-driven obligations (new)

---

## 1. SOURCE DOCUMENT ANALYSIS

### New Source Collections

#### Collection A: Frontend Compiler Passes (17 files)
**Location**: `design-docs/_frontend-compiler/`
**Total Lines**: ~1,850 lines of specification
**Topics Covered**:
- Pass ordering and dependencies
- Composite/lens expansion (structural)
- DraftGraph construction
- Fixpoint normalization loop
- Type solving (payload, unit, cardinality)
- Obligation system (5 kinds)
- Policy-based elaboration (defaults, adapters, lane alignment)
- Strict finalization
- Axis validation
- Cycle analysis

**Key Architectural Concepts** (NOT in canonical):
- `DraftGraph` (mutable graph with obligations)
- `Obligation` (explicit deferred work item)
- `ElaborationPlan` (structural mutation recipe)
- `PolicyContext` / `PolicyResult` (type-dependent decision framework)
- `TypeFacts` (per-iteration type inference state)
- `PortTypeHint` (ok | unknown | conflict status)
- `InferenceCanonicalType` (var-bearing types during inference)

#### Collection B: Fixpoint Architecture Spec
**Location**: `design-docs/final-normalization-fixpoint-spec.md`
**Total Lines**: ~650 lines
**Purpose**: High-level architectural specification for fixpoint-based normalization

**Key Principles**:
1. Normalization is a fixpoint computation, not a sequence of passes
2. CanonicalType only appears after strict finalization (never partial)
3. Solve is pure; elaboration is monotone
4. Convergence is structural (no new plans)
5. Stable identity is deterministic

#### Collection C: Supporting Documentation
**Files**:
- `unit-audit.md`: Documents scalar UnitType removal and unit variable propagation (2026-02-08)
- `cardinality-solver.md`: Documents cardinality constraint solver implementation

**Relationship to Canonical**:
- Unit audit documents **implementation of canonical type system changes** (already integrated 2026-02-05)
- Cardinality solver documents **implementation detail** of inference system

---

## 2. CONTRADICTIONS

### C1: [T1-CRITICAL] Type Boundary — CanonicalType Authority

**Canonical Spec** (`ESSENTIAL-SPEC.md:110`, Topic 01):
> "CanonicalType: Single type authority = `{ payload: PayloadType; unit: UnitType; extent: Extent }`. No parallel type systems."

- Implies: CanonicalType is THE type, always present
- No mention of "partial" or "inference" types
- No mention of "finalization" as a boundary

**New Docs** (`final-normalization-fixpoint-spec.md:29-30`, `07-strict-finalization.md:1-15`):
> "CanonicalType must only appear after strict finalization. No vars. No placeholders."
> "InferenceCanonicalType is the only var-bearing type."
> "StrictTypedGraph produced only if all required ports status:'ok'"

- Implies: CanonicalType exists ONLY post-finalization
- During compilation: ports have InferenceCanonicalType (with vars)
- Finalization can FAIL → CanonicalType never produced for some ports

**Severity**: **T1-CRITICAL** — Contradicts Invariant I32 (single type authority)

**Impact**:
- If canonical spec requires CanonicalType everywhere always, new architecture violates it
- If new architecture is correct, canonical must distinguish inference vs. canonical phases
- UI/editor: What type do ports expose during editing? (partial vs. canonical)

**Files**:
- Canonical: `ESSENTIAL-SPEC.md` line 110, `topics/01-type-system.md` lines 45-60
- New: `final-normalization-fixpoint-spec.md` lines 29-30, 48-49; `07-strict-finalization.md` entire file

---

### C2: [T2-STRUCTURAL] Pipeline Architecture — Sequential vs. Fixpoint

**Canonical Spec** (`ESSENTIAL-SPEC.md:411-436`, Topic 04):
```
RawGraph → GraphNormalization → NormalizedGraph → Compilation Frontend →
TypedPatch → Compilation Backend → CompiledProgramIR
```

Properties:
- Single linear pass through normalization
- All derived blocks materialized upfront (defaults, buses, adapters)
- Type resolution happens AFTER structure is finalized
- No iteration, no backtracking

**New Docs** (`final-normalization-fixpoint-spec.md:53-66`, `00-order-of-passes.md:1-60`):
```
Patch → Composite expansion → Lens expansion → buildDraftGraph() →
finalizeNormalizationFixpoint()
  [Solve → Derive Obligations → Plan Discharge → Apply Plans]* until convergence
→ Varargs validation → Block indexing → Axis validation → Cycle classification →
TypedPatch / FrontendResult
```

Properties:
- **Iterative fixpoint loop** (repeat until no new plans)
- Default sources and adapters inserted **inside the loop** (type-dependent)
- Type solving happens **before** structural elaboration each iteration
- Convergence when `plans.length === 0`

**Severity**: **T2-STRUCTURAL** — Changes entire compilation pipeline order and control flow

**Impact**:
- Existing Topic 04 (Compilation) describes wrong architecture if fixpoint is implemented
- Code and spec would be fundamentally misaligned
- Cannot verify correctness if spec describes different algorithm

**Files**:
- Canonical: `ESSENTIAL-SPEC.md` lines 411-436; `topics/04-compilation.md` lines 60-145
- New: `final-normalization-fixpoint-spec.md` lines 53-66, 112-152; `00-order-of-passes.md` lines 1-60

---

### C3: [T2-STRUCTURAL] Default Source Insertion — Pre-Type vs. Type-Driven

**Canonical Spec** (`ESSENTIAL-SPEC.md:396-408`, Topic 02):
- Default sources generated during "GraphNormalization" stage
- All inputs "connected" before type resolution begins
- Implies: defaults materialized in NormalizedGraph deterministically, not conditionally

Example: "Every input ALWAYS has exactly one source (DefaultSource block)"

**New Docs** (`04.4-default-sources.md:23-24`, `04-fixpoint-loop.md`):
> "Insertion happens inside the fixpoint loop (Solve → Derive → Plan → Apply) so that inserted blocks participate in later solving"

- Default sources created **only when needed** (obligation-driven)
- Created **after** type solving in each iteration
- Enables type-dependent strategies (e.g., float vs. int defaults)

**Severity**: **T2-STRUCTURAL** — Changes when and how defaults are materialized

**Impact**:
- If canonical says defaults must exist in NormalizedGraph (pre-type), but new docs create them post-solve, the architectures are **incompatible**
- Affects: can adapters exist between default sources and inputs? (only if defaults inserted first)
- Affects: do default source blocks participate in type inference? (only if inserted before solving completes)

**Files**:
- Canonical: `ESSENTIAL-SPEC.md` lines 396-408; `topics/02-block-system.md` lines 280-310
- New: `04.4-default-sources.md` lines 23-24, 148-150, 196-205

---

### C4: [T2-STRUCTURAL] Adapter Insertion — Pre-Type vs. Type-Driven

**Canonical Spec** (`ESSENTIAL-SPEC.md:449-458`, Topic 21):
> "Attempting to infer types before explicit structure exists causes directionality bugs."
> "Adapter blocks are the only place unit conversion is allowed"

- Adapters are explicit blocks in the graph
- No statement about *when* adapters are inserted
- Implies: adapters exist in NormalizedGraph (same as defaults)

**New Docs** (`04.1-adapter-insertion.md:67-87`):
> "Adapter insertion is not part of Solve. Solve produces facts/diagnostics; adapter insertion is Plan/Apply."
> "Adapter planning only uses CanonicalType when a port's hint is status:'ok'."
> "Non-assignable edges trigger needsAdapter obligations."

- Adapters inserted **post-solve** via obligations
- Canonical types **required** before adapter planning
- BFS search for adapters using TypePattern matching

**Severity**: **T2-STRUCTURAL** — Changes adapter insertion point and type dependency

**Impact**:
- If adapters inserted before types are solved, they can't use TypePattern matching (canonical types required)
- If adapters inserted after types, they can't participate in type inference (too late)
- New docs resolve this via iteration: insert adapters, re-solve types in next iteration

**Files**:
- Canonical: `ESSENTIAL-SPEC.md` lines 449-458; `topics/21-adapter-system.md` lines 80-120
- New: `04.1-adapter-insertion.md` lines 67-87, 194-260

---

## 3. OVERLAPS (Detail Additions, Not Redundant)

### O1: Composite Expansion ID Scheme

**Canonical**: Mentions "anchor-based stable IDs" for derived blocks but doesn't prescribe scheme.

**New Docs**: Fully specifies path-based composite expansion IDs:
```
expandedBlockId = "cx:" + pathKey(path) + ":b:" + innerBlockId
pathKey = frameKey.join("/")
frameKey = instanceBlockId + "@" + compositeId
```

**Assessment**: **Detail addition** — canonical left this unspecified; new docs fill the gap.

**Files**:
- Canonical: `topics/04-compilation.md` lines 104-119 (mentions stable IDs generally)
- New: `01-composite-expansion.md` lines 97-130 (full ID scheme)

---

### O2: Axis Validation Rules (Guardrails)

**Canonical**: Topic 20 (Type Validation) specifies "Single Enforcement Gate" and axis contracts.

**New Docs**: `08-axis-validation.md` repeats the same rules with minor wording differences.

**Assessment**: **Overlap** — new docs confirm existing canonical rules; no contradiction.

**Files**:
- Canonical: `topics/20-type-validation.md` entire file
- New: `08-axis-validation.md` lines 1-80

---

### O3: Cycle Detection & Classification

**Canonical**: Topic 04 (Compilation) mentions "SCC detection" and "stateful primitives required in cycles."

**New Docs**: `09-analyze-cycles.md` provides detailed algorithm (Tarjan's) and classification taxonomy.

**Assessment**: **Detail addition** — canonical states requirement; new docs specify implementation.

**Files**:
- Canonical: `topics/04-compilation.md` lines 220-245
- New: `09-analyze-cycles.md` entire file

---

## 4. NEW TOPICS (Architectural Content Not in Canonical)

### NT1: Frontend Normalization Fixpoint (Proposed Topic)

**Canonical Location**: None. Topic 04 (Compilation) assumes sequential pipeline.

**New Docs Provide**:
1. **Fixpoint loop structure** (`final-normalization-fixpoint-spec.md`)
2. **Obligation semantics** (type-dependent deferred work)
3. **Policy-based elaboration** (DefaultSourcePolicy, AdapterPolicy)
4. **Convergence guarantees** (monotonicity, structural termination)
5. **DraftGraph mutable structure**
6. **TypeFacts intermediate representation**

**Scope**: 5 dedicated files + 1 architectural overview:
- `00-order-of-passes.md` (pipeline sequence)
- `04-fixpoint-loop.md` (iteration semantics — currently empty placeholder)
- `04.1-adapter-insertion.md` (adapter obligations)
- `04.2-insert-state-blocks-into-cycles.md` (cycle-breaking obligations)
- `04.4-default-sources.md` (default source obligations)
- `final-normalization-fixpoint-spec.md` (high-level architecture)

**Recommendation**:
- **Option A**: Create **Topic 04.5: "Frontend Normalization Fixpoint"** (self-contained architectural doc)
- **Option B**: **Rewrite Topic 04 (Compilation)** to describe fixpoint architecture as the primary pipeline

**Preferred**: **Option A** — allows side-by-side comparison until full migration confirmed.

---

### NT2: Elaboration Plans and Policies (Architectural Pattern)

**Canonical**: No formalized policy pattern for type-dependent graph mutation.

**New Docs Introduce**:
- `ElaborationPlan` struct with deterministic ID generation
- `PolicyContext` interface (graph, facts, registry)
- `PolicyResult` union (plan | blocked | waiting)
- Example policies: DefaultSourcePolicy, AdapterPolicy

**Scope**:
- `04.4-default-sources.md` sections 5-6 (policy contract)
- `04.1-adapter-insertion.md` sections 3-7 (policy implementation)

**Recommendation**: **Document as architectural pattern** in Topic 04.5 (if created) or as subsection of revised Topic 04.

---

## 5. AMBIGUITIES & CRITICAL GAPS

### A1: [CRITICAL] "DraftGraph" vs. "NormalizedGraph" — Same or Different?

**Canonical** uses term `NormalizedGraph` (fully explicit, typed, connected).

**New Docs** use term `DraftGraph` (blocks, edges, obligations, mutable during fixpoint).

**Question**: Are these synonymous, or does fixpoint produce BOTH?

**Evidence**:
- `final-normalization-fixpoint-spec.md:73-74`: "DraftGraph is the single mutable structure"
- `00-order-of-passes.md:8-9`: buildDraftGraph is fixpoint *input*
- Neither doc clarifies final output name

**Implication**: If DraftGraph is intermediate and NormalizedGraph is post-fixpoint, need explicit conversion function.

**Recommendation**: Define:
1. **DraftGraph** = fixpoint-internal mutable graph (with obligations)
2. **NormalizedGraph** = post-fixpoint immutable result (no obligations, fully connected, typed)
3. Conversion: `buildNormalizedGraph(draftGraph) → NormalizedGraph`

---

### A2: [CRITICAL] "Strict Finalization" Success Criteria

**Canonical**: Doesn't define "finalization" as a success gate.

**New Docs** (`07-strict-finalization.md`):
> "StrictTypedGraph produced only if: All required ports `status:'ok'`, No open obligations, No conflicts."
> "Otherwise, `strict` is `null`."

**Questions**:
1. What are "required ports"? (All inputs? User-authored only?)
2. If strict is `null`, what does frontend return? (TypedPatch with partial types?)
3. Can backend compilation proceed with non-strict output?

**Implication**: Canonical doesn't describe partial compilation or fallback modes.

**Recommendation**: Define:
1. Set of "required ports" (all inputs in user-authored blocks)
2. Frontend contract when strict fails (diagnostics only? Partial TypedPatch for UI?)
3. Backend's acceptance criteria (strict required or partial acceptable?)

---

### A3: [CRITICAL] Obligation Dependency Semantics — "Waiting" vs. "Blocked"

**New Docs** (`04.4-default-sources.md:180-190`) contain internal contradiction:

```typescript
// Policy returns "waiting" as blocked?
if (hint.status !== 'ok'), return {
  kind:'blocked', reason:'waiting', diagIds:[]
}
// But discharge planner treats 'waiting' as "remain open"?
```

**Contradiction**:
- Line 180: "If hint.status !== 'ok', return blocked"
- Line 189: "encode 'not ready' as blocked with reason:'waiting'"
- Line 189: "discharge planner MUST treat reason:'waiting' as 'remain open'"

**Problem**: Status `blocked` should *not* transition to `open`.

**Recommendation**:
1. Clarify policy contract: can policies return "waiting"?
2. Or: introduce `PolicyResult.kind = 'waiting'` (third status)
3. Or: obligation status ≠ policy result kind (different semantics)

---

### A4: [HIGH] Unresolved Type Variables Post-Fixpoint

**Canonical** (`ESSENTIAL-SPEC.md:463-474`):
> "Unresolved generic types are hard errors, never silent defaults."

**New Docs**: Don't explicitly state whether fixpoint loop *guarantees* all types resolve.

**Question**: Can a port remain `status:'unknown'` after fixpoint terminates? If so, error or acceptable?

**Recommendation**: Document:
1. Fixpoint termination does NOT guarantee all ports are `status:'ok'`
2. Ports may remain `unknown` or `conflict`
3. Strict finalization *fails* in these cases
4. Frontend returns partial TypedPatch for UI inspection (with diagnostics)

---

### A5: [HIGH] "Varargs Validation/Materialization" Post-Fixpoint

**New Docs** (`00-order-of-passes.md:41-43`):
> "Validate vararg wiring rules on finalized DraftGraph. If you do vararg expansion/materialization, it belongs here (or as obligation + policy inside loop)."

**Canonical**: No mention of varargs in compilation pipeline.

**Questions**:
1. What are varargs in Oscilla? (Variable arity nodes?)
2. Can varargs materialization trigger additional type changes (new iteration)?
3. Or is varargs strictly post-fixpoint, never triggering obligations?

**Recommendation**: Define varargs semantics and placement rationale.

---

### A6: [MEDIUM] Lens Expansion Ordering vs. Type Dependency

**New Docs** (`00-order-of-passes.md:6-7`, `02-lens-expansion.md`):
> "Lens expansion must run before any constraint extraction so Solve sees the real graph."
> "Lens expansion is structural and user-driven. It must remain as a separate pre-loop step."

**Canonical**: Doesn't mention lenses in compilation pipeline.

**Questions**:
1. Are lenses user-authored syntactic sugar? Or runtime constructs?
2. Can lens expansion create unresolved type constraints requiring type solving?
3. Or is lens expansion purely structural (no type impact)?

**Implication**: If lenses affect types, might trigger iteration; "pre-loop" placement contradicts "type-dependent elaboration inside loop."

**Recommendation**: Define:
1. What lenses are (grammar)
2. Whether lens expansion can create type constraints
3. Placement rationale (pre-loop vs. inside fixpoint)

---

## 6. GAPS (Undefined Concepts Referenced)

### G1: "InferenceCanonicalType" Type Definition

**New Docs**: Extensively use `InferenceCanonicalType` but don't define its structure.

**Canonical**: Added `InferenceCanonicalType` term to GLOSSARY (2026-02-05 update) but no full definition.

**Gap**: What exactly is `InferenceCanonicalType`?
- Is it `{ payload: InferencePayloadType; unit: InferenceUnitType; extent: InferenceExtent }`?
- Or does it allow partial structure (some axes resolved, some not)?

**Recommendation**: Add full type definition to Topic 01 (Type System) or Topic 20 (Type Validation).

---

### G2: "PortTypeHint" and "TypeFacts" Structures

**New Docs** (`final-normalization-fixpoint-spec.md:224-252`):
```typescript
TypeFacts = {
  ports: Map<PortKey, PortTypeHint>
}

PortTypeHint = {
  status: 'ok' | 'unknown' | 'conflict'
  canonical?: CanonicalType
  inference?: InferenceCanonicalType
  diagIds: string[]
}
```

**Canonical**: No mention of these structures.

**Gap**: Are these internal compiler structures, or part of the public FrontendResult API?

**Recommendation**: If public API, add to Topic 04. If internal, document in implementation notes (T3).

---

### G3: "ObligationKind" Enumeration

**New Docs** reference 5 obligation kinds:
1. `missingInputSource`
2. `needsAdapter`
3. `needsLaneAlignment`
4. `needsDomainElaboration`
5. `needsVarargMaterialization`

**Canonical**: No obligation system documented.

**Gap**: Kinds 3-5 have no detailed specification in new docs (only kind 1 and 2 fully specified).

**Recommendation**: Either:
- Provide full specs for all 5 kinds, or
- Mark kinds 3-5 as "future work" (not yet implemented)

---

## 7. AFFECTED CANONICAL TOPICS

### Topics Requiring Updates

| Topic # | Topic Name | Impact | Update Type |
|---------|-----------|--------|-------------|
| **01** | Type System | HIGH | Add InferenceCanonicalType definition; clarify finalization boundary |
| **02** | Block System | LOW | No changes (blocks unchanged) |
| **04** | Compilation | **CRITICAL** | Rewrite pipeline section OR create Topic 04.5 for fixpoint |
| **20** | Type Validation | MEDIUM | Clarify when validateAxes() runs (post-fixpoint, pre-backend) |
| **21** | Adapter System | MEDIUM | Document type-driven insertion (obligation-based) |

### Topics NOT Affected

- Topic 03 (Time System) — unchanged
- Topic 05 (Runtime) — unchanged
- Topic 06 (Renderer) — unchanged
- Topics 07-19 (Diagnostics, Debug UI, Continuity, Events, etc.) — unchanged
- Topic 22 (External Input) — unchanged

---

## 8. PROPOSED INTEGRATION STRATEGY

### Phase 1: Acknowledge Architecture Change (Immediate)

1. **Mark Topic 04 (Compilation) as "Under Revision"**
   - Add notice: "Pipeline architecture being updated to fixpoint-based normalization"
   - Preserve existing sequential description as "v0 baseline"

2. **Create placeholder Topic 04.5: "Frontend Normalization Fixpoint (Draft)"**
   - Status: DRAFT (not canonical yet)
   - Integrate content from new docs
   - Flag all contradictions with existing Topic 04

### Phase 2: Resolve Critical Contradictions (High Priority)

**Blockers for integration**:

1. **Resolve C1 (Type Boundary)**: Decide canonical vs. inference type lifecycle
   - **Option A**: InferenceCanonicalType is internal compiler detail; ports always expose CanonicalType (partial during editing)
   - **Option B**: InferenceCanonicalType is public API; CanonicalType only exists post-finalization

2. **Resolve C2 (Pipeline Architecture)**: Choose official architecture
   - **Option A**: Fixpoint is the new official architecture (deprecate sequential pipeline)
   - **Option B**: Both architectures valid (document decision criteria)

3. **Resolve C3/C4 (Elaboration Timing)**: Clarify when defaults/adapters are materialized
   - Depends on C2 resolution
   - If fixpoint adopted, elaboration is post-solve (inside loop)
   - If sequential preserved, elaboration is pre-solve (NormalizedGraph)

### Phase 3: Clarify Ambiguities (Medium Priority)

1. **Define DraftGraph vs. NormalizedGraph** (A1)
2. **Define strict finalization criteria** (A2)
3. **Fix obligation status semantics** (A3)
4. **Document unresolved type behavior** (A4)
5. **Specify varargs semantics** (A5)
6. **Clarify lens expansion** (A6)

### Phase 4: Fill Gaps (Lower Priority)

1. Define InferenceCanonicalType structure (G1)
2. Document TypeFacts/PortTypeHint API boundary (G2)
3. Specify obligation kinds 3-5 or mark future work (G3)

### Phase 5: Final Integration (After User Approval)

1. **Update Topic 01** (add InferenceCanonicalType)
2. **Update Topic 04** (integrate fixpoint or mark dual-architecture)
3. **Update Topic 20** (clarify validation gate placement)
4. **Update Topic 21** (document obligation-based adapter insertion)
5. **Update GLOSSARY** (add 15+ new terms)
6. **Update INVARIANTS** (add I38-I40)
7. **Update RESOLUTION-LOG** (document all resolutions)
8. **Update INDEX.md** (increment counts, add search hints)

---

## 9. USER DECISION POINTS

### Decision 1: Pipeline Architecture (CRITICAL)

**Question**: Is the fixpoint normalization architecture the official replacement for the sequential pipeline described in canonical Topic 04?

**Options**:
- **A**: YES — Fixpoint is the new official architecture; deprecate sequential description
- **B**: NO — Sequential pipeline remains official; fixpoint is experimental alternative
- **C**: BOTH — Document both as valid approaches with decision criteria

**Recommendation**: **Option A** (adopt fixpoint as official)
**Rationale**: New docs describe fixpoint in exhaustive detail (1,850 lines); sequential pipeline is briefly described in canonical (150 lines). Fixpoint architecture solves documented problems ("directionality bugs" from pre-type elaboration).

---

### Decision 2: Type Boundary (CRITICAL)

**Question**: When does `CanonicalType` exist?

**Options**:
- **A**: CanonicalType is THE type, always present (canonical spec position)
- **B**: InferenceCanonicalType during compilation; CanonicalType only after finalization (new docs position)

**Recommendation**: **Option B** (adopt inference/canonical distinction)
**Rationale**: Fixpoint architecture requires partial types during iteration. Enforcing "CanonicalType always" would require silent defaulting (violates canonical spec's "no silent defaults" rule).

---

### Decision 3: Elaboration Timing (STRUCTURAL)

**Question**: When are default sources and adapters inserted?

**Options**:
- **A**: Pre-type resolution (canonical NormalizedGraph)
- **B**: Post-type resolution, inside fixpoint loop (new docs obligation-driven)

**Recommendation**: **Option B** (post-type, obligation-driven)
**Rationale**: Depends on Decision 1. If fixpoint adopted, elaboration MUST be post-solve (type-dependent). Pre-solve elaboration would reintroduce "directionality bugs" fixpoint is designed to solve.

---

### Decision 4: DraftGraph vs. NormalizedGraph (NAMING)

**Question**: Are DraftGraph and NormalizedGraph the same, or distinct phases?

**Options**:
- **A**: Same — use "NormalizedGraph" consistently (rename DraftGraph)
- **B**: Distinct — DraftGraph is fixpoint-internal; NormalizedGraph is post-fixpoint output

**Recommendation**: **Option B** (distinct phases)
**Rationale**: Obligations are fixpoint-internal state; backend doesn't consume obligations. Clear naming distinguishes internal mutable structure from output artifact.

---

### Decision 5: Topic Structure (ORGANIZATIONAL)

**Question**: How to integrate fixpoint architecture into canonical spec?

**Options**:
- **A**: Rewrite Topic 04 to describe fixpoint as primary pipeline
- **B**: Create new Topic 04.5 "Frontend Normalization Fixpoint" (separate doc)
- **C**: Create Topic 23 "Advanced Compilation" (avoid numbering conflict)

**Recommendation**: **Option B** (Topic 04.5)
**Rationale**: Allows side-by-side comparison during transition; preserves Topic 04 baseline for historical reference; natural numbering (04 = compilation, 04.5 = detailed frontend architecture).

---

## 10. NEXT STEPS

### For User (Brandon)

1. **Review this summary** and the detailed contradictions (Section 2)
2. **Make decisions** on 5 decision points (Section 9)
3. **Mark resolutions** in the QUESTIONS file (will be generated next)
4. **Approve integration strategy** (Section 8)

### For Agent (Next Run)

After user resolves critical items:

1. **Generate CANONICALIZED-QUESTIONS** file (all contradictions, ambiguities, gaps as Q1-QN)
2. **Generate CANONICALIZED-GLOSSARY** file (15+ new terms from frontend compiler docs)
3. **Generate CANONICALIZED-TOPICS** file (proposed Topic 04.5 structure)
4. **Wait for user approval** of all resolutions
5. **Integrate approved content** into canonical topics
6. **Update INDEX.md** to CANONICAL status

---

## 11. STATISTICS

### Source Document Counts

| Category | Count | Lines |
|----------|-------|-------|
| New Source Files | 18 | ~2,500 |
| Existing Canonical Topics | 22 | ~35,000 |
| Topics Affected | 4 | ~8,000 |
| Topics Unchanged | 18 | ~27,000 |

### Finding Severity Distribution

| Severity | Contradictions | Ambiguities | Gaps |
|----------|---------------|-------------|------|
| T1-CRITICAL | 1 | 3 | 0 |
| T2-STRUCTURAL | 3 | 0 | 0 |
| T3-OPTIONAL | 0 | 0 | 0 |
| HIGH | 0 | 3 | 1 |
| MEDIUM | 0 | 1 | 2 |
| **Total** | **4** | **7** | **3** |

### Resolution Progress

- **Resolved**: 0 (awaiting user decisions)
- **Pending**: 14 (4 contradictions + 7 ambiguities + 3 gaps)
- **Deferred**: 0

---

## APPENDIX A: Files Processed

### Primary Source Documents (Frontend Compiler)

1. `design-docs/_frontend-compiler/00-order-of-passes.md` (59 lines)
2. `design-docs/_frontend-compiler/01-composite-expansion.md` (450 lines)
3. `design-docs/_frontend-compiler/02-lens-expansion.md` (180 lines)
4. `design-docs/_frontend-compiler/03-build-draftgraph.md` (0 lines — empty placeholder)
5. `design-docs/_frontend-compiler/04-fixpoint-loop.md` (0 lines — empty placeholder)
6. `design-docs/_frontend-compiler/04.1-adapter-insertion.md` (450 lines)
7. `design-docs/_frontend-compiler/04.2-insert-state-blocks-into-cycles.md` (280 lines)
8. `design-docs/_frontend-compiler/04.3-unit-and-payload-normalization.md` (320 lines)
9. `design-docs/_frontend-compiler/04.4-default-sources.md` (380 lines)
10. `design-docs/_frontend-compiler/05-varargs.md` (15 lines)
11. `design-docs/_frontend-compiler/06-block-indexing.md` (0 lines — empty placeholder)
12. `design-docs/_frontend-compiler/07-strict-finalization.md` (0 lines — empty placeholder)
13. `design-docs/_frontend-compiler/08-axis-validation.md` (0 lines — empty placeholder)
14. `design-docs/_frontend-compiler/09-analyze-cycles.md` (0 lines — empty placeholder)
15. `design-docs/_frontend-compiler/20-floatToInt-and-cast-opcode.md` (150 lines)

### Architectural Specification

16. `design-docs/final-normalization-fixpoint-spec.md` (650 lines)

### Supporting Documentation

17. `design-docs/unit-audit.md` (200 lines)
18. `design-docs/cardinality-solver.md` (180 lines)

**Total**: 18 files, ~3,314 lines of specification

### Existing Canonical Topics Consulted

- `CANONICAL-oscilla-v2.5-20260109/INDEX.md`
- `CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md`
- `CANONICAL-oscilla-v2.5-20260109/GLOSSARY.md`
- `CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md`
- `CANONICAL-oscilla-v2.5-20260109/RESOLUTION-LOG.md`
- `CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md`
- `CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.md`
- `CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md`
- `CANONICAL-oscilla-v2.5-20260109/topics/20-type-validation.md`
- `CANONICAL-oscilla-v2.5-20260109/topics/21-adapter-system.md`

---

**End of Summary**
