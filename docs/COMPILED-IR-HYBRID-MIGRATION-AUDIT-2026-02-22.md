# CompiledIR Hybrid Migration Audit (2026-02-22)

## Scope
Production code audit of unfinished migration artifacts in:
- `src/blocks`
- `src/compiler` (including `src/compiler/ir` and scheduler construction)
- runtime scheduler/execution (`src/runtime/ScheduleExecutor.ts`, `src/runtime/executeFrameStepped.ts`)
- renderer paths (`src/runtime/RenderAssembler.ts`, `src/render`)

Excluded: tests, archived docs, planning notes.

## Method
- Grep scan for migration markers (`legacy`, `deprecated`, `migration`, `fallback`, `compat`, `slotMeta`, `TODO`).
- Manual verification of each hit in context.
- Only items that are still active compatibility/migration seams are listed as findings.

## Executive Summary
- **Critical hybrid seams:** 5
- **High-priority unfinished migrations:** 10
- **Medium/cleanup migration artifacts:** 7

The architecture is still hybrid in practice. The strongest signals are:
1. `slotMeta` remains a live cross-layer contract from compiler through runtime execution.
2. Runtime still carries dual evaluator migration surfaces (`ValueExpr*` shadow mode + legacy parity state).
3. Effects-as-data lowering is not fully enforced (fallback allocations and optional effects still exist).
4. Renderer still contains explicit v1 compatibility and unfinished zero-allocation migration work.

---

## Critical Findings

### C1) `slotMeta` is still a first-class runtime dependency (hybrid slot-addressing survives)
- `src/compiler/compile.ts:323` builds `slotMeta`.
- `src/compiler/compile.ts:360` notes render output is "jammed into slotMeta with a fake type" and marked "For now".
- `src/compiler/ir/program.ts:101` keeps `slotMeta` on `CompiledProgramIR`.
- `src/runtime/ExprAddressTable.ts:55` derives runtime lookup tables from `slotMeta` each program.
- `src/runtime/ScheduleExecutor.ts:146` and `src/runtime/executeFrameStepped.ts:239` throw on missing `slotMeta` entries.

Why this is unfinished migration:
- `slotMeta` is not only metadata; it is an operational contract used at execution time.
- `renderFrameSlot` is explicitly called out as temporary technical debt.

// [LAW:one-source-of-truth] `slotMeta` currently acts as the canonical slot contract across compiler/runtime, so any migration away from it is incomplete until all runtime lookups stop depending on it.

### C2) Runtime scalar/event evaluation is explicitly in migration shadow mode
- `src/runtime/ValueExprScalarEvaluator.ts:10-12`
- `src/runtime/ValueExprEventEvaluator.ts:9-11`
- `src/runtime/RuntimeState.ts:494-503` keeps both `eventPrevPredicate` (legacy evaluator) and `eventPrevPredicateValue` (ValueExpr evaluator).

Why this is unfinished migration:
- The code states parallel execution/validation during migration and retains duplicate state surfaces.

### C3) Effects-as-data lowering remains partial
- `src/blocks/registry.ts:115` declares `effects` as optional "during migration".
- `src/compiler/backend/binding-pass.ts:394` allocates slots via "Pure block fallback" when effects are missing.
- `src/compiler/backend/binding-pass.ts:210` and `src/compiler/backend/binding-pass.ts:289` use `builder.findStateSlot()` fallback paths.

Why this is unfinished migration:
- The orchestrator still supports both declarative effects and fallback imperative behavior.

// [LAW:dataflow-not-control-flow] Canonical pass execution is still influenced by whether effects are present; full migration would keep the same pipeline steps and vary only data.

### C4) IR public surface still exports deprecated legacy builder type
- `src/compiler/ir/index.ts:30-33` exports `IRBuilder` as "Legacy - deprecated".
- `src/compiler/index.ts:7` re-exports `IRBuilder` from compiler root.

Why this is unfinished migration:
- Deprecated API remains public and importable, enabling legacy callsites to persist.

### C5) Renderer path still carries explicit compatibility and unfinished migration TODOs
- `src/runtime/RenderAssembler.ts:79` has "Internal Types (v1 compatibility)".
- `src/runtime/RenderAssembler.ts` contains **25** occurrences of `TODO: replace per-frame allocation with zero-alloc render assembly`.
- `src/render/RenderBufferArena.ts:316` keeps `getTotalAllocatedBytes()` alias for compatibility.

Why this is unfinished migration:
- New render pipeline exists, but compatibility scaffolding and repeated TODO markers show migration not closed.

---

## High-Priority Findings by Subsystem

## Blocks

### B1) Lowering contract still transitional
- `src/blocks/registry.ts:115` — `effects` optional during migration.

### B2) Legacy config coercion still required
- `src/blocks/shape/make-shape2d.ts:95-103` — normalizes legacy numeric `closed` (`0/1`) to boolean.

### B3) Render-coupled output compatibility shim
- `src/blocks/shape/path-field.ts:140` — tangent output forced to VEC3 for render-pipeline compatibility.

