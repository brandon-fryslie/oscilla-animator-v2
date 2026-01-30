---
command: /canonicalize-architecture (expanded source set + resolutions applied)
files: all spec + planning files + 99-INVARIANTS-FOR-USAGE.md
indexed: true
source_files:
  - design-docs/canonical-types/ (15 files)
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

Generated: 2026-01-29T23:15:00Z
Supersedes: CANONICALIZED-TOPICS-canonical-types-20260129-225309.md

## Changes from Previous Topics File

| Change | What | Why |
|--------|------|-----|
| ADDED | New source: `99-INVARIANTS-FOR-USAGE.md` | 17 guardrails added since last run; cross-checked against resolved decisions |
| UPDATED | `validation/t1_enforcement-gate.md` | Now incorporates 17 guardrails from 99-INVARIANTS; one example needs fix (N1) |
| UPDATED | All resolved items | C1-C3, A1-A4, T1-T2, G1, L1-L2 resolutions reflected in topic content |
| NO CHANGE | Encyclopedia structure | Topic/tier assignments unchanged - resolutions clarified content, not structure |

---

## Encyclopedia Structure

```
CANONICAL-canonical-types-<timestamp>/
├── INDEX.md
├── TIERS.md
├── principles/
│   └── t1_single-authority.md       # Foundational
├── type-system/
│   ├── t1_canonical-type.md         # Foundational: core type shape (C1, C2 resolved)
│   ├── t2_extent-axes.md            # Structural: 5 axes
│   ├── t2_derived-classifications.md # Structural: signal/field/event + try/require (C3 resolved)
│   └── t3_const-value.md            # Optional: literal representation
├── axes/
│   ├── t1_axis-invariants.md        # Foundational: hard rules I1-I5
│   ├── t2_cardinality.md            # Structural
│   ├── t2_temporality.md            # Structural
│   ├── t2_binding.md                # Structural (referent REMOVED - A4 resolved)
│   ├── t2_perspective.md            # Structural (full domain included - G1 resolved)
│   └── t2_branch.md                 # Structural (full domain included - G1 resolved)
├── validation/
│   ├── t1_enforcement-gate.md       # Foundational: single point + 17 guardrails
│   ├── t2_axis-validate.md          # Structural: implementation
│   └── t3_diagnostics.md            # Optional: error messages
├── migration/
│   ├── t2_value-expr.md             # Structural: unified IR (A1 resolved: kind discriminant)
│   ├── t2_unit-restructure.md       # Structural: UnitType nesting (C2 resolved)
│   ├── t2_adapter-restructure.md    # Structural: adapter patterns (A2 resolved: full restructure)
│   ├── t3_definition-of-done.md     # Optional: checklists
│   └── t3_rules-for-new-types.md    # Optional: governance
├── GLOSSARY.md
├── RESOLUTION-LOG.md
└── appendices/
    ├── source-map.md
    ├── reference-implementation.md   # From 00-exhaustive-type-system.md
    └── planning-evaluation.md        # From EVALUATION-20260129-012028.md (A3: 20% correct)
```

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

**T1 (Foundational)** - `t1_single-authority.md`:
- CanonicalType is the ONLY type authority
- No field may duplicate type authority (I1)
- Signal/field/event are derived, NOT stored
- "Changing this would make this a different type system"

**Key Terms**: CanonicalType, DerivedKind, Invariant

**Dependencies**: None (foundation of everything)

**Dependents**: All other topics

**Unresolved Issues**: None

---

### 02: Type System (`type-system`)

**Primary Sources**: 00-exhaustive-type-system.md, 01-CanonicalTypes.md, SPRINT-core-types-PLAN, SPRINT-constructors-helpers-PLAN, SPRINT-unit-restructure-PLAN

**T1 (Foundational)** - `t1_canonical-type.md`:
- CanonicalType = { payload, unit, extent }
- PayloadType closed set: float | int | bool | vec2 | vec3 | color | cameraProjection
- **RESOLVED C1**: Axis representation is `Axis<T, V> = { kind: 'var'; var: V } | { kind: 'inst'; value: T }`
- **RESOLVED C2**: UnitType has 8 structured kinds (none, scalar, norm01, count, angle, time, space, color); NO var

**T2 (Structural)** - `t2_extent-axes.md`:
- 5-axis Extent structure
- Axis polymorphism pattern: `Axis<T, V>` with var/inst
- Default canonicalization rules

