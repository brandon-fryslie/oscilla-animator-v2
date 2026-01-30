---
topic: 05d
name: Migration - Definition of Done / Rules for New Types
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/migration/t3_definition-of-done.md
category: to-review
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: ["topic-04 (validation gate)", "topic-05a (unit restructure)", "topic-05b (ValueExpr)"]
blocks: []
priority: P5
---

# Context: Topic 05d — Definition of Done / Rules for New Types (To-Review)

## What the Spec Requires

1. **90% Done checklist**: 10 items covering type system migration completion.
2. **100% Done CI gates**: 8 grep-based checks + type checker + test suite.
3. **12 rules for new types**: Governance preventing regression after migration.
4. **Mechanical enforcement**: CI/lint gates for the 12 rules.

## Current State (Topic-Level)

### How It Works Now
The migration is approximately 50-60% complete based on the 90% checklist. Key foundational items are done (Axis<T,V>, ConstValue, removal of legacy type aliases, tryGet/requireManyInstance). Key structural items are NOT done (UnitType restructure, ValueExpr unification, validation gate wiring). The governance rules exist as documentation but have no automated enforcement.

### Patterns to Follow
- The project uses Vitest for testing
- No CI pipeline is currently configured (no `.github/workflows/` or similar)
- Build checks are done via `npm run typecheck` and `npm run test`

## Work Items

### WI-1: Clean up AxisTag alias in bridges.ts
**Category**: TO-REVIEW
**Priority**: P5
**Spec requirement**: `grep -r "AxisTag" src/` returns nothing.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/compiler/ir/bridges.ts` | Local AxisTag alias | 36 |
**Current state**: `type AxisTag<T> = Axis<T, never>` — local backward compat alias.
**Required state**: Remove alias, use `Axis<T, never>` directly.
**Suggested approach**: Replace the 0 usages of AxisTag in that file (it's defined but check if used locally). If unused, just delete it. If used, replace with `Axis<T, never>`.
**Depends on**: none
**Blocks**: 100% CI gate pass

### WI-2: Add grep-based CI gate script
**Category**: TO-REVIEW
**Priority**: P5
**Spec requirement**: Automated enforcement of migration completion checks.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| (new) `scripts/check-type-migration.sh` or `vitest` test | CI gate | new |
**Current state**: No automated checks.
**Required state**: Script or test that runs the 8 grep checks from the spec and fails if any match.
**Suggested approach**: Create a Vitest test file that programmatically greps for forbidden patterns and asserts they don't exist. This is more maintainable than a bash script and runs with `npm run test`.
**Depends on**: All other migration items (this is the final validation)
**Blocks**: none
