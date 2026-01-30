---
topic: 05d
name: Migration - Definition of Done / Rules for New Types
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/migration/t3_definition-of-done.md
category: to-review
audited: 2026-01-29
item_count: 4
priority_reasoning: >
  These are tier-3 (optional) spec items. The checklists and governance rules are
  partially met. Some items are done, some are blocked by other migration work.
  Reviewing to track what's done vs what's pending.
---

# Topic 05d: Migration - Definition of Done / Rules for New Types — To-Review Gaps

## Items

### R-1: 90% Done checklist — partially met
**Status summary**:
- [x] CanonicalType uses `Axis<T, V>` (not AxisTag) — DONE at `src/core/canonical-types.ts:404`
- [ ] UnitType has 8 structured kinds — NOT DONE (still 15 flat kinds)
- [x] `tryGetManyInstance` + `requireManyInstance` replace `getManyInstance` — DONE (grep confirms no `getManyInstance` usage)
- [ ] ValueExpr unifies SigExpr/FieldExpr/EventExpr — NOT DONE
- [ ] All 24 legacy variants mapped to 6 ValueExpr ops — NOT DONE
- [ ] No `instanceId` field on expressions with `type: CanonicalType` — NOT DONE (3 field expr types have it)
- [ ] `validateAxes()` enforces axis-shape contracts — EXISTS but NOT WIRED IN
- [ ] AdapterSpec uses TypePattern/ExtentPattern with purity+stability — PARTIAL (has purity+stability, missing structured patterns)
- [x] ConstValue is discriminated union — DONE at `src/core/canonical-types.ts:291-298`
- [x] No `SignalType`, `PortType`, `FieldType`, `EventType` aliases — DONE (grep returns only function names like `isSignalType`, `assertFieldType` which are CanonicalType helpers, not separate type aliases)
**Evidence**: grep results from audit confirm above

### R-2: 100% Done CI gates — partially met
- [x] No `SignalType|PortType|FieldType|EventType` as type aliases — DONE
- [x] No `ResolvedPortType` — DONE
- [x] No `AxisTag` in production code — NEARLY DONE (only `src/compiler/ir/bridges.ts:36` has a local type alias `type AxisTag<T> = Axis<T, never>` for backward compat)
- [x] No `getManyInstance` without uppercase — DONE
- [ ] No `kind: 'var'` in UnitType — DONE (unitVar throws `never`)
- [ ] No `@ts-ignore` on type assertions — DONE (grep found 0 results)
- [ ] Coverage: axis validation >90% branch — UNKNOWN (validation not wired in, so likely 0% coverage of the validation codepath in production)

### R-3: AxisTag backward compat alias in bridges.ts
**Problem**: `src/compiler/ir/bridges.ts:36` defines `type AxisTag<T> = Axis<T, never>` as a local alias. The spec's CI gate requires `grep -r "AxisTag" src/` to return nothing.
**Evidence**: `src/compiler/ir/bridges.ts:36` — `type AxisTag<T> = Axis<T, never>;`
**Assessment**: This is a local type alias for backward compatibility, not a parallel type system. Low severity but should be cleaned up.

### R-4: Rules for New Types — governance rules not mechanically enforced
**Problem**: The spec defines 12 rules for new types (no parallel type structures, no flat unit kinds, no instance ID outside type, etc.). These are governance rules that should be enforced by CI/lint. Currently they exist only as documentation in `.claude/rules/TYPE-SYSTEM-INVARIANTS.md` but have no automated enforcement.
**Evidence**: No lint rules, no CI checks, no grep-based build gates exist for any of the 12 rules.
**Assessment**: The rules are documented and agents follow them, but there's no mechanical enforcement. This is a TO-REVIEW item because the spec says "optional" (Tier 3) and manual governance may be sufficient for now.
