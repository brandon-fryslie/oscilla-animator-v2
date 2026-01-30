---
command: /canonicalize-architecture (expanded source set)
files: all spec + planning files
indexed: true
source_files:
  - design-docs/canonical-types/ (14 files)
  - .agent_planning/canonical-type/ (14 files)
  - .agent_planning/canonical-type-system/ (13 files)
topics:
  - principles
  - type-system
  - axes
  - validation
  - migration
---

# Topic Breakdown & Tier Classification: CanonicalType System

Generated: 2026-01-29T22:53:09Z
Supersedes: CANONICALIZED-TOPICS-canonical-types-20260129-075723.md

## Encyclopedia Structure

```
CANONICAL-canonical-types-20260129/
├── INDEX.md
├── TIERS.md
├── principles/
│   └── t1_single-authority.md       # Foundational
├── type-system/
│   ├── t1_canonical-type.md         # Foundational: core type shape
│   ├── t2_extent-axes.md            # Structural: 5 axes
│   ├── t2_derived-classifications.md # Structural: signal/field/event + helpers
│   └── t3_const-value.md            # Optional: literal representation
├── axes/
│   ├── t1_axis-invariants.md        # Foundational: hard rules I1-I5
│   ├── t2_cardinality.md            # Structural
│   ├── t2_temporality.md            # Structural
│   ├── t2_binding.md                # Structural (referent REMOVED)
│   ├── t2_perspective.md            # Structural
│   └── t2_branch.md                 # Structural
├── validation/
│   ├── t1_enforcement-gate.md       # Foundational: single point
│   ├── t2_axis-validate.md          # Structural: implementation
│   └── t3_diagnostics.md            # Optional: error messages
├── migration/
│   ├── t2_value-expr.md             # Structural: unified IR
│   ├── t2_unit-restructure.md       # Structural: UnitType nesting (NEW)
│   ├── t2_adapter-restructure.md    # Structural: adapter patterns (NEW)
│   ├── t3_definition-of-done.md     # Optional: checklists
│   └── t3_rules-for-new-types.md    # Optional: governance
├── GLOSSARY.md
├── RESOLUTION-LOG.md
└── appendices/
    ├── source-map.md
    ├── reference-implementation.md   # From 00-exhaustive-type-system.md
    └── planning-evaluation.md        # From EVALUATION-20260129-012028.md
```

---

## Changes from Previous Topics File

| Change | What | Why |
|--------|------|-----|
| ADDED | `migration/t2_unit-restructure.md` | Planning LOCKS UnitType restructure from 16 flat to 8 structured kinds — this is structural |
| ADDED | `migration/t2_adapter-restructure.md` | Planning proposes adapter spec restructure — needs decision but scope is structural |
| ADDED | `appendices/planning-evaluation.md` | The 20% alignment assessment from canonical-type-system is valuable reference |
| MODIFIED | `type-system/t2_derived-classifications.md` | Now includes try/require pattern for instance helpers (LOCKED change) |
| MODIFIED | `axes/t2_binding.md` | Documents referent removal (LOCKED decision) |

---

## Topics and Tier Breakdown

| # | Topic Slug | Title | T1 Files | T2 Files | T3 Files |
|---|------------|-------|----------|----------|----------|
| 01 | `principles` | Core Principles | single-authority | - | - |
| 02 | `type-system` | Type System | canonical-type | extent-axes, derived-classifications | const-value |
| 03 | `axes` | Extent Axes | axis-invariants | cardinality, temporality, binding, perspective, branch | - |
| 04 | `validation` | Validation | enforcement-gate | axis-validate | diagnostics |
| 05 | `migration` | Migration Path | - | value-expr, unit-restructure, adapter-restructure | definition-of-done, rules-for-new-types |

---

## Detailed Topic Outlines

### 01: Core Principles (`principles`)

**Primary Sources**: 05-LitmusTest.md, 15-FiveAxesTypeSystem-Conclusion.md

**T1 (Foundational)** — `t1_single-authority.md`:
- CanonicalType is the ONLY type authority
- No field may duplicate type authority (I1)
- Signal/field/event are derived, NOT stored
- "Changing this would make this a different type system"

**Key Terms**: CanonicalType, DerivedKind, Invariant

**Dependencies**: None (foundation of everything)

**Dependents**: All other topics

**Unresolved Issues**: None — all sources agree on this principle

---

### 02: Type System (`type-system`)

**Primary Sources**: 00-exhaustive-type-system.md, 01-CanonicalTypes.md, SPRINT-core-types-PLAN, SPRINT-constructors-helpers-PLAN, SPRINT-unit-restructure-PLAN

**T1 (Foundational)** — `t1_canonical-type.md`:
- CanonicalType = { payload, unit, extent }
- PayloadType closed set: float | int | bool | vec2 | vec3 | color | cameraProjection
- ⚠️ **UnitType** — UNRESOLVED (C2): spec has 5 kinds, planning LOCKS 8 structured kinds
- ⚠️ **Axis<T,V> vs AxisTag<T>** — UNRESOLVED (C1): spec and planning disagree with implementation

