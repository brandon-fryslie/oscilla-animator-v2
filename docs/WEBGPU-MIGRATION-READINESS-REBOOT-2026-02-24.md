# WebGPU Migration Readiness Reboot (From Scratch)

Status: Implemented Baseline  
Date: February 24, 2026  
Audience: Architecture, Compiler, Runtime, Renderer maintainers

## 1. Why Reboot The Concept

The current readiness concept is workstream-first (W1..W15) and artifact-presence-first. That is useful for migration tracking, but it is not a reliable design-go/no-go contract.

Key issues:
- Artifact schema is not normalized (`completed`, `slice_completed`, `blocked_environment`), so readiness cannot be evaluated by one deterministic rule.
- Some artifacts capture partial closure slices while the top-level prerequisite spec defines all-or-nothing readiness.
- Browser gating currently mixes "proof produced" with "platform blocked"; this is migration evidence, not readiness success.
- Readiness outcome is distributed across many files and statuses instead of one canonical computed verdict.

// [LAW:one-source-of-truth] readiness must be computed from one canonical model, not interpreted ad hoc from many artifacts.
// [LAW:verifiable-goals] readiness must be machine-checkable by deterministic rules.

## 2. Replace Workstream-First With Capability-First

Keep W1..W15 as implementation history. Replace readiness decisioning with capability gates.

Canonical readiness object:
- `readiness_version`: schema version.
- `gates`: fixed gate set with explicit pass/fail criteria.
- `blockers`: explicit blocking reasons with owner and next action.
- `overall`: single computed value (`ready` or `not_ready`).

// [LAW:no-mode-explosion] use one canonical readiness state pair (`ready`/`not_ready`) and encode nuance in blocker metadata, not new modes.

## 3. New Gate Model

### G1. Canonical Runtime Data Model

Pass criteria:
- No operational `slotMeta` dependency in runtime execution.
- No hot-path `values.objects` usage for runtime/render crossing data.
- Canonical address ownership via ExprAddressTable and arena descriptors.
- Stateful persistent storage on canonical `Float32Array` state plane.

Evidence sources:
- W2, W3, W4, W7, W8, W12 artifacts.
- Forbidden-patterns gates for addressing/object/f64 regressions.

### G2. Deterministic Execution Semantics

Pass criteria:
- One evaluator family per scalar/event path.
- Effects-as-data only (no binder/lowering fallback paths).
- Segment ownership deterministic across external input, continuity, and phase boundaries.
- Long-run bounded phase semantics proven by deterministic simulation.

Evidence sources:
- W4, W5, W6, W13 artifacts.
- Continuity and stepped-execution test suites.

### G3. Renderer Contract Hardness

Pass criteria:
- Renderer sink has no v1 compatibility scaffolding.
- WebGPU contract is explicit and fail-fast (no fallback renderers).
- Runtime-to-render boundary consumes canonical typed banks only.

Evidence sources:
- W9, W10 artifacts.
- Render sink and WebGPU tests.

### G4. Browser Qualification And Performance

Pass criteria:
- Latest Chrome lane passes readiness and baseline perf thresholds.
- Matrix run is repeatable and emitted as machine-readable artifact.
- Optional non-blocking browser telemetry lanes may be collected, but they do not gate readiness.

Evidence sources:
- W15 artifact and matrix report.

// [LAW:single-enforcer] browser readiness pass/fail is enforced only by the Chromium gating lane output.

### G5. Evidence Integrity

Pass criteria:
- Every referenced artifact uses normalized schema (`status`, `commit`, `verification[]`, `static_scans[]`).
- Every artifact status is terminal and normalized (`completed` or `blocked`).
- `blocked` artifacts include blocker metadata with owner and next action.

Evidence sources:
- All migration-proof JSON files.

## 4. Deterministic Readiness Rule

Readiness algorithm:
1. Evaluate all gates G1..G5.
2. `overall = ready` only if every gate passes.
3. Any failed gate sets `overall = not_ready` and must produce at least one blocker.

This removes subjective "close enough" interpretation.

## 5. Mapping From W1..W15 To Gates

- G1: W2, W3, W4, W7, W8, W12, W14
- G2: W4, W5, W6, W13
- G3: W9, W10
- G4: W15
- G5: W1..W15 artifact schema normalization

// [LAW:one-type-per-behavior] W workstreams remain delivery packets; gates are the single behavior type for readiness decisions.

## 6. Current State Under The Reboot Model (As Of February 24, 2026)

Observed from current artifacts:
- G1: likely pass on technical substance, but blocked by non-normalized statuses in W2/W7/W12 (`slice_completed`).
- G2: pass on technical substance with W4/W5/W6/W13 evidence.
- G3: pass on W9/W10 evidence.
- G4: pass when Chromium gating lane passes (WebKit/Safari telemetry is non-blocking).
- G5: fail (status vocabulary and schema normalization incomplete across artifacts).

Computed result today:
- `overall = not_ready`
- Primary blockers:
- Artifact normalization blocker (`slice_completed` and mixed status semantics).

## 7. Immediate Transition Plan

1. Normalize artifact schema and statuses.
2. Convert `slice_completed` -> `completed` or `blocked` with explicit blockers.
3. Add one readiness checker script that computes G1..G5 and emits one canonical verdict JSON.
4. Require checker success in CI before any "design kickoff" label can be applied.
5. Keep W-workstream docs for history, but treat gate verdict as the only readiness authority.

## 8. Decision

Adopt the gate model as the canonical readiness concept. Keep workstreams as execution planning only.

## 9. Implementation Baseline (February 24, 2026)

- Migration-proof artifacts are normalized to terminal statuses (`completed` / `blocked`) and canonical required fields.
- `slice_completed` status usage has been removed from active readiness artifacts.
- Canonical checker script added: `scripts/webgpu-migration-readiness.mjs`.
- Canonical verdict artifact emitted by checker: `artifacts/webgpu-migration-readiness.json`.
- CI lane added: `.github/workflows/webgpu-migration-readiness.yml` runs the canonical readiness checker on pull requests and `master`.
