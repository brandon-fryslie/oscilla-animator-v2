---
topic: 02
name: Block System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: to-review
audited: 2026-01-23T12:00:00Z
item_count: 2
---

# Topic 02: Block System — Items for Review

## Items

### R-3: Bus/rail as regular blocks instead of derived block meta
**Spec says**: DerivedBlockMeta includes `bus` and `rail` variants; EdgeRole includes `busTap`
**Code does**: Comments explicitly say "bus/rail variants removed - buses are now regular blocks" and "busTap variant removed" — src/types/index.ts:298, 340
**Why it might be better**: Treating buses as regular blocks simplifies the derived block machinery. Bus behavior can be achieved through the block type system without special-casing.
**Question for user**: Was removing bus/rail from DerivedBlockMeta intentional? Should spec be updated to match, or should code restore these variants?

### R-4: BlockRole with extra top-level variants (timeRoot, bus, domain, renderer)
**Spec says**: BlockRole is only `user | derived`
**Code does**: BlockRole has 6 variants: `user | timeRoot | bus | domain | renderer | derived`
**Why it might be better**: Explicit top-level roles make it easier for the editor to identify special blocks without inspecting DerivedBlockMeta. Reduces nesting.
**Question for user**: Should these extra roles remain (update spec) or collapse into `derived` with appropriate meta?
