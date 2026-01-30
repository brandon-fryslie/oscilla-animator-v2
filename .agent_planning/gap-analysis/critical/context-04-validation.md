---
topic: 04
name: Validation (Enforcement Gate, Axis Validation, Diagnostics)
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/validation/
category: critical
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: ["topic-05-migration (ValueExpr unification depends on validated types)"]
priority: P1
---

# Context: Topic 04 — Validation (Critical)

## What the Spec Requires

1. **Single enforcement gate**: Exactly ONE place validates axis-shape contracts. Runs after normalization and type inference, before backend compilation.
2. **`validateAxes(exprs: readonly ValueExpr[]): AxisViolation[]`** function signature (or equivalent on CanonicalType[] until ValueExpr exists).
3. **Event invariants enforced**: temporality=discrete => payload=bool AND unit=none.
4. **Field invariants enforced**: cardinality must be many(instance).
5. **Signal invariants enforced**: cardinality must be one, temporality must be continuous.
6. **No var escape**: All axes must be `{ kind: 'inst' }` (no unresolved type variables).
7. **No bypass**: No debug/preview/partial compile mode skips validation. Unvalidated output is explicitly tagged.
8. **`AxisViolation` diagnostic type**: `{ exprIndex, kind, message }`.
9. **`AxisInvalid` diagnostic category**: Source context (block ID, port ID), expected vs actual CanonicalType, suggested fix.
10. **Diagnostics reference CanonicalType only**: No hidden types in diagnostic fields (Guardrail 15).
11. **Local asserts allowed**: Small boundary asserts are OK as defense-in-depth, but they must be strict subsets of what the gate checks.

## Current State (Topic-Level)

### How It Works Now
The file `src/compiler/frontend/axis-validate.ts` exists with `validateTypes()` and `validateType()` functions that correctly implement the core checks (event/field/signal invariants). However, these functions are **dead code** — they are never imported or called from any compilation pipeline. The frontend pipeline in `src/compiler/frontend/index.ts` runs normalization, type constraints, type graph, and cycle analysis but skips validation entirely. Backend compilation in `src/compiler/compile.ts` also has no validation step.

The underlying assert functions (`assertSignalType`, `assertFieldType`, `assertEventType`) in `src/core/canonical-types.ts` are properly implemented and tested. The validation module delegates to these correctly.

### Patterns to Follow
- The frontend pipeline uses a `FrontendResult.backendReady` flag to gate backend compilation
- Each frontend step captures its output via `compilationInspector.capturePass()`
- Errors are collected as `FrontendError[]` with `kind`, `message`, `blockId?`, `portId?`

## Work Items

### WI-1: Wire validateTypes into the frontend pipeline
**Category**: CRITICAL
**Priority**: P1
**Spec requirement**: Single enforcement gate runs after type inference, before backend.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/compiler/frontend/index.ts` | Frontend pipeline entry | 102-194 |
| `src/compiler/frontend/axis-validate.ts` | Validation implementation | 36-68 |
| `src/compiler/frontend/analyze-type-graph.ts` | Produces TypedPatch (step before validation) | all |
**Current state**: `validateTypes` exists but is never called.
**Required state**: After `pass2TypeGraph` produces TypedPatch, extract all resolved port types and run `validateTypes()`. If violations found, add them to `errors` and set `backendReady = false`.
**Suggested approach**: In `compileFrontend()`, after Step 3 (Type Graph), add a Step 3.5 that collects all resolved CanonicalTypes from the TypedPatch and calls `validateTypes()`. Map violations to `FrontendError` with block/port context from the TypedPatch. Capture pass output via inspector.
**Depends on**: none
**Blocks**: Safe backend compilation (currently backend may receive invalid types)

### WI-2: Add source context to AxisViolation
**Category**: CRITICAL
**Priority**: P2
**Spec requirement**: AxisInvalid diagnostics include source context (block ID, port ID), expected vs actual.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/compiler/frontend/axis-validate.ts` | Violation type definition | 26-30 |
| `src/compiler/frontend/index.ts` | Where violations get context | after WI-1 |
**Current state**: `AxisViolation` has `{ typeIndex, kind, message }` — no source context, no expected/actual types.
**Required state**: `AxisViolation` should include optional `blockId`, `portId`, `expected: CanonicalType`, `actual: CanonicalType` fields, or the mapping from violation to source context should happen at the call site.
**Suggested approach**: Two options: (1) Enrich `validateTypes` to accept `{ type: CanonicalType, blockId: string, portId: string }[]` and include context in violations, or (2) Keep `validateTypes` pure and map context at the call site in `compileFrontend()`. Option 2 is cleaner — the validator stays focused on type validation, the pipeline adds provenance.
**Depends on**: WI-1
**Blocks**: Useful error messages for users

### WI-3: Rename `typeIndex` to `exprIndex` (or document divergence)
**Category**: CRITICAL (minor — but needed for spec alignment)
**Priority**: P3
**Spec requirement**: `AxisViolation.exprIndex` field name.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/compiler/frontend/axis-validate.ts` | Field definition | 27 |
**Current state**: Uses `typeIndex`.
**Required state**: Uses `exprIndex` (or a documented rationale for divergence).
**Suggested approach**: When ValueExpr is implemented (Topic 05), rename to `exprIndex`. Until then, keep `typeIndex` but add a TODO comment referencing the spec.
**Depends on**: Topic 05 (ValueExpr)
**Blocks**: none
