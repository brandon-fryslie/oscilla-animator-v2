---
topic: 02
name: Block System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-23T12:00:00Z
item_count: 6
priority_reasoning: Block.type vs .kind naming violation. BlockRole extra variants. DerivedBlockMeta missing bus/rail. Edge has no role field. SCC check uses string heuristic.
---

# Topic 02: Block System — Critical Gaps

## Items

### C-3: Block.type instead of Block.kind
**Problem**: Patch.ts uses `readonly type: BlockType` where spec explicitly says field must be `kind` (NOT 'type'). This is listed as a deprecated term in the spec.
**Evidence**: src/graph/Patch.ts:40 — `readonly type: BlockType`
**Obvious fix?**: Yes — rename `.type` to `.kind` across codebase. Grep shows ~50 usages.

### C-4: BlockRole has extra variants not in spec
**Problem**: BlockRole includes `timeRoot`, `bus`, `domain`, `renderer` as top-level kinds. Spec only defines `user` and `derived`. These extras should be `derived` with appropriate meta.
**Evidence**: src/types/index.ts:279-285 — 6 variants vs spec's 2
**Obvious fix?**: No — need to decide if these are valid extensions or should be collapsed into `derived` with appropriate DerivedBlockMeta kinds.

### C-5: DerivedBlockMeta missing bus/rail variants
**Problem**: DerivedBlockMeta has `defaultSource | wireState | lens | adapter`. Spec requires `defaultSource | wireState | bus | rail | lens`. The code comment says "bus/rail variants removed - buses are now regular blocks" but spec still lists them.
**Evidence**: src/types/index.ts:299-304
**Obvious fix?**: No — need to reconcile spec vs implementation decision. If buses are truly regular blocks, spec should be updated.

### C-6: EdgeRole missing busTap variant
**Problem**: EdgeRole has `user | default | auto`. Spec requires `user | default | busTap | auto`. Code comment says "busTap variant removed - buses are now regular blocks."
**Evidence**: src/types/index.ts:341-344
**Obvious fix?**: No — same decision as C-5.

### C-17: Edge interface has no role field
**Problem**: Spec says every edge has an explicit role (user | default | busTap | auto). Edge interface in Patch.ts has id, from, to, enabled, sortKey but NO role field. EdgeRole type is defined but never stored on edges.
**Evidence**: src/graph/Patch.ts:72
**Obvious fix?**: Yes — add `role: EdgeRole` field to Edge interface.

### C-18: SCC cycle check uses string heuristic
**Problem**: Pass 5 checks for state boundary using string matching: `blockDef.type.includes('State') || blockDef.type.includes('Delay')`. Should use a `capability: 'state'` flag from BlockDef metadata. This is fragile and will miss new stateful blocks.
**Evidence**: src/compiler/passes-v2/pass5-scc.ts:117
**Obvious fix?**: Yes — add `stateful: boolean` flag to BlockDef, check that instead of string matching.
