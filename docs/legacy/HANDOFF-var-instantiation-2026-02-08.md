# Handoff: Template Var Instantiation + Remaining Test Failures

**Date**: 2026-02-08
**Branch**: bmf_type_system_refactor
**Starting failures**: ~123 (post V1 frontend removal)
**Current failures**: 56
**Changes NOT committed** — all in working tree

---

## What Was Done This Session

### 1. Template Var Instantiation (the main fix)

**Problem**: Block def template var IDs like `payloadVar('const_payload')` are shared across all instances. The solver's `Substitution.payloads` map (keyed by raw var ID) suffered last-write-wins when multiple Const blocks existed.

**Fix**: `instantiateTemplateVars()` in `src/compiler/frontend/extract-constraints.ts` alpha-renames template vars to block-scoped IDs (`p:{blockId}:{templateId}`, `u:{blockId}:{templateId}`) during constraint extraction.

**Files**: `extract-constraints.ts` (added helper + applied in both output/input loops)

### 2. Structural Equality in Type Graph (Bug #2)

**Problem**: `analyze-type-graph.ts:isTypeCompatible()` used `from.payload !== to.payload` (reference equality) and `from.unit.kind !== to.unit.kind` (incomplete comparison). Fails when solver produces non-singleton PayloadType objects.

**Fix**: Changed to `payloadsEqual()` and `unitsEqual()` structural comparisons.

**Files**: `analyze-type-graph.ts` (2 lines changed + 2 imports added)

### 3. Payload Solver Default-to-Float (carried from prior session)

**Problem**: Polymorphic groups with no concrete evidence stayed unresolved.

**Fix**: Default to first allowed payload (float) in finalization. Uses `FLOAT` singleton instead of creating new `{ kind: 'float' }` object.

**Files**: `payload-unit/solve.ts` (finalization phase)

### 4. Unit Typing Audit (carried from prior session)

- Removed `scalar` UnitType kind → unified with `none`
- Added `unitVar()` to 14 unit-preserving blocks
- Added unresolved-unit-var → `unitNone()` fallback in solver
- Full details: `design-docs/unit-audit.md`

### 5. Test Updates

- `final-normalization.test.ts`: Updated 4 tests that expected unresolved payloads (now correctly default to float)
- `debug-const-add.test.ts`: Permanent debug harness for fixpoint tracing (dumps constraints, solver state, var resolutions)

---

## Architecture Notes: What's Sound

### Template Var Scoping — VERIFIED SAFE

| Var source | Format | Block-scoped? |
|---|---|---|
| Block def template vars | `p:{blockId}:{templateId}`, `u:{blockId}:{templateId}` | Yes (instantiation) |
| Auto-derivation (polymorphic blocks) | `{blockId}_T`, `{blockId}_U` | Yes (at creation) |
| Cardinality vars | `CardinalityVarId("card:{portKey}")` | Yes (port key includes blockId) |
| Instance vars | `InstanceVarId("fieldOnly:{blockId}:{portName}")` | Yes (at creation) |

No namespace collisions between these formats.

### Substitution Pipeline — VERIFIED CORRECT

1. `extractConstraints()` produces `portBaseTypes` with instantiated var IDs
2. `buildPortVarMapping()` reads var IDs from `portBaseTypes` → scoped IDs
3. `solvePayloadUnit()` uses scoped IDs for UF nodes AND for result maps
4. `Substitution.payloads/units` keyed by scoped IDs → no collisions
5. `applyPartialSubstitution()` looks up `payload.id` → matches scoped ID ✓
6. `computePortHint()` applies substitution → correct per-block resolution ✓

---

## Remaining 56 Test Failures: Categorization

### Category A: Runtime tests that fail because their test patches don't compile (33 tests)

These tests build patches, compile them, then test runtime behavior. The compilation step fails because of remaining V2 frontend issues (not related to var instantiation).

| Test File | Failures | Root Cause |
|---|---|---|
| `StepDebugSession.test.ts` | 10 | Compilation of test patch fails |
| `temporal-comparison.test.ts` | 8 | Compilation of test patch fails |
| `conditional-breakpoints.test.ts` | 7 | Compilation of test patch fails |
| `executeFrameStepped.test.ts` | 6 | Compilation of test patch fails |
| `render-scale-offset.test.ts` | 1 | Compilation of test patch fails |
| `why-not-evaluated.test.ts` | 1 | Compilation of test patch fails |

**Next step**: Fix the underlying compilation issues. These runtime tests don't need changes themselves.

### Category B: HCL demo patches that don't compile (12 tests)

