---
command: /canonicalize-architecture design-docs/canonical-types/
files: 00-exhaustive-type-system.md 01-CanonicalTypes.md 02-How-To-Get-There.md 03-Types-Analysis.md 04-CanonicalTypes-Analysis.md 05-LitmusTest.md 06-DefinitionOfDone-90%.md 07-DefinitionOfDone-100%.md 09-NamingConvention.md 10-RulesForNewTypes.md 11-Perspective.md 12-Branch.md 14-Binding-And-Continuity.md 15-FiveAxesTypeSystem-Conclusion.md
indexed: true
source_files:
  - design-docs/canonical-types/00-exhaustive-type-system.md
  - design-docs/canonical-types/01-CanonicalTypes.md
  - design-docs/canonical-types/02-How-To-Get-There.md
  - design-docs/canonical-types/03-Types-Analysis.md
  - design-docs/canonical-types/04-CanonicalTypes-Analysis.md
  - design-docs/canonical-types/05-LitmusTest.md
  - design-docs/canonical-types/06-DefinitionOfDone-90%.md
  - design-docs/canonical-types/07-DefinitionOfDone-100%.md
  - design-docs/canonical-types/09-NamingConvention.md
  - design-docs/canonical-types/10-RulesForNewTypes.md
  - design-docs/canonical-types/11-Perspective.md
  - design-docs/canonical-types/12-Branch.md
  - design-docs/canonical-types/14-Binding-And-Continuity.md
  - design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md
---

# Topic Breakdown & Tier Classification: CanonicalType System

Generated: 2026-01-29T07:57:23Z
Supersedes: None (first run)

## Encyclopedia Structure

The canonical specification will be organized as:

```
CANONICAL-canonical-types-20260129/
├── INDEX.md
├── TIERS.md
├── principles/
│   └── t1_single-authority.md       # Foundational
├── type-system/
│   ├── t1_canonical-type.md         # Foundational: core type shape
│   ├── t2_extent-axes.md            # Structural: 5 axes
│   ├── t2_derived-classifications.md # Structural: signal/field/event
│   └── t3_const-value.md            # Optional: literal representation
├── axes/
│   ├── t1_axis-invariants.md        # Foundational: hard rules
│   ├── t2_cardinality.md            # Structural
│   ├── t2_temporality.md            # Structural
│   ├── t2_binding.md                # Structural
│   ├── t2_perspective.md            # Structural
│   └── t2_branch.md                 # Structural
├── validation/
│   ├── t1_enforcement-gate.md       # Foundational: single point
│   ├── t2_axis-validate.md          # Structural: implementation
│   └── t3_diagnostics.md            # Optional: error messages
├── migration/
│   ├── t2_value-expr.md             # Structural: unified IR
│   ├── t2_phased-approach.md        # Structural: how to get there
│   ├── t3_definition-of-done.md     # Optional: checklists
│   └── t3_rules-for-new-types.md    # Optional: governance
├── GLOSSARY.md
├── RESOLUTION-LOG.md
└── appendices/
    ├── source-map.md
    └── reference-implementation.md   # From 00-exhaustive-type-system.md
```

---

## Topics and Tier Breakdown

| # | Topic Slug | Title | T1 Files | T2 Files | T3 Files |
|---|------------|-------|----------|----------|----------|
| 01 | `principles` | Core Principles | single-authority | - | - |
| 02 | `type-system` | Type System | canonical-type | extent-axes, derived-classifications | const-value |
| 03 | `axes` | Extent Axes | axis-invariants | cardinality, temporality, binding, perspective, branch | - |
| 04 | `validation` | Validation | enforcement-gate | axis-validate | diagnostics |
| 05 | `migration` | Migration Path | - | value-expr, phased-approach | definition-of-done, rules-for-new-types |

---

## Detailed Topic Outlines

### 01: Core Principles (`principles`)

**Primary Sources**: 05-LitmusTest.md, 15-FiveAxesTypeSystem-Conclusion.md

