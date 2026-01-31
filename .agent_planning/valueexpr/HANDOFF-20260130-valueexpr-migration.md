# Handoff: ValueExpr Type System Migration

**Date**: 2026-01-30
**Branch**: `bmf_type_system_refactor`
**Last Commit**: `8877807`
**Author**: Human + Agent collaboration

---

## The Problem You're Inheriting

You are picking up a **type system migration** that is structurally complete but has zero runtime consumers. The new system (ValueExpr) is defined, tested, and enforced — but nothing in the runtime actually uses it. The old system (SigExpr/FieldExpr/EventExpr) runs all production code, passes all 2004 tests, and is deeply wired into the builder, evaluators, and executor.

**This creates a specific and dangerous dynamic for AI agents.**

---

## The Agent Regression Problem

### Why Agents Undo New Work

When an AI agent works on this codebase, it encounters two competing forces:

1. **The old system works.** SigExpr, FieldExpr, EventExpr are used everywhere. Tests pass. TypeScript compiles. The builder emits them, the evaluators dispatch on them, the executor runs them. Every signal in the codebase says "this is the correct system."

2. **The new system has no consumers.** ValueExpr is defined in `value-expr.ts` but nothing imports it except tests. No builder emits ValueExpr objects. No evaluator dispatches on them. No step references them. From the agent's perspective, ValueExpr looks like dead code or an abandoned experiment.

**The natural agent behavior is to reinforce what works and remove what doesn't.** When an agent encounters a compilation error or test failure related to the new types, its instinct is to "fix" it by reverting to the old types — because that's what makes tests pass. This has already happened multiple times in this migration:

- Agents re-added `instanceId` to FieldExpr builders because legacy tests expected it
- Agents imported `deriveKind` because existing code used it
- Agents constructed SigExpr objects when ValueExpr was intended

### The Bootstrap Problem

A type system migration has a chicken-and-egg problem:

```
To prove the new system works → you need consumers
To write consumers         → you need the new system to be stable
To keep it stable          → you need tests that enforce it
To write enforcement tests → you need to understand what "correct" means
To understand "correct"    → you need consumers that exercise the system
```

At the start of migration, the new system is pure abstraction. There is no runtime evidence it works. The only thing protecting it is enforcement tests that assert structural properties (shape, fields, discriminants) — but NOT behavioral properties (actual evaluation, correct results, frame rendering).

An agent that prioritizes "make tests pass" over "advance the migration" will always regress toward the old system, because that's where the passing tests are.

### How We've Protected Against This So Far

Three enforcement test files prevent the most common regressions:

| File | What it protects | How it works |
|------|-----------------|--------------|
| `no-instanceid-on-fieldexpr.test.ts` | instanceId must not appear on FieldExpr objects | `Object.keys()` runtime check on every FieldExpr variant built by IRBuilderImpl |
| `no-deriveKind-imports.test.ts` | deriveKind must not be imported in production code | `grep`-based scan of all .ts files |
| `value-expr-invariants.test.ts` | ValueExpr must have exactly 9 kinds, type on every variant, no `op` discriminant | Compile-time `Exclude` checks + runtime structural assertions |

**These tests are necessary but insufficient.** They protect the *shape* of the new system but not its *usage*. An agent can satisfy all three tests while never actually using ValueExpr for anything.

---

## What Is Done (Genuinely Complete)

### Type Infrastructure
- **ValueExpr canonical table**: 9 kinds, every variant has `readonly type: CanonicalType`, no `instanceId`, no `op` discriminant
- **File**: `src/compiler/ir/value-expr.ts` (241 lines)
- **ValueExprId**: Single definition in `src/compiler/ir/Indices.ts`, re-exported from `value-expr.ts`

### Builder Cleanup
- **instanceId removed** from all 6 FieldExpr builder methods in IRBuilderImpl
- **inferFieldInstance/inferZipInstance** deleted (0 grep matches)
- Instance identity derived from `requireManyInstance(expr.type)` — canonical path

### Type System Cleanup
- **deriveKind** deleted from production code (function removed from `canonical-types.ts`)
- **tryDeriveKind** deleted
- All 6 dead helper functions removed (`requireSignalType`, `isSignalType`, etc.)
- Direct axis dispatch via `requireInst()` at all former call sites

