---
topic: 02
name: Block System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: unimplemented
audited: 2026-01-23T12:00:00Z
item_count: 5
blocks_critical: []
---

# Topic 02: Block System — Unimplemented

## Items

### U-4: Lag stateful primitive
**Spec requirement**: Lag block — smooth toward target (stateful, per-lane)
**Scope**: new block definition in blocks/ directory
**Blocks**: nothing — standalone additive feature
**Evidence of absence**: No matches for "Lag" as block type in src/blocks/

### U-5: Phasor stateful primitive
**Spec requirement**: Phasor block — 0..1 phase accumulator with wrap (stateful, per-lane)
**Scope**: new block definition in blocks/ directory
**Blocks**: nothing — standalone additive feature
**Evidence of absence**: No matches for "Phasor" in src/blocks/

### U-6: SampleAndHold stateful primitive
**Spec requirement**: SampleAndHold block — latch on trigger (stateful, per-lane). Requires event system (EventPayload[]).
**Scope**: new block definition + event model dependency
**Blocks**: Depends on runtime event system (Topic 05, C-8)
**Evidence of absence**: No matches for "SampleAndHold" or "SampleHold" in src/blocks/

### U-7: PortBinding with CombineMode on ports
**Spec requirement**: Block interface should have `inputs: PortBinding[]` and `outputs: PortBinding[]` where each PortBinding has `{ id, dir, type, combine }`
**Scope**: refactor Block/port types
**Blocks**: C-1 (CombineMode structure)
**Evidence of absence**: Current Block has `inputPorts: ReadonlyMap<string, InputPort>` without CombineMode — src/graph/Patch.ts:51

### U-8: Noise, Length, Normalize MVP blocks
**Spec requirement**: Noise (seeded per-lane random), Length (vec2→float magnitude), Normalize (vec2→vec2 unit vector)
**Scope**: new block definitions (3 blocks)
**Blocks**: nothing — standalone additive features
**Evidence of absence**: No matches for these as block type registrations in src/blocks/registry.ts
