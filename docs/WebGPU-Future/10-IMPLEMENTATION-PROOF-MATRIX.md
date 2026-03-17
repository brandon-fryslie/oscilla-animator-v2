# WebGPU-Future Implementation Proof Matrix

This document defines the canonical proof commands for the unattended `FUTURE-*` loop.

It is the single source of truth for:

- exact commands
- exact fixtures
- exact artifact paths
- acceptance-proof versus supporting-signal classification
- which later `FUTURE-*` tickets must replay an accepted proof

`// [LAW:one-source-of-truth] Exact acceptance commands live here once. Tickets, prompts, and loop docs reference proof IDs from this document instead of drifting into duplicate command lists.`
`// [LAW:verifiable-goals] A proof is incomplete until it names an exact command, fixture, artifact path, and pass condition.`

## 1. Shared Rules

### Artifact Root

All proof artifacts for this loop live under:

- `artifacts/webgpu-future/`

### Command Discipline

Use the exact command text in this document.

If a proof command references a test or spec file that does not exist yet, creating that file is part of the owning `FUTURE-*` ticket. The ticket is not complete until the exact command succeeds.

### Browser Automation Fallback

Browser/UI proof is mandatory for `P-01`, `P-09`, and `P-11`.

If a Playwright-backed command fails because Chromium is not installed, run exactly once:

```bash
pnpm exec playwright install chromium chromium-headless-shell
```

Then rerun the original proof command.

If the rerun still fails, the ticket is blocked. Do not downgrade browser proof to optional or replace it with manual inspection.

`// [LAW:single-enforcer] Browser-proof remediation is standardized here so every run uses the same fallback instead of inventing local exceptions.`

## 2. Common Proof Gate

### `P-00` Bootstrap Static Contract

Purpose:

- preserve the existing bootstrap demo compile contract and GPU compatibility boundary

Command:

```bash
pnpm -s vitest run \
  src/demo/__tests__/gpu-bootstrap-demo.test.ts \
  src/services/__tests__/GpuPatchCompatibility.test.ts \
  --reporter=json \
  --outputFile artifacts/webgpu-future/p-00-bootstrap-static.vitest.json
```

Fixtures:

- `src/demo/hcl/gpu-bootstrap-triangle.hcl`
- `src/demo/hcl/simple.hcl`

Expected artifact:

- `artifacts/webgpu-future/p-00-bootstrap-static.vitest.json`
- zero exit code
- JSON report shows success for both suites

Evidence class:

- acceptance proof

Replay required:

- `FUTURE-01`
- `FUTURE-02`
- `FUTURE-03`
- `FUTURE-04`
- `FUTURE-05`
- `FUTURE-06`
- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-01` Bootstrap Runtime Liveness

Purpose:

- preserve the existing first-visible-triangle runtime baseline in a replayable browser harness

Command:

```bash
WEBGPU_MATRIX_START_SERVER=1 \
WEBGPU_MATRIX_BUILD_FIRST=1 \
WEBGPU_MATRIX_URL='http://127.0.0.1:4173/?loadDemoPatch=gpu-bootstrap-triangle.hcl' \
WEBGPU_MATRIX_REPORT=artifacts/webgpu-future/p-01-bootstrap-runtime.json \
pnpm -s test:webgpu-matrix
```

Fixtures:

- `src/demo/hcl/gpu-bootstrap-triangle.hcl`

Expected artifact:

- `artifacts/webgpu-future/p-01-bootstrap-runtime.json`
- zero exit code
- report `passed` is `true`
- Chromium lane result status is `passed`
- `runtimeProbe.bootstrapState` is `succeeded`
- `frameAdvanceDetected` is `true`
- no console or page errors

Evidence class:

- acceptance proof

Replay required:

- `FUTURE-01`
- `FUTURE-02`
- `FUTURE-03`
- `FUTURE-04`
- `FUTURE-05`
- `FUTURE-06`
- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

## 3. Ticket-Owned Proofs

### `P-02` Canonical Scene Boundary Contract

Owner:

- `FUTURE-01`

Command:

```bash
pnpm -s vitest run \
  src/render/__tests__/scene-render-sink-contract.test.ts \
  --reporter=json \
  --outputFile artifacts/webgpu-future/p-02-scene-render-sink-contract.vitest.json
```

Fixtures:

- boundary contract types centered on `RenderPrimitive`, `RenderView`, and `SceneRenderSink`

Expected artifact:

- `artifacts/webgpu-future/p-02-scene-render-sink-contract.vitest.json`
- zero exit code
- JSON report shows the new boundary contract suite passing

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-02`
- `FUTURE-03`
- `FUTURE-04`
- `FUTURE-07`
- `FUTURE-09`

### `P-03` Legacy Compatibility Adapter Contract

Owner:

- `FUTURE-02`

