---
topic: 05a
name: Migration - UnitType Restructure
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/migration/t2_unit-restructure.md
category: critical
audited: 2026-01-29
item_count: 2
priority_reasoning: >
  UnitType still uses the OLD flat structure (16+ separate kinds) instead of the
  spec's 8 structured kinds. This affects every adapter rule, every unit comparison,
  and every type display. It's a foundational structural divergence.
---

# Topic 05a: Migration - UnitType Restructure — Critical Gaps

## Items

### C-1: UnitType uses 16+ flat kinds instead of 8 structured kinds
**Problem**: The spec requires UnitType to be restructured from flat kinds (`phase01`, `radians`, `degrees`, `deg`, `ms`, `seconds`, `ndc2`, `ndc3`, `world2`, `world3`, `rgba01`) into 8 structured kinds (`angle`, `time`, `space`, `color` with sub-parameters). The implementation still uses the old flat structure.
**Evidence**:
- `src/core/canonical-types.ts:44-59` — UnitType is a flat union with 15 variants
- Spec `t2_unit-restructure.md:39-48` — Requires 8 structured kinds with nesting
- All adapter rules in `src/graph/adapters.ts:110-257` use flat unit kinds like `{ kind: 'phase01' }`
**Obvious fix?**: No — this is a pervasive structural change affecting every file that constructs or matches on UnitType (57+ files reference UnitType or its constructors).

### C-2: Duplicate angle unit kinds (degrees + deg)
**Problem**: UnitType has both `{ kind: 'degrees' }` and `{ kind: 'deg' }` as separate variants. The spec consolidates these into `{ kind: 'angle', unit: 'degrees' }`. Having two representations for the same semantic unit violates single source of truth.
**Evidence**:
- `src/core/canonical-types.ts:49-51` — Both `degrees` and `deg` exist
- `src/core/canonical-types.ts:67-68` — Both `unitDegrees()` and `unitDeg()` constructors
- `unitsEqual()` at line 93 compares by `kind` only, so `degrees !== deg`
**Obvious fix?**: Yes — as part of the restructure, collapse both into `{ kind: 'angle', unit: 'degrees' }`. In the interim, could alias one to the other.