**T1 (Foundational)** - `t1_single-authority.md`:
- CanonicalType is the ONLY type authority
- No field may duplicate type authority
- Signal/field/event are derived, NOT stored
- "Changing this would make this a different type system"

**Key Terms**: CanonicalType, DerivedKind, Invariant

**Dependencies**: None (foundation of everything)

**Dependents**: All other topics

---

### 02: Type System (`type-system`)

**Primary Sources**: 00-exhaustive-type-system.md, 01-CanonicalTypes.md, 04-CanonicalTypes-Analysis.md

**T1 (Foundational)** - `t1_canonical-type.md`:
- CanonicalType = { payload, unit, extent }
- PayloadType closed set: float | int | bool | vec2 | vec3 | color | cameraProjection
- UnitType closed set: none | scalar | norm01 | angle | time
- "These primitives cannot change"

**T2 (Structural)** - `t2_extent-axes.md`:
- 5-axis Extent structure
- Axis<T, V> pattern for var vs instantiated
- Default canonicalization rules
- "Can add axes (with full audit), but 5-axis structure is architectural"

**T2 (Structural)** - `t2_derived-classifications.md`:
- deriveKind() function
- signal := cardinality=one, temporality=continuous
- field := cardinality=many(instance)
- event := temporality=discrete
- "Derivation rules can evolve but concept is structural"

**T3 (Optional)** - `t3_const-value.md`:
- ConstValue discriminated union
- constValueMatchesPayload() validation
- Implementation patterns
- "Representation details can change"

**Key Terms**: CanonicalType, PayloadType, UnitType, Extent, ConstValue

**Dependencies**: [principles]

**Dependents**: [axes], [validation], [migration]

---

### 03: Extent Axes (`axes`)

**Primary Sources**: 11-Perspective.md, 12-Branch.md, 15-FiveAxesTypeSystem-Conclusion.md

**T1 (Foundational)** - `t1_axis-invariants.md`:
- I1: Single authority - no duplicate storage
- I2: Only explicit ops change axes
- I3: Axis enforcement is centralized
- I4: State is scoped by axes
- I5: Const literal matches payload
- "These invariants are non-negotiable"

**T2 (Structural)** - `t2_cardinality.md`:
- CardinalityValue: zero | one | many(instanceRef)
- InstanceRef structure
- Instance identity lives ONLY here
- getManyInstance() helper

**T2 (Structural)** - `t2_temporality.md`:
- TemporalityValue: continuous | discrete
- Clock semantics (frame vs tick)
- Event invariants: payload=bool, unit=none

**T2 (Structural)** - `t2_binding.md`:
- BindingValue: unbound | weak | strong | identity
- Continuity/projection semantics
- Lane reindexing protection

**T2 (Structural)** - `t2_perspective.md`:
- SpaceValue: world | view(id) | screen(id)
- Coordinate frame semantics
- Transform ops: WorldToView, ViewToWorld, etc.
- Propagation rules P1-P3

**T2 (Structural)** - `t2_branch.md`:
- BranchSpace: main | preview | checkpoint | undo | prediction | speculative | replay
- State scoping by branch
- Branch ops: Fork, Adopt, Merge
- Policy layer for allowed imports

**Key Terms**: All axis types, InstanceRef, transform ops

**Dependencies**: [type-system]

**Dependents**: [validation]

---

### 04: Validation (`validation`)

**Primary Sources**: 00-exhaustive-type-system.md (axis-validate.ts section), 05-LitmusTest.md

**T1 (Foundational)** - `t1_enforcement-gate.md`:
- Single canonical enforcement point
- Runs after normalization + inference
- "No backend entry without passing validation"
- "This architectural decision cannot change"

**T2 (Structural)** - `t2_axis-validate.md`:
- validateAxes() implementation
- AxisViolation diagnostic type
- What it MUST check vs MUST NOT do
- Integration with frontend pipeline

