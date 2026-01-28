---
topic: 03
name: Time System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: unimplemented
audited: 2026-01-23T12:00:00Z
item_count: 3
blocks_critical: []
---

# Topic 03: Time System — Unimplemented

## Items

### U-9: dt output port on TimeRoot
**Spec requirement**: TimeRoot should expose a `dt` output (frame delta time in ms)
**Scope**: Add output to TimeRoot block definition
**Blocks**: nothing — standalone
**Evidence of absence**: No "dt" output in TimeRoot block registration

### U-10: Rails as derived blocks
**Spec requirement**: Rails (time, phaseA, phaseB, pulse, palette) should be modeled as derived blocks with `{ kind: "rail"; target: { kind: "bus"; busId } }` meta
**Scope**: refactor TimeRoot outputs to derived blocks
**Blocks**: C-5 (DerivedBlockMeta missing bus/rail variants)
**Evidence of absence**: TimeRoot is a single block, not decomposed into rail-producing derived blocks

### U-11: PhaseToFloat/FloatToPhase conversion helpers
**Spec requirement**: Explicit conversion functions between phase and float representations
**Scope**: new functions in type system or expr module
**Blocks**: R-5 (phase representation decision)
**Evidence of absence**: No matches for "PhaseToFloat" or "FloatToPhase" in src/
