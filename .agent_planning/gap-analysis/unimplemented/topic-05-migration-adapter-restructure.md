---
topic: 05c
name: Migration - Adapter Restructure
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/migration/t2_adapter-restructure.md
category: unimplemented
audited: 2026-01-29
item_count: 2
priority_reasoning: >
  The adapter system partially implements the spec but uses a simplified pattern
  matching system. Key structural elements (full ExtentPattern, ExtentTransform,
  AdapterSpecId, blockId branding) are missing or simplified.
---

# Topic 05c: Migration - Adapter Restructure — Unimplemented Gaps

## Items

### U-1: AdapterSpec is missing spec-required fields (id, name, blockId branding)
**Problem**: The spec requires `AdapterSpec` to have `id: AdapterSpecId`, `name: string`, `blockId: BlockId` (branded). The implementation has `blockType: string`, `inputPortId`, `outputPortId`, `description`, `purity`, `stability` — but no branded ID, no name field, and `blockType` is an unbranded string.
**Evidence**:
- `src/graph/adapters.ts:65-83` — `AdapterSpec` has `blockType: string` (not branded `BlockId`)
- Spec `t2_adapter-restructure.md:82-91` — Requires `id: AdapterSpecId`, `name: string`, `blockId: BlockId`
- Implementation has `purity: 'pure'` and `stability: 'stable'` (good — matches spec)
**Obvious fix?**: Partially — adding branded IDs is straightforward; restructuring the interface requires updating all adapter rules.

### U-2: ExtentPattern is simplified ('any' | Partial<Extent>) instead of per-axis patterns
**Problem**: The spec requires `ExtentPattern` to have individual pattern fields for each axis (`cardinality?: CardinalityPattern`, `temporality?: TemporalityPattern`, etc.), with support for wildcards and constrained ranges per axis. The implementation uses `'any' | Partial<Extent>` which is either "match everything" or "exact match on specified axes." The broadcast adapter rule has a TODO acknowledging this: `// TODO: card=one, tempo=continuous`.
**Evidence**:
- `src/graph/adapters.ts:35-37` — `ExtentPattern = 'any' | Partial<Extent>`
- Spec `t2_adapter-restructure.md:52-60` — Per-axis patterns with cardinality/temporality/binding/perspective/branch
- `src/graph/adapters.ts:247` — `extent: 'any'` with TODO comment for broadcast pattern
**Obvious fix?**: No — requires rethinking pattern matching system to support per-axis constraints.
