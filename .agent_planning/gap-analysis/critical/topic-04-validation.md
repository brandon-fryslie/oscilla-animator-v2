---
topic: 04
name: Validation (Enforcement Gate, Axis Validation, Diagnostics)
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/validation/
category: critical
audited: 2026-01-29
item_count: 3
priority_reasoning: >
  The validation gate exists as code but is NOT wired into any compilation pipeline.
  This means invalid types can (and do) reach the backend, violating the single enforcement
  gate principle (Tier 1 invariant). The spec says "Nothing enters the backend without
  passing this gate." Currently, everything enters the backend without passing the gate.
---

# Topic 04: Validation — Critical Gaps

## Items

### C-1: validateTypes/validateType is never called in the compilation pipeline
**Problem**: `axis-validate.ts` defines `validateTypes()` and `validateType()` but neither function is imported or called anywhere in the codebase. The frontend pipeline (`src/compiler/frontend/index.ts`) runs normalization, type constraints, type graph, and cycle analysis — but never axis validation. The backend pipeline (`src/compiler/compile.ts`) similarly has no validation step.
**Evidence**:
- `src/compiler/frontend/axis-validate.ts:36` — `validateTypes` is defined and exported
- `src/compiler/frontend/index.ts` — no import of `axis-validate`, no call to `validateTypes`
- `src/compiler/compile.ts` — no import of `axis-validate`, no call to `validateTypes`
- `grep` for `validateTypes|validateType` in `src/compiler/` finds ONLY the definition file itself
**Obvious fix?**: Yes — add a validation step between frontend type resolution and backend lowering. The frontend's `compileFrontend()` should call `validateTypes()` on all resolved port types after pass2TypeGraph, and set `backendReady = false` if violations are found.

### C-2: AxisViolation uses `typeIndex` instead of spec's `exprIndex`
**Problem**: The spec defines `AxisViolation.exprIndex` (referencing expression index in IR), but the implementation uses `typeIndex` (referencing position in an array of CanonicalTypes). The current signature is `validateTypes(types: readonly CanonicalType[])` rather than the spec's `validateAxes(exprs: readonly ValueExpr[])`. Since ValueExpr doesn't exist yet (see Topic 05), the function validates types directly, but the field name and semantics diverge from spec.
**Evidence**:
- `src/compiler/frontend/axis-validate.ts:27` — `readonly typeIndex: number`
- Spec `t2_axis-validate.md:56` — `readonly exprIndex: number`
**Obvious fix?**: Yes — rename to `exprIndex` when ValueExpr is implemented. Until then, `typeIndex` is a reasonable interim name, but should be tracked.

### C-3: No `AxisInvalid` diagnostic category in diagnostic system
**Problem**: The spec defines an `AxisInvalid` diagnostic category with source context (block ID, port ID), expected vs actual values, and suggested fixes. The current implementation simply catches thrown errors and stores the error message string. There is no structured diagnostic with expected/actual CanonicalType references, no block/port source context, and no integration with the diagnostic hub.
**Evidence**:
- `src/compiler/frontend/axis-validate.ts:44-50` — catches error, stores `{ typeIndex, kind, message }` with no source context
- Spec `t3_diagnostics.md:27-33` — requires source context, expected/actual, suggestion
- `grep "AxisInvalid" src/` — no results anywhere in codebase
**Obvious fix?**: No — requires design work to connect AxisViolation to block/port context. The validation function currently receives only `CanonicalType[]` with no provenance. Need to either pass provenance alongside types or run validation at a point where block/port info is available.
