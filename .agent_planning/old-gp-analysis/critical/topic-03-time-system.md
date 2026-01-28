---
topic: 03
name: Time System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-25T23:00:00Z
item_count: 0
priority_reasoning: All critical time system items resolved. C-7, C-19, C-20, C-21, C-22 all DONE.
---

# Topic 03: Time System — Critical Gaps

## Remaining Items

(None — all resolved)

## Resolved Items

### C-7: normalizedIndex returns 0 for N=1 (spec says 0.5) ✅
**Status**: DONE (commit c3694de)
**Resolution**: Changed return value to 0.5 for single-element case.

### C-19: tMs type is float, spec says int ✅
**Status**: N/A (no change needed)
**Resolution**: tMs float is correct — sub-ms precision required for smooth animation. Spec is aspirational; float representation is canonical.

### C-20: Pulse fires only on phase wrap, not every frame ✅
**Status**: DONE (commit c3694de)
**Resolution**: Pulse now fires every frame as spec requires (frame-tick trigger).

### C-21: tMs monotonicity not enforced (I1 violation risk) ✅
**Status**: DONE (commit c3694de)
**Resolution**: tMs monotonicity enforced via Math.max guard.

### C-22: dt output port missing from TimeRoot block definition ✅
**Status**: DONE (commit c3694de)
**Resolution**: dt output added to TimeRoot block definition.
