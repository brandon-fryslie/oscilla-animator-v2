---
topic: 04
name: Compilation
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: unimplemented
audited: 2026-01-23T12:00:00Z
item_count: 7
blocks_critical: []
---

# Topic 04: Compilation — Unimplemented

## Items

### U-17: Hash-consing (I13)
**Spec requirement**: Structural sharing via ExprId canonicalization. Identical sub-expressions share evaluation.
**Scope**: new pass or builder enhancement
**Blocks**: nothing — optimization, not correctness
**Evidence of absence**: No deduplication of expression IDs in IRBuilderImpl

### U-18: ReduceOp for field→scalar aggregation
**Spec requirement**: Combine step with ReduceOp to aggregate field values into scalar (e.g., sum of all lane values)
**Scope**: new expression type + materializer support
**Blocks**: nothing — standalone
**Evidence of absence**: No "ReduceOp" or "reduce" operation in field expression types

### U-19: Stride-aware field allocation
**Spec requirement**: Field buffers allocated with `laneCount × stride` floats where stride depends on PayloadType (vec2=2, color=4)
**Scope**: Buffer allocation in Materializer/BufferPool
**Blocks**: C-2 (PayloadType completeness — vec3 needs stride=3)
**Evidence of absence**: Field allocation doesn't multiply by stride for multi-component types; uses objects Map for vec2/color

### U-20: Structured compilation errors (I19)
**Spec requirement**: First-class error taxonomy — DiagnosticCode enum, TargetRef required, domain/severity classification
**Scope**: Diagnostics infrastructure exists (src/diagnostics/) but not integrated into compilation as structured errors
**Blocks**: nothing — standalone
**Evidence of absence**: Compilation errors are thrown exceptions, not structured Diagnostic objects in compiler output

### U-32: DomainDecl in NormalizedGraph
**Spec requirement**: NormalizedGraph should have `domains: DomainDecl[]` as top-level field. Domain info collected during normalization.
**Scope**: Add domains extraction to normalization pipeline
**Blocks**: nothing — standalone
**Evidence of absence**: NormalizedPatch (pass3-indexing.ts:17) has no domains array; domain info only in InstanceDecl at IR level

### U-33: Explicit ScalarSlotDecl/FieldSlotDecl in Schedule
**Spec requirement**: Schedule should declare `{ scalarSlots: ScalarSlotDecl[], fieldSlots: FieldSlotDecl[] }` explicitly
**Scope**: Add slot declaration arrays to ScheduleIR
**Blocks**: nothing — organizational
**Evidence of absence**: ScheduleIR has steps, stateSlotCount, instances, stateMappings but no explicit slot declarations

### U-34: wireState/bus anchor IDs
**Spec requirement**: Anchor formats `wireState:<wireId>` and `bus:<busId>:<pub|sub>:<typeKey>` for derived blocks
**Scope**: Graph normalization for wire-state and bus blocks
**Blocks**: R-3 decision (bus/rail architecture)
**Evidence of absence**: Only defaultSource anchors implemented (`_ds_<blockId>_<portId>`). No wireState or bus anchor generation.
