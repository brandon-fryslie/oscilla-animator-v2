---
topic: 04
name: Compilation
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: trivial
audited: 2026-01-23T12:00:00Z
item_count: 5
---

# Topic 04: Compilation — Trivial Gaps

These are cosmetic divergences. No action needed unless doing a cleanup pass.

- `NormalizedGraph` → `NormalizedPatch`: src/graph/passes/pass3-indexing.ts:17
- Step kind names: spec `eval_scalar/eval_field/state_read/combine/render` → code `evalSig/materialize/stateWrite/render/continuityMapBuild/continuityApply/evalEvent`
- Slot allocation zero→inline: spec explicit; code uses SigExprConst with inline value (same behavior)
- `InstanceDecl.maxCount` → `InstanceDecl.count: number | 'dynamic'`: src/compiler/ir/types.ts:360
- DefaultSource anchor format: spec `defaultSource:<blockId>:<portName>` → code `_ds_<blockId>_<portId>`
