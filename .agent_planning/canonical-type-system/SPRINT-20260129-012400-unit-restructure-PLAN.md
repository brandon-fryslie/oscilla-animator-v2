# Sprint: unit-type-restructure - UnitType Restructure

**Generated**: 2026-01-29T01:23:00Z
**Confidence**: HIGH: 1, MEDIUM: 2, LOW: 0
**Status**: ✅ APPROVED (2026-01-29)

**Review Notes**:
- ✓ Correctly separating "unit taxonomy cleanup" from the rest of migration
- ✓ Plan acknowledges existing ad-hoc units and normalizes them
- **LOCKED**: NO `{ kind: 'var' }` in UnitType — unit variables belong in inference-only wrappers
- **LOCKED**: Structured unit domain for space types (see P1 below)

---

## Sprint Goal

Restructure `Unit` type from flattened 16+ kinds to spec's nested 5-kind structure.

---

## Scope

**Deliverables:**
1. Change Unit type structure
2. Update all Unit usages
3. Update adapters that reference unit kinds

---

## Work Items

### P0: Assess Impact of Unit Restructure

**Confidence**: MEDIUM

#### Unknowns to Resolve:
- How many files reference Unit kinds directly?
- Are the extra kinds (ndc2, ndc3, world2, world3, rgba01, count) needed?
- Is the `{ kind: 'var'; id: string }` needed for polymorphism?

**Current** (16+ flat kinds):
```typescript
export type Unit =
  | { readonly kind: 'none' }
  | { readonly kind: 'scalar' }
  | { readonly kind: 'norm01' }
  | { readonly kind: 'phase01' }
  | { readonly kind: 'radians' }
  | { readonly kind: 'degrees' }
  | { readonly kind: 'deg' }
  | { readonly kind: 'ms' }
  | { readonly kind: 'seconds' }
  | { readonly kind: 'count' }
  | { readonly kind: 'ndc2' }
  | { readonly kind: 'ndc3' }
  | { readonly kind: 'world2' }
  | { readonly kind: 'world3' }
  | { readonly kind: 'rgba01' }
  | { readonly kind: 'var'; readonly id: string };
```

**Spec** (5 structured kinds):
```typescript
export type UnitType =
  | { readonly kind: 'none' }
  | { readonly kind: 'scalar' }
  | { readonly kind: 'norm01' }
  | { readonly kind: 'angle'; readonly unit: 'radians' | 'degrees' | 'phase01' }
  | { readonly kind: 'time'; readonly unit: 'ms' | 'seconds' };
```

#### Exit Criteria:
- Full impact analysis
- Decision on extra kinds
- Decision on unit variables

**Acceptance Criteria:**
- [ ] Impact analysis complete
- [ ] Migration plan documented

---

### P1: Restructure UnitType

**Confidence**: HIGH (decision locked)

**DECISION LOCKED**: Structured closed unit domain, NO unit variables in canonical type.

**Rationale** (from user review):
> Do not add UnitType: { kind: 'var', ... } if your intent is "CanonicalType is the resolved contract." Unit variables belong in inference-only wrappers (like your old UnitVar / PayloadVar layer), not in the final canonical type.
>
> Represent the camera/world/ndc families as a closed structured unit domain.

**Target**:
```typescript
export type UnitType =
  // Dimensionless
  | { readonly kind: 'none' }                                        // bool, shape, events
  | { readonly kind: 'scalar' }                                      // generic number
  | { readonly kind: 'norm01' }                                      // [0,1] clamped
  | { readonly kind: 'count' }                                       // integer count/index
  
  // Angle (structured)
  | { readonly kind: 'angle'; readonly unit: 'radians' | 'degrees' | 'phase01' }
  
  // Time (structured)
  | { readonly kind: 'time'; readonly unit: 'ms' | 'seconds' }
  
  // Space (structured) - replaces ndc2/ndc3/world2/world3/view
  | { readonly kind: 'space'; readonly space: 'ndc' | 'world' | 'view'; readonly dims: 2 | 3 }
  
  // Color
  | { readonly kind: 'color'; readonly space: 'rgba01' };            // RGBA each in [0,1]
```

**What this replaces:**
- `{ kind: 'ndc2' }` → `{ kind: 'space', space: 'ndc', dims: 2 }`
- `{ kind: 'ndc3' }` → `{ kind: 'space', space: 'ndc', dims: 3 }`
- `{ kind: 'world2' }` → `{ kind: 'space', space: 'world', dims: 2 }`
- `{ kind: 'world3' }` → `{ kind: 'space', space: 'world', dims: 3 }`
- `{ kind: 'radians' }` → `{ kind: 'angle', unit: 'radians' }`
- `{ kind: 'degrees' }` → `{ kind: 'angle', unit: 'degrees' }`
- `{ kind: 'deg' }` → `{ kind: 'angle', unit: 'degrees' }` (alias removed)
- `{ kind: 'phase01' }` → `{ kind: 'angle', unit: 'phase01' }`
- `{ kind: 'ms' }` → `{ kind: 'time', unit: 'ms' }`
- `{ kind: 'seconds' }` → `{ kind: 'time', unit: 'seconds' }`
- `{ kind: 'rgba01' }` → `{ kind: 'color', space: 'rgba01' }`
- `{ kind: 'var', id: string }` → **REMOVED** (inference-only, not in canonical type)

**Acceptance Criteria:**
- [ ] UnitType restructured with structured sub-kinds
- [ ] NO `{ kind: 'var' }` variant in canonical UnitType
- [ ] All usages updated for new structure
- [ ] `deg` alias removed (use `{ kind: 'angle', unit: 'degrees' }`)

---

### P2: Update Adapters for New Unit Structure

**Confidence**: HIGH

Adapters match on unit kinds. Must update all adapter rules.

**Acceptance Criteria:**
- [ ] `src/graph/adapters.ts` updated for nested unit structure
- [ ] All adapter rules work with new structure

---

## Dependencies

- **core-types** — Should be done first

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking change to adapters | Careful review of adapter rules |
| Extra kinds may be needed | Option B keeps them |

---

## Files to Modify

- `src/core/canonical-types.ts` — Unit type
- `src/graph/adapters.ts` — Adapter rules
- All files that reference `unit.kind`