### Test Health
- **2004 tests pass, 0 failures**
- **0 TypeScript errors**
- **3 enforcement test files** (19 tests total)

### Commits (chronological)
```
63fa20c feat: canonicalConst uses cardinalityZero, deprecate DerivedKind
277b2c7 feat: Define ValueExpr canonical table with 9 top-level kinds
56941dc refactor: Remove instanceId from FieldExpr variants (type definitions)
7a1c189 fix: Restore Step types removed by over-scoped commit
2cc3f2c fix: Remove phantom instanceId from IRBuilderImpl builders
01473ed fix: Resolve instance name mismatch (block defs vs runtime)
78d28ab refactor: Replace all deriveKind consumers with direct axis checks
0013b52 fix: Resolve 3 pre-existing test failures
103c022 test: Add ValueExpr structural invariant tests
6b00f2a refactor: Remove ValueExprId duplication
47d43ee refactor: Delete dead deriveKind helper functions
8c19efc chore: Delete bridges.ts.bak
8877807 test: Add compile-time exhaustiveness check
```

---

## What Is NOT Done (The Actual Migration)

### Zero Production Consumers
No file outside `__tests__` imports from `value-expr.ts`. The entire runtime uses legacy types:

| Component | Currently Uses | Should Use |
|-----------|---------------|------------|
| IRBuilderImpl | SigExpr, FieldExpr, EventExpr | ValueExpr |
| ScheduleExecutor | SigExprId, FieldExprId, EventExprId | ValueExprId |
| SignalEvaluator | SigExpr (10 kinds) | ValueExpr (signal extent) |
| Materializer | FieldExpr (8 kinds) | ValueExpr (field extent) |
| EventEvaluator | EventExpr (5 kinds) | ValueExpr (event extent) |
| RuntimeState cache | sigValues[], fieldBuffers | unified cache |

### Open Design Questions

1. **Array structure**: ValueExpr uses recursive nesting (`args: ValueExpr[]`) while legacy uses dense arrays with ID references (`input: SigExprId`). A flattening pass may be needed, or ValueExpr's structure may need to change to use IDs.

2. **SigExprSlot**: This legacy variant reads from ValueSlots directly. It has no ValueExpr equivalent — slot reads are a materialization detail, not an expression. When migrating SignalEvaluator, this case must be handled specially (likely moved to ScheduleExecutor step handling).

3. **Return type incompatibility**: SignalEvaluator returns `number`, Materializer returns `Float32Array`, EventEvaluator returns `boolean`. A unified evaluator would need a discriminated union return, adding overhead in the hot loop. Three evaluators accepting ValueExpr is probably the right answer.

4. **Migration strategy**: Research doc explored 4 options. Recommendation was Option B (dual-emit: IRBuilder emits both legacy + ValueExpr, migrate consumers one at a time). But the user flagged scope concerns — this is a multi-session project.

### Research Document
Full analysis in: `.agent_planning/valueexpr/SPRINT-20260130-211000-valueexpr-consumer-PLAN.md`

---

## Rules of Engagement for the Next Agent

### DO
- **Read the enforcement tests first.** They define what "correct" looks like. If you're unsure whether a change is forward or backward, check if the enforcement tests still pass.
- **Write a new enforcement test BEFORE making any structural change.** The test must fail on old behavior. Only then make the code change. This prevents "I'll add the test later" drift.
- **Check import graphs.** If you're about to import SigExpr/FieldExpr/EventExpr in new code, stop. You should be importing ValueExpr instead. The legacy types are for existing code only.
- **Verify with `Object.keys()` at runtime**, not just TypeScript types. TypeScript allows excess properties on object literals assigned to broader types — it won't catch phantom fields.
- **Commit frequently** with descriptive messages that explain whether the change advances the migration or maintains compatibility.

