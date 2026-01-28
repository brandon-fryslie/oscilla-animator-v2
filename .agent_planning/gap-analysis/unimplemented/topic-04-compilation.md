---
topic: 04
name: Compilation
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: unimplemented
audited: 2026-01-28T14:01:00Z
item_count: 2
resolved_since_last: [U-17, U-18, U-19, U-20, U-33]
blocks_critical: []
---

# Topic 04: Compilation — Unimplemented

## ✅ RESOLVED: U-17 (Hash-consing I13)
**Fixed 2026-01-28** — IRBuilderImpl has hash cache infrastructure (sigExprCache, fieldExprCache, eventExprCache). Applied to 25 builder methods (11 SigExpr, 10 FieldExpr, 4 EventExpr). Comprehensive test suite (33 tests). Expected 30-50% expression reduction in typical patches.

## ✅ RESOLVED: U-18 (ReduceOp field→scalar)
**Fixed 2026-01-28** — Added SigExprReduceField interface, IRBuilder.reduceField() method, block registration. 8 comprehensive tests. Runtime evaluation deferred pending materialize() access enhancement.

## ✅ RESOLVED: U-19 (Stride-aware field allocation)
**Fixed in Frontend/Backend refactor** — `IRBuilderImpl.allocSlot(stride)` supports vec2=2, vec3=3, color=4.

## ✅ RESOLVED: U-20 (Structured compilation errors)
**Fixed** — `src/compiler/diagnosticConversion.ts` has `ERROR_CODE_TO_DIAGNOSTIC_CODE` mapping with semantic codes.

## ✅ RESOLVED: U-33 (Explicit slot declarations)
**Fixed 2026-01-28** — Added ScalarSlotDecl and FieldSlotDecl type aliases. Added getScalarSlots() and getFieldSlots() convenience accessors to ScheduleIR.

---

## Remaining Items

### U-32: DomainDecl in NormalizedGraph
**Spec requirement**: NormalizedGraph should have `domains: DomainDecl[]` as top-level field. Domain info collected during normalization.
**Scope**: Add domains extraction to normalization pipeline
**Blocks**: nothing — standalone
**Evidence of absence**: NormalizedPatch (normalize-indexing.ts:67-79) has no domains array; domain info only in InstanceDecl at IR level

### U-34: wireState/bus anchor IDs
**Spec requirement**: Anchor formats `wireState:<wireId>` and `bus:<busId>:<pub|sub>:<typeKey>` for derived blocks
**Scope**: Graph normalization for wire-state and bus blocks
**Blocks**: R-3 decision (bus/rail architecture)
**Evidence of absence**: Only defaultSource anchors implemented (`_ds_<blockId>_<portId>`). No wireState or bus anchor generation.