**T2 (Structural)** - `t2_derived-classifications.md`:
- deriveKind() function: event -> field -> signal precedence
- **RESOLVED C3**: `tryGetManyInstance` + `requireManyInstance` (replaces spec's `getManyInstance`)
- isSignalType / isFieldType / isEventType boolean helpers
- requireSignalType / requireFieldType / requireEventType assertion helpers
- payloadStride(payload) computed helper

**T3 (Optional)** - `t3_const-value.md`:
- ConstValue discriminated union
- constValueMatchesPayload() validation

**Key Terms**: CanonicalType, PayloadType, UnitType, Extent, ConstValue, DerivedKind

**Dependencies**: [principles]

**Dependents**: [axes], [validation], [migration]

**Unresolved Issues**: None

---

### 03: Extent Axes (`axes`)

**Primary Sources**: 11-Perspective.md, 12-Branch.md, 15-FiveAxesTypeSystem-Conclusion.md, SPRINT-core-types-PLAN

**T1 (Foundational)** - `t1_axis-invariants.md`:
- I1: Single authority - no duplicate storage
- I2: Only explicit ops change axes
- I3: Axis enforcement is centralized
- I4: State is scoped by axes
- I5: Const literal matches payload

**T2 (Structural)** - `t2_cardinality.md`:
- CardinalityValue: zero | one | many(instanceRef)
- InstanceRef: `{ instanceId: InstanceId, domainTypeId: DomainTypeId }` (branded, no `kind` field)
- Instance identity lives ONLY here

**T2 (Structural)** - `t2_temporality.md`:
- TemporalityValue: continuous | discrete
- Event hard invariants: payload=bool, unit=none, temporality=discrete

**T2 (Structural)** - `t2_binding.md`:
- **RESOLVED A4**: BindingValue = unbound | weak | strong | identity (NO referent)
- Referent data moves to continuity policies / StateOp args
- Binding axis stays clean lattice with no IDs, pointers, or referents

**T2 (Structural)** - `t2_perspective.md`:
- **RESOLVED G1**: Full domain included
- v0: `{ kind: 'default' }`
- v1+: world | view(id) | screen(id)
- NOT about "2D vs 3D rendering API" - about coordinate frame semantics

**T2 (Structural)** - `t2_branch.md`:
- **RESOLVED G1**: Full domain included
- v0: `{ kind: 'default' }`
- v1+: main | preview(id) | checkpoint(id) | undo(id) | prediction(id) | speculative(id) | replay(id)

**Key Terms**: All axis types, InstanceRef, transform ops

**Dependencies**: [type-system]

**Dependents**: [validation]

**Unresolved Issues**: None

---

### 04: Validation (`validation`)

**Primary Sources**: 00-exhaustive-type-system.md, 05-LitmusTest.md, 99-INVARIANTS-FOR-USAGE.md, SPRINT-axis-validate-PLAN

**T1 (Foundational)** - `t1_enforcement-gate.md`:
- Single canonical enforcement point
- Runs after normalization + inference
- "No backend entry without passing validation"
- **LOCKED**: Enforce only TRUE invariants, not "convenient expectations"
- **NEW**: 17 guardrails from 99-INVARIANTS-FOR-USAGE.md incorporated
- **N1**: Guardrail #11 example needs update (`op` -> `kind`)

**T2 (Structural)** - `t2_axis-validate.md`:
- validateAxes() implementation
- AxisViolation diagnostic type
- MUST enforce: event payload/unit/temporality, field cardinality, signal temporality
- MUST NOT: inference, adapters, coercions, over-enforcing payload/unit combos

**T3 (Optional)** - `t3_diagnostics.md`:
- Error message formats
- AxisInvalid diagnostic category

**Key Terms**: validateAxes, AxisViolation, AxisInvalid

**Dependencies**: [type-system], [axes]

**Dependents**: [migration] (gates ValueExpr work)

**Unresolved Issues**: None (N1 resolved: guardrail #11 example updated to `kind`)

---

### 05: Migration Path (`migration`)

**Primary Sources**: 02-How-To-Get-There.md, 03-Types-Analysis.md, 06-DefinitionOfDone-90%.md, 07-DefinitionOfDone-100%.md, 09-NamingConvention.md, 10-RulesForNewTypes.md, all SPRINT plans

**T2 (Structural)** - `t2_value-expr.md`:
- ValueExpr unified IR (replaces SigExpr/FieldExpr/EventExpr)
- 6 base variants: const, external, intrinsic, kernel, state, time
- **RESOLVED A1**: Uses `kind` discriminant (consistent with all existing IR)
- **RESOLVED G2**: Total mapping — all 24 legacy variants map to 6 ValueExpr ops (no new variants)

**T2 (Structural)** - `t2_unit-restructure.md`:
- **RESOLVED C2**: UnitType from 16 flat kinds to 8 structured kinds
- NO `{ kind: 'var' }` in canonical type
- Structured nesting: angle(radians|degrees|phase01), time(ms|seconds), space(ndc|world|view, dims), color(rgba01)
- Mapping table: old flat -> new structured

**T2 (Structural)** - `t2_adapter-restructure.md`:
- **RESOLVED A2**: Full TypePattern/ExtentPattern/ExtentTransform restructure adopted
- Adapter matching purely on CanonicalType patterns
- purity: 'pure' and stability: 'stable' mandatory
- Adapter spec types in `src/blocks/`, not `src/graph/`

**T3 (Optional)** - `t3_definition-of-done.md`:
- 90% checklist (bulk work) and 100% checklist (CI gates)
- Ripgrep verification commands

**T3 (Optional)** - `t3_rules-for-new-types.md`:
- 12 rules preventing "old world" leakage
- Code review litmus tests

**Key Terms**: ValueExpr, migration phases, DoD

**Dependencies**: [validation], [axes]

**Dependents**: None (end of pipeline)

**Unresolved Issues**: None

---

## Topic Relationships

```
principles (T1)
    |
type-system <-- unit-restructure (migration/t2, RESOLVED C2)
    |
axes <- binding RESOLVED (no referent, A4)
     <- perspective/branch RESOLVED (full domains, G1)
    |
validation <- 17 guardrails (99-INVARIANTS-FOR-USAGE.md)
           <- N1: guardrail #11 example needs fix
    |
migration -> value-expr (RESOLVED A1: kind; RESOLVED G2: total mapping)
          -> adapter-restructure (RESOLVED A2: full restructure)
```

---

## Suggested Reading Order

### For Newcomers
1. SUMMARY (this context)
2. `principles/t1_single-authority.md` - the core idea
3. `type-system/t1_canonical-type.md` - the one true type (with C1, C2 decisions)
4. `type-system/t2_derived-classifications.md` - signal/field/event + try/require helpers
5. `axes/t1_axis-invariants.md` - the rules
6. GLOSSARY

### For Implementers
1. `axes/t1_axis-invariants.md` - know the rules
2. `validation/t1_enforcement-gate.md` - enforcement + 17 guardrails
3. `validation/t2_axis-validate.md` - enforcement implementation
4. `migration/t2_unit-restructure.md` - UnitType changes (RESOLVED C2)
5. `migration/t2_value-expr.md` - unified IR (RESOLVED A1; G2 still open)
6. `migration/t2_adapter-restructure.md` - adapter patterns (RESOLVED A2)
7. `migration/t3_rules-for-new-types.md` - governance
8. `appendices/reference-implementation.md` - exact code

---

## Source Assignment

| Source Document | Assigned To Topic | Coverage | Priority |
|-----------------|-------------------|----------|----------|
| 00-exhaustive-type-system.md | type-system, validation, appendices | Full - AUTHORITATIVE | P2 (spec) |
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
| 15-FiveAxesTypeSystem-Conclusion.md | principles, axes | Full - SUMMARY | P2 |
| **99-INVARIANTS-FOR-USAGE.md** | **validation** | **Full - NEW** | **P2** |
| EVALUATION-20260129-012028.md | appendices | Full - ASSESSMENT | P1 (canonical-type-system) |
| SPRINT-core-types-PLAN.md | type-system, axes | Full - LOCKED DECISIONS | P1 |
| SPRINT-constructors-helpers-PLAN.md | type-system | Full - LOCKED DECISIONS | P1 |
| SPRINT-value-expr-PLAN.md | migration | Partial - MEDIUM confidence | P1 |
| SPRINT-axis-validate-PLAN.md | validation | Full - LOCKED DECISIONS | P1 |
| SPRINT-unit-restructure-PLAN.md | migration | Full - LOCKED DECISIONS | P1 |
| SPRINT-adapter-spec-PLAN.md | migration | Full - RESOLVED A2 | P1 |
| SPRINT-cleanup-violations-PLAN.md | axes | Full - LOCKED DECISIONS | P1 |
| SPRINT-deprecate-old-PLAN.md | migration | Full | P1 |
| EVALUATION-2026-01-28-191553.md | (defer) | Superseded by 20260129 eval (A3 resolved) | P3 |
| EXPLORE-2026-01-28-191553.md | (defer) | Raw facts, already consumed by eval | P3 |

---

## Tier Distribution

- **T1 (Foundational)**: 4 files across 4 topics
  - Cannot change without making this a different system

- **T2 (Structural)**: 13 files across 4 topics
  - Can change, but it's work and affects many things

- **T3 (Optional)**: 4 files across 3 topics
  - Reference material, change freely if better approach found

---

## Notes for Final Generation

- All critical contradictions (C1-C3) are resolved - encyclopedia content is clear
- All high-impact ambiguities (A1-A4) are resolved - no blocking decisions remain
- All items resolved (14/14 questions + 7/7 editorial review items)
- The 99-INVARIANTS-FOR-USAGE.md guardrails should be incorporated into `validation/t1_enforcement-gate.md` as the operational enforcement rules
- The planning evaluation (20% alignment, A3 resolved) should be included as appendix
- Q1 resolution: CardinalityValue.zero is compile-time-only; needs `canonicalConst()` constructor and explicit lift ops in encyclopedia
- Q2 resolution: BindingValue is NOT a lattice; nominal tags with equality-only semantics. Remove "lattice" terminology
- N4 resolution: canonicalSignal default unit asymmetry is intentional; spec must document hard constraints on defaultUnitForPayload()
- N5 resolution: SigExprEventRead output is float scalar 0/1; G2 mapping entry updated with kernelId `eventReadScalar01`