### DO NOT
- **Do not "fix" compilation errors by reverting to legacy types.** If new code using ValueExpr doesn't compile, the fix is to make ValueExpr work — not to switch back to SigExpr.
- **Do not add `instanceId` to any expression object.** Instance identity lives in `CanonicalType` and is extracted via `requireManyInstance(expr.type)`. The enforcement test in `no-instanceid-on-fieldexpr.test.ts` will catch this, but don't even try.
- **Do not import `deriveKind`.** It's been deleted. Dispatch on extent axes directly via `requireInst()` and check `cardinality`/`temporality`.
- **Do not treat ValueExpr as dead code.** It is the TARGET of the migration. Every existing SigExpr/FieldExpr/EventExpr is scheduled for replacement.
- **Do not add new SigExpr/FieldExpr/EventExpr variants.** If a new expression kind is needed, add it to ValueExpr.
- **Do not satisfy a failing test by reintroducing removed code.** If a test fails, determine: does the test assert OLD behavior (update the test) or does it reveal a real bug in the NEW code (fix the code)?

### The Critical Litmus Test

Before any change, ask: **"Does this move us toward fewer expression types, or more?"**

- Fewer types (consolidating toward ValueExpr) = forward progress
- More types (adding back legacy patterns, creating adapters) = regression
- Same types (maintaining status quo) = acceptable only for bugfixes, not features

---

## Key Files Quick Reference

### New System (ValueExpr)
| File | Purpose |
|------|---------|
| `src/compiler/ir/value-expr.ts` | ValueExpr type definitions (9 kinds) |
| `src/compiler/ir/Indices.ts:45` | ValueExprId branded type |
| `src/compiler/ir/__tests__/value-expr-invariants.test.ts` | Structural enforcement |
| `src/compiler/ir/__tests__/no-instanceid-on-fieldexpr.test.ts` | instanceId enforcement |
| `src/compiler/__tests__/no-deriveKind-imports.test.ts` | deriveKind ban enforcement |

### Legacy System (to be replaced)
| File | Purpose |
|------|---------|
| `src/compiler/ir/types.ts` | SigExpr, FieldExpr, EventExpr definitions |
| `src/compiler/ir/IRBuilderImpl.ts` | Builder that emits legacy objects |
| `src/runtime/SignalEvaluator.ts` | Evaluates SigExpr (returns number) |
| `src/runtime/Materializer.ts` | Evaluates FieldExpr (returns Float32Array) |
| `src/runtime/EventEvaluator.ts` | Evaluates EventExpr (returns boolean) |
| `src/runtime/ScheduleExecutor.ts` | Dispatches steps using typed IDs |

### Rules & Spec
| File | Purpose |
|------|---------|
| `.claude/rules/TYPE-SYSTEM-INVARANTS.md` | 17 invariant rules for the type system |
| `src/compiler/ir/value-expr.ts:1-18` | Design principles comment |

---

## Planning Documents

| File | Contents |
|------|----------|
| `.agent_planning/valueexpr/SPRINT-20260130-180000-valueexpr-completion-PLAN.md` | Completed sprint plan (WI-1 through WI-5) |
| `.agent_planning/valueexpr/SPRINT-20260130-210000-valueexpr-cleanup-PLAN.md` | Completed cleanup sprint |
| `.agent_planning/valueexpr/SPRINT-20260130-211000-valueexpr-consumer-PLAN.md` | NEXT: Consumer migration plan (MEDIUM confidence) |
| `.agent_planning/valueexpr/EVALUATION-20260130-203000.md` | Most recent evaluation |

---

## The Meta-Problem: Why This Document Exists

Type system migrations are adversarial to AI agents. The old system has:
- Passing tests (2004 of them)
- Working runtime (animations render correctly)
- Deeply integrated consumers (builder, evaluators, executor, cache)
- Consistent patterns (every agent has seen SigExpr hundreds of times in context)

The new system has:
- Type definitions
- Enforcement tests (that verify shape, not behavior)
- Zero consumers
- No runtime evidence it works

An agent optimizing for "green tests, clean compile" will always prefer the old system. The only way to prevent regression is:

1. **Enforcement tests that ban the old patterns** (we have 3 files doing this)
2. **This document**, which explains the intent so the agent understands that ValueExpr is the destination, not a dead end
3. **Incremental migration** where each step creates a new consumer that exercises the new system, gradually shifting the balance of evidence from old → new

The migration is won when more tests exercise ValueExpr than legacy types. Until then, vigilance is required.