**T3 (Optional)** - `t3_diagnostics.md`:
- Error message formats
- UI repair affordances
- Diagnostic categories

**Key Terms**: validateAxes, AxisViolation, AxisInvalid

**Dependencies**: [type-system], [axes]

**Dependents**: [migration]

---

### 05: Migration Path (`migration`)

**Primary Sources**: 02-How-To-Get-There.md, 03-Types-Analysis.md, 06-DefinitionOfDone-90%.md, 07-DefinitionOfDone-100%.md, 09-NamingConvention.md, 10-RulesForNewTypes.md

**T2 (Structural)** - `t2_value-expr.md`:
- ValueExpr unified IR
- Replaces SigExpr/FieldExpr/EventExpr
- Op variants: const, external, intrinsic, kernel, state, time
- Integration as backend lowering target

**T2 (Structural)** - `t2_phased-approach.md`:
- Phase 0: Formalize "kind" as derived
- Phase 1: CanonicalType for all ports
- Phase 2: ValueExpr as backend target
- Phase 3: Move semantics to kernels/adapters
- Phase 4: Unified runtime evaluators
- Phase 5: Delete old IR families

**T3 (Optional)** - `t3_definition-of-done.md`:
- 90% checklist (bulk work)
- 100% checklist (CI gates)
- Ripgrep verification commands

**T3 (Optional)** - `t3_rules-for-new-types.md`:
- 12 rules preventing "old world" leakage
- Code review litmus tests
- Naming conventions

**Key Terms**: ValueExpr, migration phases, DoD

**Dependencies**: [validation], [axes]

**Dependents**: None (end of pipeline)

---

## Topic Relationships

```
principles (T1)
    ↓
type-system ←───────────────────────────────────┐
    ↓                                           │
axes ← perspective, branch specs                │
    ↓                                           │
validation ← axis-validate implementation       │
    ↓                                           │
migration → ValueExpr, phased approach ─────────┘
              (references all above)
```

---

## Suggested Reading Order

### For Newcomers
1. SUMMARY (this doc)
2. `principles/t1_single-authority.md` - the core idea
3. `type-system/t1_canonical-type.md` - the one true type
4. `type-system/t2_derived-classifications.md` - signal/field/event
5. `axes/t1_axis-invariants.md` - the rules
6. GLOSSARY

### For Implementers
1. `axes/t1_axis-invariants.md` - know the rules
2. `validation/t2_axis-validate.md` - enforcement implementation
3. `migration/t2_value-expr.md` - unified IR
4. `migration/t3_rules-for-new-types.md` - governance
5. `appendices/reference-implementation.md` - exact code

---

## Source Assignment

| Source Document | Assigned To Topic | Coverage |
|-----------------|-------------------|----------|
| 00-exhaustive-type-system.md | type-system, validation, appendices | Full - AUTHORITATIVE |
| 01-CanonicalTypes.md | type-system | Full |
| 02-How-To-Get-There.md | migration | Full |
| 03-Types-Analysis.md | migration (context) | Full |
| 04-CanonicalTypes-Analysis.md | type-system | Full |
| 05-LitmusTest.md | principles, validation | Full |
| 06-DefinitionOfDone-90%.md | migration | Full |
| 07-DefinitionOfDone-100%.md | migration | Full |
| 09-NamingConvention.md | migration | Full |
| 10-RulesForNewTypes.md | migration | Full |
| 11-Perspective.md | axes | Full |
| 12-Branch.md | axes | Full |
| 14-Binding-And-Continuity.md | axes | Empty (placeholder) |
| 15-FiveAxesTypeSystem-Conclusion.md | principles, axes | Full - SUMMARY |

---

## Tier Distribution

- **T1 (Foundational)**: 4 files across 4 topics
  - Cannot change without making this a different system
  
- **T2 (Structural)**: 11 files across 4 topics
  - Can change, but it's work and affects many things
  
- **T3 (Optional)**: 4 files across 3 topics
  - Reference material, change freely if better approach found
