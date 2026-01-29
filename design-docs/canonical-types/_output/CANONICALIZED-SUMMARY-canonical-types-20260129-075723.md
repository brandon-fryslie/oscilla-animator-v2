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

# Canonical Architecture Summary: CanonicalType System

Generated: 2026-01-29T07:57:23Z
Supersedes: None (first run)
Documents Analyzed: 14 files in design-docs/canonical-types/

## Executive Summary

The CanonicalType system defines a **single type authority** for all values in the system: `CanonicalType = { payload, unit, extent }` where extent contains 5 orthogonal axes (cardinality, temporality, binding, perspective, branch). The core principle is that "signal/field/event" are NOT separate type systems—they are derived classifications from the extent axes.

The documents establish a comprehensive migration path from the current split IR (SigExpr/FieldExpr/EventExpr) to a unified ValueExpr model where every expression carries its CanonicalType. This enables axis enforcement at a single frontend validation gate, preventing invalid axis combinations from reaching the backend.

Key invariants: (I1) No field may duplicate type authority—derive instead of store; (I2) Only explicit ops change axes; (I3) Centralized axis enforcement; (I4) State is scoped by branch/instance; (I5) Const literal shape matches payload kind via discriminated union.

## Document Purposes

| Document | Purpose |
|----------|---------|
| 00-exhaustive-type-system.md | **AUTHORITATIVE** reference implementation with exact code |
| 01-CanonicalTypes.md | Core spec: CanonicalType becomes the whole truth |
| 02-How-To-Get-There.md | Phased migration without rewrite |
| 03-Types-Analysis.md | Analysis of current types.ts gaps |
| 04-CanonicalTypes-Analysis.md | How to consolidate overlapping types |
| 05-LitmusTest.md | Hard invariants for code review |
| 06-DefinitionOfDone-90%.md | Bulk work completion checklist |
| 07-DefinitionOfDone-100%.md | Full completion gates (CI-enforceable) |
| 09-NamingConvention.md | Naming rules for new types |
| 10-RulesForNewTypes.md | 12 rules preventing "old world" leakage |
| 11-Perspective.md | Perspective axis specification |
| 12-Branch.md | Branch/history axis specification |
| 14-Binding-And-Continuity.md | (Empty/placeholder) |
| 15-FiveAxesTypeSystem-Conclusion.md | **FINAL CONTRACT** summary |

## Architecture Overview

### The One True Type

```
CanonicalType = { payload, unit, extent }
extent = { cardinality, temporality, binding, perspective, branch }
```

### Derived Classifications (NOT stored)

- **signal** := cardinality=one, temporality=continuous
- **field** := cardinality=many(instance), temporality=continuous  
- **event** := temporality=discrete (payload=bool, unit=none as hard invariants)

### Axis Domains

| Axis | Values |
|------|--------|
| Cardinality | zero \| one \| many(instanceRef) |
| Temporality | continuous \| discrete |
| Binding | unbound \| weak \| strong \| identity |
| Perspective | world \| view(id) \| screen(id) |
| Branch | main \| preview(id) \| checkpoint(id) \| undo(id) \| prediction(id) \| speculative(id) \| replay(id) |

## Key Components

### 1. core/ids.ts (Source of Truth for Branded IDs)
- InstanceId, DomainTypeId, BlockId, PortId, WireId, KernelId, ValueExprId, ValueSlot
- All axis variable IDs: CardinalityVarId, TemporalityVarId, BindingVarId, PerspectiveVarId, BranchVarId

### 2. core/canonical-types.ts
- CanonicalType interface
- PayloadType: float | int | bool | vec2 | vec3 | color | cameraProjection
- UnitType: none | scalar | norm01 | angle(radians|degrees|phase01) | time(ms|seconds)
- Extent with 5 axes
- Canonical constructors: canonicalSignal(), canonicalField(), canonicalEventOne(), canonicalEventField()
- Derivation helpers: deriveKind(), getManyInstance(), assertSignalType/Field/Event()
- ConstValue discriminated union (NOT number|string|boolean)

### 3. compiler/ir/value-expr.ts (Unified Expression IR)
- ValueExpr union: const | external | intrinsic | kernel | state | time
- Every expression has `type: CanonicalType`
- Replaces SigExpr/FieldExpr/EventExpr as backend target

### 4. compiler/frontend/axis-validate.ts (Single Enforcement Point)
- validateAxes(exprs): AxisViolation[]
- Pure checker: NO inference, NO adapters, NO coercions
- Output: AxisInvalid diagnostic category

## Data Flow

```
Patch Graph → Frontend Normalization → Type Inference → axis-validate.ts → Backend Lowering → Runtime
                  ↓                         ↓                 ↓
            adapter insertion         resolve vars      reject invalid
            composite expansion       unify types       single gate
```

## Invariants

From 15-FiveAxesTypeSystem-Conclusion.md:

| ID | Invariant |
|----|-----------|
| I1 | **Single authority**: No field may duplicate type authority in CanonicalType |
| I2 | **Only explicit ops change axes**: Changes must be visible blocks/ops |
| I3 | **Axis enforcement is centralized**: One frontend validation gate |
| I4 | **State is scoped by axes**: Storage keyed by branch + instance |
| I5 | **Const literal shape matches payload**: ConstValue is discriminated union |

## Canonicalization Status

- Fully Resolved: 14 (all documents are internally consistent)
- Pending Questions: 0
- Ambiguous Terms: 0 (glossary is complete)
- Topics Identified: 5

## Recommendations for Next Steps

1. **No contradictions or ambiguities found** - documents form a coherent specification
2. Proceed directly to FINAL run to generate the encyclopedia structure
3. The gap analysis in `.agent_planning/gap-analysis/SUMMARY.md` already tracks implementation work
