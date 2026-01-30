---
topic: 05c
name: Migration - Adapter Restructure
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/migration/t2_adapter-restructure.md
category: unimplemented
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: ["topic-05a (unit restructure — adapters match on unit kinds)"]
blocks: []
priority: P4
---

# Context: Topic 05c — Adapter Restructure (Unimplemented)

## What the Spec Requires

1. `TypePattern` with optional `payload`, `unit`, `extent` fields (omitted = match anything).
2. `ExtentPattern` with per-axis patterns (cardinality, temporality, binding, perspective, branch).
3. `ExtentTransform` declaring exactly which axes an adapter modifies.
4. `AdapterSpec` with `id: AdapterSpecId`, `name`, `from: TypePattern`, `to: TypePattern`, `transform: ExtentTransform`, `purity: 'pure'`, `stability: 'stable'`, `blockId: BlockId`.
5. Adapter matching is purely on CanonicalType patterns — no special-casing by node type.
6. Adapters live in `src/blocks/`, not `src/graph/adapters.ts`.
7. Auto-insert is optional UX policy, separate from type soundness.

## Current State (Topic-Level)

### How It Works Now
The adapter system in `src/graph/adapters.ts` works and is functional. It uses:
- `TypePattern`: payload (PayloadType|'same'|'any'), unit (UnitType|'same'|'any'), extent (ExtentPattern)
- `ExtentPattern`: `'any' | Partial<Extent>` — binary (match all or exact match)
- `AdapterSpec`: `blockType`, `inputPortId`, `outputPortId`, `description`, `purity`, `stability`
- `AdapterRule`: combines `from: TypePattern`, `to: TypePattern`, `adapter: AdapterSpec`
- Pattern matching uses `patternMatches()` with JSON.stringify for extent comparison

All 10 adapter rules are correctly defined with `purity: 'pure'` and `stability: 'stable'`. The broadcast adapter has a known TODO for extent pattern precision.

### Patterns to Follow
- Adapter rules are defined as a static array, ordered by specificity (first match wins)
- `findAdapter()` is the single lookup function
- Adapter insertion happens in normalization (`src/compiler/frontend/normalize-adapters.ts`)

## Work Items

### WI-1: Add branded IDs and spec-aligned fields to AdapterSpec
**Category**: UNIMPLEMENTED
**Priority**: P4
**Spec requirement**: `id: AdapterSpecId`, `name: string`, `blockId: BlockId` (branded).
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/graph/adapters.ts` | AdapterSpec interface + rules | 65-258 |
| `src/types/index.ts` | BlockId branded type | 130-138 |
**Current state**: `blockType: string` (unbranded), no `id` or `name`.
**Required state**: Branded `blockId: BlockId`, branded `id: AdapterSpecId`, `name: string` added.
**Suggested approach**: Define `AdapterSpecId` branded type. Add `id` and `name` to AdapterSpec. Change `blockType` to `blockId: BlockId`. Update all 10 adapter rules with IDs and names.
**Depends on**: none
**Blocks**: none

### WI-2: Implement per-axis ExtentPattern
**Category**: UNIMPLEMENTED
**Priority**: P4
**Spec requirement**: ExtentPattern with individual axis patterns supporting wildcards and constraints.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/graph/adapters.ts` | ExtentPattern type + matching | 35-37, 278-297 |
**Current state**: `'any' | Partial<Extent>` — no per-axis patterns.
**Required state**: Per-axis patterns with wildcard/specific matching for each of the 5 axes.
**Suggested approach**: Define `CardinalityPattern`, `TemporalityPattern`, etc. as `'any' | specific_value`. Redefine `ExtentPattern` as `{ cardinality?: CardinalityPattern, ... }`. Update `extentMatches()` to check each axis individually. This fixes the broadcast TODO.
**Depends on**: WI-1
**Blocks**: Precise adapter matching for broadcast/reduce patterns
