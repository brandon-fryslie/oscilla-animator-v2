# CanonicalType System - Sprint Summary

**Generated**: 2026-01-29T01:27:00Z
**Total Sprints**: 8
**Total Work Items**: ~48

---

## Sprint Overview

| # | Sprint | Status | Confidence | Key Deliverables |
|---|--------|--------|------------|------------------|
| 1 | **core-types** | READY | HIGH:8, MED:0, LOW:0 | Axis<T,V>, per-axis aliases, InstanceRef fix, value types |
| 2 | **constructors-helpers** | READY | HIGH:9, MED:0, LOW:0 | canonicalSignal/Field/EventOne/EventField, deriveKind, assert helpers |
| 3 | **value-expr** | PARTIAL | HIGH:2, MED:4, LOW:0 | Unified ValueExpr table, replace SigExpr/FieldExpr/EventExpr |
| 4 | **axis-validate** | READY | HIGH:4, MED:0, LOW:0 | axis-validate.ts enforcement pass |
| 5 | **unit-restructure** | PARTIAL | HIGH:1, MED:2, LOW:0 | UnitType from 16 flat to 5 nested kinds |
| 6 | **adapter-spec** | PARTIAL | HIGH:1, MED:2, LOW:0 | ExtentPattern, TypePattern, AdapterSpec restructure |
| 7 | **cleanup-violations** | READY | HIGH:3, MED:0, LOW:0 | Remove instanceId from FieldExpr variants |
| 8 | **deprecate-old** | READY | HIGH:4, MED:0, LOW:0 | Deprecate old constructors, migrate call sites |

---

## Dependency Graph

```
core-types (no deps)
    ↓
constructors-helpers
    ↓
    ├── axis-validate
    ├── cleanup-violations
    ├── deprecate-old
    └── value-expr
            ↓
            └── [future: unified evaluation]

unit-restructure (depends on core-types)
    ↓
adapter-spec
```

---

## Recommended Execution Order

### Phase 1: Foundation (Must Do First)
1. **core-types** — Fix the fundamental Axis type system
2. **constructors-helpers** — Add canonical constructors and helpers

### Phase 2: Enforcement & Cleanup
3. **axis-validate** — Create enforcement pass
4. **cleanup-violations** — Remove instanceId from FieldExpr
5. **deprecate-old** — Migrate to canonical constructors

### Phase 3: Deeper Restructuring
6. **unit-restructure** — Restructure UnitType (needs decision)
7. **adapter-spec** — Restructure adapter types (needs decision)

### Phase 4: Major Architecture Change
8. **value-expr** — Unified expression table (largest change, needs research)

---

## Items Requiring User Decision

### 1. BindingValue Referent Field
**Current**: Has `referent: ReferentRef` on weak/strong/identity
**Spec**: No referent field

**Question**: Should we remove it or keep it?

### 2. UnitType Extra Kinds
**Current**: 16+ kinds including ndc2, world2, rgba01, count, var
**Spec**: 5 kinds (none, scalar, norm01, angle, time)

**Question**: Remove extras, extend spec, or keep both?

### 3. AdapterSpec Structure
**Current**: Separate AdapterRule + AdapterSpec with implementation details
**Spec**: Unified AdapterSpec with from/to/purity/stability

**Question**: Merge structures or keep separate?

---

## Files Summary

**To Create:**
- `src/compiler/ir/value-expr.ts`
- `src/compiler/frontend/axis-validate.ts`

**To Significantly Modify:**
- `src/core/canonical-types.ts` — Major restructure
- `src/compiler/ir/types.ts` — Remove instanceId, deprecate SigExpr/FieldExpr/EventExpr
- `src/graph/adapters.ts` — Restructure adapter types

---

## Estimated Scope

| Category | Items |
|----------|-------|
| Types to add/change | ~25 |
| Functions to add | ~15 |
| Functions to deprecate | ~8 |
| Files to create | 2 |
| Files to modify | ~20+ |