All 12 HCL demos fail at compilation. They exercise real-world graph patterns.

**Next step**: Pick one representative demo (e.g., `simple.hcl`) and trace the compilation failure. Likely hits a remaining V2 frontend issue.

### Category C: Compiler tests with specific V2 frontend issues (10 tests)

| Test | Issue |
|---|---|
| `compile.test.ts` — instance compilation (2) | `expected +0 to be 1` — cardinality/instance count issue |
| `compile.test.ts` — unknown block types (1) | Expects error but gets ok — unknown blocks not caught |
| `compile.test.ts` — error isolation (2) | Expects ok but gets error — error isolation broken |
| `steel-thread.test.ts` (2) | End-to-end compilation fails |
| `feedback-loops.test.ts` (1) | Cycle detection regression |
| `value-expr-cardinality-invariants.test.ts` (1) | Cardinality invariant check |
| `adapter-policy.test.ts` (1) | Adapter chain lookup |
| `initial-compile-invariant.test.ts` (1) | Unknown block detection |

### Category D: Other (2 tests)

| Test | Issue |
|---|---|
| `adapter-spec.test.ts` — impossible conversion (1) | `findAdapterChain` returns non-null when it should return null — likely scalar→none change affects adapter matching |
| `perspective-camera.test.ts` (1) | Demo patch compilation |

---

## Known Architecture Risks (NOT Bugs Yet)

### 1. `payloadNodeForVar` double-scoping

The solver's `payloadNodeForVar()` in `payload-unit/solve.ts` constructs UF nodes as `payload:var:{blockId}:{varId}`. After template var instantiation, the `varId` is already `p:{blockId}:{templateId}`, resulting in `payload:var:{blockId}:p:{blockId}:{templateId}`. This is redundant but NOT a bug — UF node IDs just need to be unique and consistent.

If this becomes confusing for debugging, the fix would be: when all var IDs are guaranteed block-scoped, `payloadNodeForVar` can simplify to `payload:var:{varId}` (dropping the redundant blockId extraction from portKey).

### 2. Adapter chain with scalar→none

`adapter-spec.test.ts` failure: `findAdapterChain` returns non-null for "impossible conversion". The scalar→none UnitType unification may have changed which conversions the adapter system considers possible. Needs investigation — likely the adapter registry has entries that reference the old `scalar` kind.

### 3. Unknown block handling

`compile.test.ts` "reports unknown block types" expects error but gets ok. The V2 frontend may silently skip unknown blocks during constraint extraction (the `if (!def) continue;` at line 79 of `extractConstraints`). The old V1 frontend may have had an explicit check.

### 4. Error isolation

`compile.test.ts` "excludes errors from disconnected subgraph" expects ok but gets error. The V2 frontend doesn't have error isolation logic yet — it reports all errors from the full graph, not just the reachable subgraph.

---

## Files Modified (All Uncommitted)

### Core fixes
- `src/compiler/frontend/extract-constraints.ts` — template var instantiation
- `src/compiler/frontend/analyze-type-graph.ts` — structural equality
- `src/compiler/frontend/payload-unit/solve.ts` — default-to-float fallback + FLOAT singleton

### Unit audit (prior session)
- `src/core/canonical-types/units.ts` — scalar removed
- `src/core/canonical-types/payloads.ts` — scalar→none
- `src/core/canonical-types/index.ts` — removed unitScalar export
- ~15 adapter blocks — unitScalar→unitNone
- 14 signal/lens blocks — added unitVar propagation
- ~10 UI files — removed `case 'scalar':` branches
- ~12 test files — updated expectations

### Tests
- `src/compiler/frontend/__tests__/final-normalization.test.ts` — updated 4 tests
- `src/compiler/__tests__/debug-const-add.test.ts` — permanent debug harness
- `src/__tests__/forbidden-patterns.test.ts` — scalar enforcement
- `src/core/__tests__/canonical-types.test.ts` — unit system tests
- `src/compiler/frontend/payload-unit/__tests__/unit-propagation.test.ts` — 7 new tests

### Docs
- `design-docs/unit-audit.md` — audit document

---

## Recommended Next Steps (in priority order)

1. **Investigate one representative HCL demo failure** (e.g., `simple.hcl`) to find the common root cause for categories A+B (45 of 56 failures)
2. **Add unknown block detection** to the V2 frontend (2 tests depend on it)
3. **Add error isolation** logic for disconnected subgraphs (2 tests)
4. **Fix adapter-spec test** — investigate scalar→none impact on adapter matching
5. **Commit all changes** once failure count is acceptable