**T2 (Structural)** — `t2_extent-axes.md`:
- 5-axis Extent structure
- Axis polymorphism pattern (depends on C1 resolution)
- Default canonicalization rules

**T2 (Structural)** — `t2_derived-classifications.md`:
- deriveKind() function: event → field → signal precedence
- **LOCKED**: `tryGetManyInstance` + `requireManyInstance` (replaces spec's `getManyInstance`)
- isSignalType / isFieldType / isEventType boolean helpers
- requireSignalType / requireFieldType / requireEventType assertion helpers
- payloadStride(payload) computed helper

**T3 (Optional)** — `t3_const-value.md`:
- ConstValue discriminated union
- constValueMatchesPayload() validation

**Key Terms**: CanonicalType, PayloadType, UnitType, Extent, ConstValue, DerivedKind

**Dependencies**: [principles]

**Dependents**: [axes], [validation], [migration]

**Unresolved Issues**: C1 (axis pattern), C2 (UnitType structure), C3 (helper naming)

---

### 03: Extent Axes (`axes`)

**Primary Sources**: 11-Perspective.md, 12-Branch.md, 15-FiveAxesTypeSystem-Conclusion.md, SPRINT-core-types-PLAN

**T1 (Foundational)** — `t1_axis-invariants.md`:
- I1: Single authority — no duplicate storage
- I2: Only explicit ops change axes
- I3: Axis enforcement is centralized
- I4: State is scoped by axes
- I5: Const literal matches payload

**T2 (Structural)** — `t2_cardinality.md`:
- CardinalityValue: zero | one | many(instanceRef)
- InstanceRef: `{ instanceId: InstanceId, domainTypeId: DomainTypeId }` (branded, no `kind` field)
- Instance identity lives ONLY here

**T2 (Structural)** — `t2_temporality.md`:
- TemporalityValue: continuous | discrete
- Event hard invariants: payload=bool, unit=none, temporality=discrete

**T2 (Structural)** — `t2_binding.md`:
- **LOCKED**: BindingValue = unbound | weak | strong | identity (NO referent)
- Referent data belongs in continuity policies / StateOp args
- ⚠️ A4: Where exactly does referent data migrate to?

**T2 (Structural)** — `t2_perspective.md`:
- Current: `{ kind: 'default' }` only
- Future: world | view(id) | screen(id) (from 11-Perspective.md)
- ⚠️ G1: Full value domain not in type spec yet

**T2 (Structural)** — `t2_branch.md`:
- Current: `{ kind: 'default' }` only
- Future: main | preview(id) | checkpoint(id) | undo(id) | etc. (from 12-Branch.md)
- ⚠️ G1: Full value domain not in type spec yet

**Key Terms**: All axis types, InstanceRef, transform ops

**Dependencies**: [type-system]

**Dependents**: [validation]

**Unresolved Issues**: A4 (referent migration), G1 (perspective/branch value domains)

---

### 04: Validation (`validation`)

**Primary Sources**: 00-exhaustive-type-system.md, 05-LitmusTest.md, SPRINT-axis-validate-PLAN

**T1 (Foundational)** — `t1_enforcement-gate.md`:
- Single canonical enforcement point
- Runs after normalization + inference
- "No backend entry without passing validation"
- **LOCKED**: Enforce only TRUE invariants, not "convenient expectations"

**T2 (Structural)** — `t2_axis-validate.md`:
- validateAxes() implementation
- AxisViolation diagnostic type
- MUST enforce: event payload/unit/temporality, field cardinality, signal temporality
- MUST NOT: inference, adapters, coercions, over-enforcing payload/unit combos

**T3 (Optional)** — `t3_diagnostics.md`:
- Error message formats
- AxisInvalid diagnostic category

**Key Terms**: validateAxes, AxisViolation, AxisInvalid

**Dependencies**: [type-system], [axes]

**Dependents**: [migration] (gates ValueExpr work)

**Unresolved Issues**: None — all sources agree on validation scope

---

### 05: Migration Path (`migration`)

**Primary Sources**: 02-How-To-Get-There.md, 03-Types-Analysis.md, 06-DefinitionOfDone-90%.md, 07-DefinitionOfDone-100%.md, 09-NamingConvention.md, 10-RulesForNewTypes.md, all SPRINT plans

**T2 (Structural)** — `t2_value-expr.md`:
- ValueExpr unified IR (replaces SigExpr/FieldExpr/EventExpr)
- 6 base variants: const, external, intrinsic, kernel, state, time
- ⚠️ A1: Uses `op` discriminant (vs existing `kind` everywhere)
- ⚠️ G2: 24 existing variants → 6 spec variants mapping incomplete

**T2 (Structural)** — `t2_unit-restructure.md` (NEW):
- UnitType from 16 flat kinds to 8 structured kinds
- **LOCKED**: NO `{ kind: 'var' }` in canonical type
- Structured nesting: angle(radians|degrees|phase01), time(ms|seconds), space(ndc|world|view, dims), color(rgba01)
- Mapping table: old flat → new structured

**T2 (Structural)** — `t2_adapter-restructure.md` (NEW):
- ExtentPattern, ExtentTransform, TypePattern types
- **LOCKED**: Adapter matching purely on CanonicalType patterns
- **LOCKED**: Adapters are pure + stable
- ⚠️ A2: Full restructure scope unclear — phase the work?

**T3 (Optional)** — `t3_definition-of-done.md`:
- 90% checklist (bulk work) and 100% checklist (CI gates)
- Ripgrep verification commands

**T3 (Optional)** — `t3_rules-for-new-types.md`:
- 12 rules preventing "old world" leakage
- Code review litmus tests

**Key Terms**: ValueExpr, migration phases, DoD

**Dependencies**: [validation], [axes]

**Dependents**: None (end of pipeline)

**Unresolved Issues**: A1 (op vs kind), A2 (adapter scope), G2 (variant mapping)

---

## Topic Relationships

```
principles (T1)
    ↓
type-system ←── unit-restructure (migration/t2)
    ↓
axes ← binding LOCKED (no referent)
    ↓
validation ← LOCKED (true invariants only)
    ↓
migration → value-expr (depends on all above)
         → adapter-restructure (depends on type-system, axes)
```

---

## Suggested Reading Order

### For Newcomers
1. SUMMARY (this context)
2. `principles/t1_single-authority.md` — the core idea
3. `type-system/t1_canonical-type.md` — the one true type
4. `type-system/t2_derived-classifications.md` — signal/field/event + try/require helpers
5. `axes/t1_axis-invariants.md` — the rules
6. GLOSSARY

### For Implementers
1. `axes/t1_axis-invariants.md` — know the rules
2. `validation/t2_axis-validate.md` — enforcement implementation
3. `migration/t2_unit-restructure.md` — UnitType changes (LOCKED)
4. `migration/t2_value-expr.md` — unified IR
5. `migration/t3_rules-for-new-types.md` — governance
6. `appendices/reference-implementation.md` — exact code

---

## Source Assignment

| Source Document | Assigned To Topic | Coverage | Priority |
|-----------------|-------------------|----------|----------|
| 00-exhaustive-type-system.md | type-system, validation, appendices | Full — AUTHORITATIVE | P2 (spec) |
| 01-CanonicalTypes.md | type-system | Full | P2 |
| 02-How-To-Get-There.md | migration | Full | P2 |
| 03-Types-Analysis.md | migration (context) | Full | P2 |
| 04-CanonicalTypes-Analysis.md | type-system | Full | P2 |
| 05-LitmusTest.md | principles, validation | Full | P2 |
| 06-DefinitionOfDone-90%.md | migration | Full | P2 |
| 07-DefinitionOfDone-100%.md | migration | Full | P2 |
| 09-NamingConvention.md | migration | Full | P2 |
| 10-RulesForNewTypes.md | migration | Full | P2 |
| 11-Perspective.md | axes | Full | P2 |
| 12-Branch.md | axes | Full | P2 |
| 14-Binding-And-Continuity.md | axes | Empty (placeholder) | P2 |
| 15-FiveAxesTypeSystem-Conclusion.md | principles, axes | Full — SUMMARY | P2 |
| EVALUATION-20260129-012028.md | appendices | Full — ASSESSMENT | P1 (canonical-type-system) |
| SPRINT-core-types-PLAN.md | type-system, axes | Full — LOCKED DECISIONS | P1 |
| SPRINT-constructors-helpers-PLAN.md | type-system | Full — LOCKED DECISIONS | P1 |
| SPRINT-value-expr-PLAN.md | migration | Partial — MEDIUM confidence | P1 |
| SPRINT-axis-validate-PLAN.md | validation | Full — LOCKED DECISIONS | P1 |
| SPRINT-unit-restructure-PLAN.md | migration | Full — LOCKED DECISIONS | P1 |
| SPRINT-adapter-spec-PLAN.md | migration | Partial — MEDIUM confidence | P1 |
| SPRINT-cleanup-violations-PLAN.md | axes | Full — LOCKED DECISIONS | P1 |
| SPRINT-deprecate-old-PLAN.md | migration | Full | P1 |
| EVALUATION-2026-01-28-191553.md | (defer) | Superseded by 20260129 eval | P3 (canonical-type, low priority) |
| EXPLORE-2026-01-28-191553.md | (defer) | Raw facts, already consumed by eval | P3 |

---

## Tier Distribution

- **T1 (Foundational)**: 4 files across 4 topics
  - Cannot change without making this a different system

- **T2 (Structural)**: 13 files across 4 topics (+2 from previous)
  - Can change, but it's work and affects many things
  - NEW: unit-restructure, adapter-restructure

- **T3 (Optional)**: 4 files across 3 topics
  - Reference material, change freely if better approach found

---

## Notes for Final Generation

- C1 (Axis pattern) resolution will significantly affect `type-system/t1_canonical-type.md` content — the Axis type is foundational
- C2 (UnitType) resolution determines whether `type-system/t1_canonical-type.md` uses 5 or 8 kinds
- The planning evaluation (20% alignment) should be included as appendix — it establishes ground truth for what work remains
- The `canonical-type` planning directory is low priority but its dependency graph (C-1 through C-8) is still useful as reference for sprint ordering