### B4) Backward-compat input field still retained
- `src/blocks/registry.ts:281` — `exposedAsPort` default true "(backward compat)".

## Compiler / IR

### I1) Temporary hack acknowledged in compile output wiring
- `src/compiler/compile.ts:359-361` — render frame output modeled as fake `slotMeta` entry "For now".

### I2) Slot metadata mutation relies on type escape hatch
- `src/compiler/backend/lower-blocks.ts:1265` — `as unknown as Map<number, ...>` to mutate slot metadata.

### I3) Deprecated outputs-array migration still actively guarded
- `src/compiler/backend/lower-blocks.ts:705`
- `src/compiler/backend/lower-blocks.ts:1399-1400`

### I4) Legacy bridge layer is partially stale/deferred
- `src/compiler/ir/bridges.ts:32` — backward-compat aliases.
- `src/compiler/ir/bridges.ts:86` — "legacy bridge tests" helper.
- `src/compiler/ir/bridges.ts:242` — `TODO: Q6 - shape handling deferred`.

### I5) Frontend typed patch still carries legacy compatibility map
- `src/compiler/ir/patches.ts:100` — `blockOutputTypes for legacy compatibility`.
- `src/compiler/frontend/analyze-type-graph.ts:5` and `src/compiler/frontend/analyze-type-graph.ts:83` build and thread this map.

### I6) IR type/index compatibility shims remain
- `src/compiler/ir/Indices.ts:8` — backward compatibility during migration.
- `src/compiler/ir/program.ts:9` — "Import the legacy types for now".

### I7) Unfinished metadata path in builder
- `src/compiler/ir/IRBuilderImpl.ts:492` — `TODO: store stride metadata` in `allocSlot()`.

## Scheduler / Execution

### S1) Scalar execution path still mixed (`evalOne` + scalar `materialize`)
- `src/compiler/backend/schedule-program.ts:474-491` — scalar DAGs are "migrated to" materializer when eligible; others still scheduled as `evalOne`.

### S2) Runtime state writer uses fallback initialization path
- `src/runtime/ScheduleExecutor.ts:531-532`
- `src/runtime/executeFrameStepped.ts:494-495`

### S3) Runtime state structure still carries compatibility flattening
- `src/runtime/RuntimeState.ts:522` — flat `RuntimeState` kept for backwards compatibility.
- `src/runtime/RuntimeState.ts:112` — legacy `slotCount` parameter retained for callsite compatibility.

## Renderer

### R1) Render assembler compatibility marker
- `src/runtime/RenderAssembler.ts:79` — "Internal Types (v1 compatibility)".

### R2) Zero-allocation migration is explicitly incomplete
- `src/runtime/RenderAssembler.ts` — 25 TODO markers for zero-alloc assembly migration.

### R3) Arena API compatibility alias retained
- `src/render/RenderBufferArena.ts:316` — API compatibility alias method.

---

## Medium / Cleanup Migration Artifacts

- `src/compiler/types.ts:47` comment references backward-compatible `kind`/`location`, but the interface no longer exposes those fields.
- `src/runtime/OpcodeInterpreter.ts:7` still describes delegation from "legacy evaluators".
- `src/compiler/ir/index.ts` and `src/compiler/index.ts` still make deprecated IRBuilder imports easy to keep using.
- `src/compiler/ir/bridges.ts:14` says production should use `bridge.ts`; no `src/compiler/ir/bridge.ts` exists.

---

## Cheat-Proof Mechanical Verification Requirements (Per Critical Seam)

These are migration completion targets intended for CI enforcement. A seam is only "done" when all required gates pass.

Verification model:
- Positive proof: new canonical behavior works.
- Negative proof: old path cannot exist or execute.

// [LAW:verifiable-goals] Each seam below defines machine-checkable pass/fail criteria.
// [LAW:single-enforcer] Each seam below requires exactly one owning boundary after migration.

### C1 Gate: Remove `slotMeta` as runtime-operational dependency

Completion target:
- Runtime execution no longer reads `program.slotMeta` for address resolution.

Required gates:
- Behavior gate: compile+execute corpus patches and assert frame outputs match canonical contract snapshots.
- Static ban gate: fail CI if `program.slotMeta` appears in runtime execution modules (`src/runtime/**`), except optional debug-only inspector module if intentionally retained.
- Topology gate: single address source must be one structure only; fail if multiple slot-address caches/tables are constructed.
- Schema gate: if `slotMeta` becomes metadata-only or removed, type-level compile must fail on any runtime consumer import/access.

Proof artifact:
- `migration-proof/c1-slot-addressing.json` with: banned-pattern scan result, corpus pass count, modules asserting canonical address source.

### C2 Gate: End shadow-mode dual evaluators

Completion target:
- Exactly one scalar/event evaluator path exists in production execution.

