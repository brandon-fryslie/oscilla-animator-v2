---
parent: ../INDEX.md
topic: migration
tier: 2
---

# Migration: UnitType Restructure (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [CanonicalType](../type-system/t1_canonical-type.md)

---

## Overview

The UnitType is being restructured from 16+ flat kinds to 8 structured kinds. This affects every adapter rule, every unit comparison, and every type display in the system.

## Resolution C2: 8 Structured Kinds

### Old (Flat — 16+ kinds)

```typescript
// DEPRECATED
type UnitType =
  | { kind: 'none' } | { kind: 'scalar' } | { kind: 'norm01' }
  | { kind: 'count' } | { kind: 'deg' } | { kind: 'rad' }
  | { kind: 'phase01' } | { kind: 'ms' } | { kind: 'seconds' }
  | { kind: 'ndc2' } | { kind: 'ndc3' } | { kind: 'world2' }
  | { kind: 'world3' } | { kind: 'view2' } | { kind: 'view3' }
  | { kind: 'rgba01' }
  | { kind: 'var'; id: string }  // REMOVED
  ;
```

### New (Structured — 8 kinds)

```typescript
type UnitType =
  | { kind: 'none' }
  | { kind: 'scalar' }
  | { kind: 'norm01' }
  | { kind: 'count' }
  | { kind: 'angle'; unit: 'radians' | 'degrees' | 'phase01' }
  | { kind: 'time'; unit: 'ms' | 'seconds' }
  | { kind: 'space'; space: 'ndc' | 'world' | 'view'; dims: 2 | 3 }
  | { kind: 'color'; space: 'rgba01' };
```

### Mapping Table

| Old Flat Kind | New Structured Kind |
|---------------|-------------------|
| `none` | `{ kind: 'none' }` |
| `scalar` | `{ kind: 'scalar' }` |
| `norm01` | `{ kind: 'norm01' }` |
| `count` | `{ kind: 'count' }` |
| `deg` | `{ kind: 'angle', unit: 'degrees' }` |
| `rad` | `{ kind: 'angle', unit: 'radians' }` |
| `phase01` | `{ kind: 'angle', unit: 'phase01' }` |
| `ms` | `{ kind: 'time', unit: 'ms' }` |
| `seconds` | `{ kind: 'time', unit: 'seconds' }` |
| `ndc2` | `{ kind: 'space', space: 'ndc', dims: 2 }` |
| `ndc3` | `{ kind: 'space', space: 'ndc', dims: 3 }` |
| `world2` | `{ kind: 'space', space: 'world', dims: 2 }` |
| `world3` | `{ kind: 'space', space: 'world', dims: 3 }` |
| `view2` | `{ kind: 'space', space: 'view', dims: 2 }` |
| `view3` | `{ kind: 'space', space: 'view', dims: 3 }` |
| `rgba01` | `{ kind: 'color', space: 'rgba01' }` |
| `var` | **REMOVED** — unit variables in inference-only wrappers |

### Key Changes

1. **Nesting**: Related units group under a parent kind (angle, time, space, color)
2. **No var**: `{ kind: 'var'; id: string }` is completely removed from UnitType. Unit variables exist only in solver-internal data structures.
3. **count added**: `{ kind: 'count' }` was missing from spec but present in implementation and planning

### Benefits

- Adapter matching can operate on "is this an angle?" rather than checking 3 separate kinds
- Unit conversion within a family (radians↔degrees) is structurally encoded
- The flat explosion of `ndc2/ndc3/world2/world3/view2/view3` collapses to parameterized `space`

---

## See Also

- [CanonicalType](../type-system/t1_canonical-type.md) - UnitType is part of the foundational type
- [Adapter Restructure](./t2_adapter-restructure.md) - Adapters operate on structured units
