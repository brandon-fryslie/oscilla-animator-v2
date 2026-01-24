---
topic: 02
name: Block System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-24T12:00:00Z
item_count: 3
priority_reasoning: Block.type vs .kind naming violation. Edge has no role field. SCC check uses string heuristic.
---

# Topic 02: Block System — Critical Gaps

## Items

### C-3: Block.type instead of Block.kind
**Problem**: Patch.ts uses `readonly type: BlockType` where spec explicitly says field must be `kind` (NOT 'type'). This is listed as a deprecated term in the spec.
**Evidence**: src/graph/Patch.ts:40 — `readonly type: BlockType`
**Obvious fix?**: Yes — rename `.type` to `.kind` across codebase. Grep shows ~50 usages.

### C-17: Edge interface has no role field
**Problem**: Spec says every edge has an explicit role (user | default | auto). Edge interface in Patch.ts has id, from, to, enabled, sortKey but NO role field. EdgeRole type is defined but never stored on edges.
**Evidence**: src/graph/Patch.ts:72
**Obvious fix?**: Yes — add `role: EdgeRole` field to Edge interface.

### C-18: SCC cycle check uses string heuristic
**Problem**: Pass 5 checks for state boundary using string matching: `blockDef.type.includes('State') || blockDef.type.includes('Delay')`. Should use a `capability: 'state'` flag from BlockDef metadata. This is fragile and will miss new stateful blocks.
**Evidence**: src/compiler/passes-v2/pass5-scc.ts:117
**Obvious fix?**: Yes — add `stateful: boolean` flag to BlockDef, check that instead of string matching.

## Resolved

### C-4: BlockRole has extra variants not in spec
**Resolution**: Spec updated — BlockRole is minimum set, implementations may extend.

### C-5: DerivedBlockMeta missing bus/rail variants
**Resolution**: Spec updated — bus/rail removed from DerivedBlockMeta.

### C-6: EdgeRole missing busTap variant
**Resolution**: Spec updated — busTap removed from EdgeRole.
