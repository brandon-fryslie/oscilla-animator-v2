---
topic: 01
name: Type System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: to-review
audited: 2026-01-23T12:00:00Z
item_count: 2
---

# Topic 01: Type System — Items for Review

These items diverge from spec but may represent improvements or valid alternatives.
User must decide: accept current approach (update spec), or fix code (revert to spec).

## Items

### R-1: Phase modeled as float+unit:phase01 rather than distinct PayloadType
**Spec says**: `phase` is a distinct PayloadType with stride=1 and wrap semantics
**Code does**: Phase is `float` with `unit:phase01` annotation — src/core/canonical-types.ts:117 explicitly says "Note: 'phase' is NOT a payload - it's float with unit:phase01"
**Why it might be better**: Unit system allows more nuanced type tracking (phase01, radians, degrees all on float). Prevents phase arithmetic enforcement at type level but enables richer unit safety.
**Question for user**: Should phase remain as float+unit (update spec) or become a distinct PayloadType (update code)?

### R-2: Unit type system (richer than spec's payload-only model)
**Spec says**: PayloadType alone determines value semantics. `unit` is a separate PayloadType for 0..1 clamped.
**Code does**: Full Unit discriminated union (scalar, norm01, phase01, radians, degrees, ms, seconds, count, ndc2, ndc3, world2, world3, rgba01) — src/core/canonical-types.ts:32-46
**Why it might be better**: Unit system provides richer semantic tracking without multiplying PayloadTypes. Enables type-safe conversions between units of same payload. More extensible.
**Question for user**: Should the spec be updated to reflect the Unit system, or should code revert to PayloadType-only model?
