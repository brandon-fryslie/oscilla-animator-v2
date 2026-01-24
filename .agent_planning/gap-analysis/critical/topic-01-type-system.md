---
topic: 01
name: Type System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-25T23:00:00Z
item_count: 0
priority_reasoning: All critical type system items resolved. C-1 (CombineMode), C-2 (vec3), C-23 (stride table) all DONE.
---

# Topic 01: Type System — Critical Gaps

## Remaining Items

(None — all resolved)

## Resolved Items

### C-1: CombineMode is flat string union, not discriminated union ✅
**Status**: DONE (commit c3694de)
**Resolution**: CombineMode expanded with mul/layer/or/and modes and semantic category map.

### C-2: PayloadType missing vec3; shape→shape2d rename ✅
**Status**: DONE (commit 09e404f)
**Resolution**: vec3 added to PayloadType. All layout kernels produce vec3 stride-3. shape→shape2d rename WON'T FIX (97 uses/34 files, pure churn, no functional value).

### C-23: No stride table in type system ✅
**Status**: DONE (commit c3694de)
**Resolution**: PAYLOAD_STRIDE constant and strideOf() function added to canonical-types.ts.