Command:

```bash
pnpm -s vitest run \
  src/services/__tests__/legacy-scene-submission-adapter.test.ts \
  --reporter=json \
  --outputFile artifacts/webgpu-future/p-03-legacy-adapter-contract.vitest.json
```

Fixtures:

- `src/demo/hcl/simple.hcl`
- `src/demo/hcl/breathing-ring.hcl`
- `src/demo/hcl/tile-grid.hcl`

Expected artifact:

- `artifacts/webgpu-future/p-03-legacy-adapter-contract.vitest.json`
- zero exit code
- JSON report shows canonical `RenderPrimitive[] + RenderView` adapter tests passing

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-03`
- `FUTURE-04`
- `FUTURE-07`
- `FUTURE-09`

### `P-04` Legacy Runtime Proof Set

Owner:

- `FUTURE-03`

Commands:

```bash
WEBGPU_MATRIX_START_SERVER=1 \
WEBGPU_MATRIX_BUILD_FIRST=1 \
WEBGPU_MATRIX_URL='http://127.0.0.1:4173/?loadDemoPatch=simple.hcl' \
WEBGPU_MATRIX_REPORT=artifacts/webgpu-future/p-04-simple-runtime.json \
pnpm -s test:webgpu-matrix
```

```bash
WEBGPU_MATRIX_START_SERVER=1 \
WEBGPU_MATRIX_BUILD_FIRST=1 \
WEBGPU_MATRIX_URL='http://127.0.0.1:4173/?loadDemoPatch=breathing-ring.hcl' \
WEBGPU_MATRIX_REPORT=artifacts/webgpu-future/p-04-breathing-ring-runtime.json \
pnpm -s test:webgpu-matrix
```

```bash
WEBGPU_MATRIX_START_SERVER=1 \
WEBGPU_MATRIX_BUILD_FIRST=1 \
WEBGPU_MATRIX_URL='http://127.0.0.1:4173/?loadDemoPatch=tile-grid.hcl' \
WEBGPU_MATRIX_REPORT=artifacts/webgpu-future/p-04-tile-grid-runtime.json \
pnpm -s test:webgpu-matrix
```

Fixtures:

- `src/demo/hcl/simple.hcl`
- `src/demo/hcl/breathing-ring.hcl`
- `src/demo/hcl/tile-grid.hcl`

Expected artifacts:

- `artifacts/webgpu-future/p-04-simple-runtime.json`
- `artifacts/webgpu-future/p-04-breathing-ring-runtime.json`
- `artifacts/webgpu-future/p-04-tile-grid-runtime.json`
- each command exits zero
- each report has `passed: true`
- each report shows bootstrap succeeded, frame advance detected, and zero console/page errors

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-04`
- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-05` Canonical Patch Root Roundtrip

Owner:

- `FUTURE-04`

Command:

```bash
pnpm -s vitest run \
  src/patch-dsl/__tests__/future-canonical-patch-root.test.ts \
  --reporter=json \
  --outputFile artifacts/webgpu-future/p-05-canonical-patch-root.vitest.json
```

Fixtures:

- `src/demo/hcl/future-canonical-single-triangle.hcl`
- `src/demo/hcl/future-canonical-repeat-grid.hcl`

Expected artifact:

- `artifacts/webgpu-future/p-05-canonical-patch-root.vitest.json`
- zero exit code
- JSON report shows canonical patch-root roundtrip and lowering proofs passing

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-05`
- `FUTURE-06`
- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-06` Canonical Authoring Model Diagnostics

Owner:

- `FUTURE-05`

Command:

```bash
pnpm -s vitest run \
  src/compiler/frontend/__tests__/future-authoring-model-diagnostics.test.ts \
  --reporter=json \
  --outputFile artifacts/webgpu-future/p-06-authoring-model-diagnostics.vitest.json
```

Fixtures:

- canonical authoring-model positive and negative fixtures owned by the compiler/editor boundary

Expected artifact:

- `artifacts/webgpu-future/p-06-authoring-model-diagnostics.vitest.json`
- zero exit code
- JSON report shows deterministic diagnostics for illegal layer crossings and renderer-leaking authoring concepts

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-06`
- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-07` Guardrail Regression Boundary

Owner:

- `FUTURE-06`

Command:

```bash
pnpm -s vitest run \
  src/diagnostics/validators/__tests__/future-authoring-guardrails.test.ts \
  --reporter=json \
  --outputFile artifacts/webgpu-future/p-07-guardrails.vitest.json
```

Fixtures:

- forbidden sink-like authoring block attempts
- forbidden hidden transport output attempts
- forbidden renderer-leaking type attempts

Expected artifact:

- `artifacts/webgpu-future/p-07-guardrails.vitest.json`
- zero exit code
- JSON report shows forbidden-pattern regression suite passing

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-08` Canonical MVP Authoring Runtime Proof

