---
topic: 01
name: Type System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: to-review
audited: 2026-01-24T12:00:00Z
item_count: 1
---

# Topic 01: Type System — Items for Review

These items diverge from spec but may represent improvements or valid alternatives.
User must decide: accept current approach (update spec), or fix code (revert to spec).

## Items

### R-2: Unit type system (richer than spec's payload-only model)
**Spec says**: PayloadType alone determines value semantics. `unit` is a separate PayloadType for 0..1 clamped.
**Code does**: Full Unit discriminated union (scalar, norm01, phase01, radians, degrees, ms, seconds, count, ndc2, ndc3, world2, world3, rgba01) — src/core/canonical-types.ts:32-46
**Why it might be better**: Unit system provides richer semantic tracking without multiplying PayloadTypes. Enables type-safe conversions between units of same payload. More extensible.
**Question for user**: Should the spec be updated to reflect the Unit system, or should code revert to PayloadType-only model?

RESOLUTION: Update spec to use Unit system

## Resolved

### R-1: Phase modeled as float+unit:phase01 rather than distinct PayloadType
**Resolution**: User decided float+unit is correct. Spec updated to remove `phase` as a distinct PayloadType.

