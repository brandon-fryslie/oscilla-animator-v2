---
topic: 03
name: Time System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: to-review
audited: 2026-01-23T12:00:00Z
item_count: 1
---

# Topic 03: Time System — Items for Review

## Items

### R-5: Phase as float+unit:phase01 vs distinct PayloadType
**Spec says**: Phase is a distinct PayloadType with stride=1 and phase arithmetic rules
**Code does**: Phase is `float` with `unit:phase01` — deliberately chosen (see R-1 in Topic 01). Phase arithmetic enforcement not possible at PayloadType level.
**Why it might be better**: Same as R-1. Unit system provides richer annotation without multiplying payload types.
**Question for user**: (Same as R-1) — decision on phase representation propagates here.
