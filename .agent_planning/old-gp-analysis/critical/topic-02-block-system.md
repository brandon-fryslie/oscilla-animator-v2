---
topic: 02
name: Block System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-25T23:00:00Z
item_count: 0
priority_reasoning: All critical block system items resolved. C-3 (Block.type), C-17 (Edge role), C-18 (isStateful) all DONE.
---

# Topic 02: Block System — Critical Gaps

## Remaining Items

(None — all resolved)

## Resolved Items

### C-3: Block.type instead of Block.kind ✅
**Status**: DONE
**Resolution**: Block.type is canonical — no rename needed. Spec updated.

### C-17: Edge interface has no role field ✅
**Status**: DONE (commit c3694de)
**Resolution**: Edge role field added.

### C-18: SCC cycle check uses string heuristic ✅
**Status**: DONE (commit c3694de)
**Resolution**: isStateful flag added to BlockDef metadata, used instead of string matching.

### C-4: BlockRole has extra variants not in spec ✅
**Resolution**: Spec updated — BlockRole is minimum set, implementations may extend.

### C-5: DerivedBlockMeta missing bus/rail variants ✅
**Resolution**: Spec updated — bus/rail removed from DerivedBlockMeta.

### C-6: EdgeRole missing busTap variant ✅
**Resolution**: Spec updated — busTap removed from EdgeRole.