Required gates:
- Behavior gate: scalar/event contract tests for all expression kinds and edge cases (NaN, inf, combine cycles, event edges).
- Static ban gate: fail CI on migration markers indicating parallel legacy execution (for example "runs in parallel with legacy", "shadow mode", duplicate predicate buffers).
- State schema gate: remove duplicate event predicate state surfaces; compile should fail if old field names are referenced.
- Runtime telemetry gate: execution trace from representative programs must show one evaluator family only.

Proof artifact:
- `migration-proof/c2-evaluator-unification.json` with evaluator path counts and banned-marker scan.

### C3 Gate: Make effects-as-data mandatory

Completion target:
- Lowering no longer falls back to imperative slot/state allocation.

Required gates:
- Contract gate: block lowering output schema requires declarative effects where allocation/steps are needed.
- Static ban gate: fail CI if fallback phrases/branches remain in binder (for example "Pure block fallback", `findStateSlot()` fallback in binding flow).
- Determinism gate: same input graph yields identical effect set and slot/state assignment across repeated runs.
- Completeness gate: compile fails with explicit diagnostics if a block omits required declarative effects.

Proof artifact:
- `migration-proof/c3-effects-as-data.json` with deterministic hash of binding decisions over corpus.

### C4 Gate: Remove deprecated IRBuilder public surface

Completion target:
- Deprecated `IRBuilder` type is no longer publicly exported or importable through stable entrypoints.

Required gates:
- API gate: remove deprecated exports from compiler/IR index modules.
- Static ban gate: fail CI if `IRBuilder` (deprecated interface) is imported outside an explicitly allowed migration quarantine list (preferably empty).
- Build gate: all packages compile without deprecated builder symbols.
- Ownership gate: only `BlockIRBuilder` and `OrchestratorIRBuilder` remain as authoritative builder surfaces.

Proof artifact:
- `migration-proof/c4-builder-surface.json` listing all builder-type imports discovered by static scan.

### C5 Gate: Finish renderer migration (v1 compatibility and zero-alloc TODOs)

Completion target:
- No v1-compat scaffolding remains in hot render path and per-frame allocations are bounded by explicit policy.

Required gates:
- Static ban gate: fail CI on migration TODO markers and v1-compat labels in runtime render modules.
- Allocation gate: frame execution benchmark enforces max allocation budget (preferably zero in hot path) over stress scenes.
- API gate: remove compatibility aliases not part of canonical renderer API.
- Regression gate: render contract suite validates geometry, ordering, camera projection, and continuity behavior.

Proof artifact:
- `migration-proof/c5-renderer.json` with allocation metrics and render contract pass summary.

---

## Generic Migration Completion Protocol (Reusable Across Domains)

Use this process when legacy assumptions in tests block deletion-first migration.

### Phase 1: Define Canonical Contract First

1. Define one canonical model and one owning boundary per invariant.
2. Write behavior contracts against externally visible outcomes only.
3. Declare forbidden legacy behaviors as explicit negative requirements.

// [LAW:behavior-not-structure] Contract tests must assert outcomes, not implementation retention.
// [LAW:one-source-of-truth] Canonical model is defined once before code changes begin.

### Phase 2: Build Cheat-Proof Gates

1. Positive gates: contract/integration/property tests for new behavior.
2. Negative gates: static bans for old symbols, branches, comments, and compatibility shims.
3. Topology gates: architectural shape checks (single owner, no duplicate paths, no cycles).
4. Determinism gates: repeated-run hash checks for pipelines where order/identity matters.

Recommended rule:
- Migration is complete only when both positive and negative gates pass.

### Phase 3: Delete Before Rebuild

1. Quarantine or delete legacy path first (or hard-disable via compile error).
2. Keep only minimal adapters needed at external boundaries.
3. Rebuild canonical path to satisfy contract gates.

Why this works:
- It prevents legacy tests from forcing reintroduction of old assumptions.
- It makes missing behavior explicit and reimplemented intentionally.

### Phase 4: Produce Mechanical Proof Artifacts

1. Emit machine-readable evidence (`migration-proof/*.json`) from CI.
2. Include scan results, contract counts, and deterministic hashes.
3. Make release/merge depend on evidence existence and validity.

### Phase 5: Lock the Boundary

1. Add permanent tripwire checks to prevent regression.
2. Remove temporary migration toggles and quarantine allowlists.
3. Record final "done definition" in architecture docs.

// [LAW:single-enforcer] Completed migration means one enforcing boundary, not two synchronized implementations.
// [LAW:dataflow-not-control-flow] Variability should remain in data, not in optional code paths for old/new modes.

---

## Practical Conclusion

The reported "hybrid CompiledIR" diagnosis is accurate.

The core migration is incomplete at three boundaries:
1. **Data layout boundary:** `slotMeta` is still runtime-operational.
2. **Execution boundary:** ValueExpr path coexists with legacy-evaluator parity surfaces.
3. **Lowering boundary:** Effects-as-data is not yet strictly enforced.

// [LAW:single-enforcer] To finish migration cleanly, each boundary above needs one canonical mechanism and removal of fallback enforcement paths.