Owner:

- `FUTURE-07`

Commands:

```bash
pnpm -s vitest run \
  src/demo/__tests__/future-canonical-authoring-mvp.test.ts \
  --reporter=json \
  --outputFile artifacts/webgpu-future/p-08-canonical-mvp.vitest.json
```

```bash
WEBGPU_MATRIX_START_SERVER=1 \
WEBGPU_MATRIX_BUILD_FIRST=1 \
WEBGPU_MATRIX_URL='http://127.0.0.1:4173/?loadDemoPatch=future-canonical-single-triangle.hcl' \
WEBGPU_MATRIX_REPORT=artifacts/webgpu-future/p-08-single-runtime.json \
pnpm -s test:webgpu-matrix
```

```bash
WEBGPU_MATRIX_START_SERVER=1 \
WEBGPU_MATRIX_BUILD_FIRST=1 \
WEBGPU_MATRIX_URL='http://127.0.0.1:4173/?loadDemoPatch=future-canonical-repeat-grid.hcl' \
WEBGPU_MATRIX_REPORT=artifacts/webgpu-future/p-08-repeat-runtime.json \
pnpm -s test:webgpu-matrix
```

Fixtures:

- `src/demo/hcl/future-canonical-single-triangle.hcl`
- `src/demo/hcl/future-canonical-repeat-grid.hcl`

Expected artifacts:

- `artifacts/webgpu-future/p-08-canonical-mvp.vitest.json`
- `artifacts/webgpu-future/p-08-single-runtime.json`
- `artifacts/webgpu-future/p-08-repeat-runtime.json`
- all commands exit zero
- both runtime reports have `passed: true`

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-09` Canonical MVP UI Browser Workflow

Owner:

- `FUTURE-08`

Command:

```bash
pnpm exec playwright test \
  tests/e2e/webgpu-future/mvp-authoring-ui.spec.ts \
  --reporter=json \
  > artifacts/webgpu-future/p-09-mvp-ui.playwright.json
```

Browser workflow the spec must execute:

1. open `/?showPreview=true`
2. construct or edit `future-canonical-single-triangle.hcl` through the `Resources`, `Modulation`, `Scene`, and `Output` workspaces
3. construct or edit `future-canonical-repeat-grid.hcl` through the same workspaces
4. prove the flow without touching `RenderInstances2D`, `WebGPUType1Sink`, or hidden transport-oriented UI controls
5. save or reload and confirm preview/runtime still renders

Expected artifact:

- `artifacts/webgpu-future/p-09-mvp-ui.playwright.json`
- zero exit code
- JSON report shows the single targeted spec passed with no skipped tests

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-10`

### `P-10` Simulation Bridge Runtime Proof

Owner:

- `FUTURE-09`

Commands:

```bash
pnpm -s vitest run \
  src/compiler/frontend/__tests__/future-simulation-scene-bridge.test.ts \
  --reporter=json \
  --outputFile artifacts/webgpu-future/p-10-simulation-bridge.vitest.json
```

```bash
WEBGPU_MATRIX_START_SERVER=1 \
WEBGPU_MATRIX_BUILD_FIRST=1 \
WEBGPU_MATRIX_URL='http://127.0.0.1:4173/?loadDemoPatch=future-simulation-particles.hcl' \
WEBGPU_MATRIX_REPORT=artifacts/webgpu-future/p-10-simulation-runtime.json \
pnpm -s test:webgpu-matrix
```

Fixtures:

- `src/demo/hcl/future-simulation-particles.hcl`

Expected artifacts:

- `artifacts/webgpu-future/p-10-simulation-bridge.vitest.json`
- `artifacts/webgpu-future/p-10-simulation-runtime.json`
- both commands exit zero
- runtime report has `passed: true`

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-10`

### `P-11` Simulation UI Browser Workflow

Owner:

- `FUTURE-10`

Command:

```bash
pnpm exec playwright test \
  tests/e2e/webgpu-future/simulation-authoring-ui.spec.ts \
  --reporter=json \
  > artifacts/webgpu-future/p-11-simulation-ui.playwright.json
```

Browser workflow the spec must execute:

1. open `/?showPreview=true`
2. construct or edit `future-simulation-particles.hcl` through `Simulation`, `Scene`, and `Output`
3. make simulation-to-scene wiring visible and intentional in the UI
4. confirm preview/runtime renders without exposing low-level runtime transport controls
5. reload and confirm the same simulation proof patch still executes

Expected artifact:

- `artifacts/webgpu-future/p-11-simulation-ui.playwright.json`
- zero exit code
- JSON report shows the targeted simulation UI spec passed with no skipped tests

Evidence class:

- acceptance proof

Replay required after acceptance:

- none; this is the terminal UI proof in the current roadmap
