# Three Migration Renderer-Shell Baseline

**Date:** 2026-06-23
**Status:** Groundwork
**Backlog:** `oscilla-pillars-cleanup-x80.1`

## Purpose

Define what counts as a *passing renderer/runtime-shell baseline* and make it
mechanically checkable, so Three-migration work can be judged by a command
instead of by guesswork.

`// [LAW:verifiable-goals]` Backend migration tickets need a deterministic "is
the shell still green?" check before and after their work, not ad hoc manual
inspection.
`// [LAW:single-enforcer]` Baseline verification ownership lives in one
renderer/runtime smoke path, not scattered across each ticket.

## The One Command

```
npm run verify:renderer-shell
```

Implementation: [`scripts/verify-renderer-shell-baseline.mjs`](../scripts/verify-renderer-shell-baseline.mjs).

This is the canonical baseline gate. It runs three gates in order, reports each
result, writes a machine-readable summary, and exits non-zero if any gate fails.
A green run prints `RENDERER-SHELL BASELINE: PASS`.

`// [LAW:no-silent-failure]` Every gate runs and every result is reported. A
skipped or swallowed gate would let a red baseline masquerade as green for the
ticket that builds on top of it.

## The Three Gates

| Gate | What runs | What it proves |
| --- | --- | --- |
| `typecheck` | `tsc -b` (`npm run typecheck`) | The TS↔runtime↔render contracts still type. Includes the WebGPU capability shim (`NavigatorWithGpu`). |
| `runtime-tests` | Vitest over the renderer-shell targeted set (below) | Runtime lifecycle, compile/hot-swap, and render-facade fault policy still behave. |
| `app-shell-smoke` | Playwright `tests/e2e/editor/demo-bootstrap.spec.ts` | The real app shell boots, the runtime bootstrap probe reaches `succeeded`, and at least one frame renders with no fatal runtime/bootstrap error. |

### Targeted runtime test set

`// [LAW:one-source-of-truth]` The list is declared once in
`scripts/verify-renderer-shell-baseline.mjs` (`RENDERER_SHELL_TESTS`). This table
is a description of *why* those files are the set, not a second copy to keep in
sync.

The set is exactly the tests covering the **"Keep"** surfaces named in
[three-migration-renderer-seam-inventory.md](./three-migration-renderer-seam-inventory.md):

- runtime lifecycle — `RuntimeService`, `AnimationLoop`
- compile / hot-swap — `CompileOrchestrator` schedule contract, `LiveRecompile`
- render-facade fault policy — `renderer-circuit-breaker`

`// [LAW:decomposition]` The cut follows the migration's real joint — the
surfaces that must stay stable while the renderer underneath
`createWebGPURenderer()` is replaced — not "tests that look runtime-ish". The
frozen `gpu-ir` / shape-bank tests are deliberately excluded: they cover the
legacy backend the migration is replacing.

## Passing Baseline Definition

The renderer-shell baseline is **green** when, on a clean install
(`pnpm install --frozen-lockfile`):

1. `typecheck` exits 0.
2. The targeted runtime test set passes with no failures.
3. The app-shell smoke check passes: bootstrap reaches `succeeded`, a frame
   renders, and none of the demo-bootstrap failure signals fire.

Equivalently: `npm run verify:renderer-shell` exits 0 and prints
`RENDERER-SHELL BASELINE: PASS`.

### Artifact

The gate writes
`artifacts/three-migration/renderer-shell-baseline/summary.json`
(git-ignored — derived, not authoritative) with per-gate `passed`/`duration_ms`/`reason`,
the commit, and an overall `passed`. Downstream tickets may assert against it.

## Failure Signals

The baseline is **red** when any of:

- `tsc -b` reports any error (notably any reintroduced `NavigatorWithGpu`
  capability-shim mismatch — see below).
- Any targeted runtime test fails.
- The app shell fails to boot, the bootstrap probe never reaches `succeeded`,
  no frame renders, or a fatal runtime/bootstrap error is captured.

A red gate makes `verify:renderer-shell` exit non-zero. Fix the regression;
do not gate it away.

## Baseline State At This Ticket

Verified green at commit `dfcc376a` (origin/master):

- `npm run typecheck` — clean. The `NavigatorWithGpu` typecheck mismatch named
  in this ticket was already resolved upstream
  ([`src/render/webgpu/gpu-api.ts`](../src/render/webgpu/gpu-api.ts), PR #235):
  `getNavigatorGpu()` reads `navigator as Partial<NavigatorWithGpu>` against a
  module-local interface, so no DOM-lib `navigator.gpu` type conflict remains.
  There was no live failure to fix; the gate now guards against its return.
- Full Vitest suite — 207 files / 2076 tests pass (1 file, 3 tests skipped/todo).
- App-shell smoke (`demo-bootstrap`) — passes.

## Scope Boundary

`// [LAW:locality-or-seam]` This ticket adds verification and documentation only.

This baseline introduces **no** backend implementation: no `ScenePlan`, no
`ThreeForkRenderer`, no renderer behavior change. The renderer behind
`createWebGPURenderer()` remains the scorched-earth stub. Those land in the
`ulu` implementation stack, which must keep this baseline green.

## Related References

- [three-migration-renderer-seam-inventory.md](./three-migration-renderer-seam-inventory.md) — keep/adapter/freeze/delete map and the cut points.
- [three-migration-first-proof-contract.md](./three-migration-first-proof-contract.md) — the steel-thread proof contract (`ulu.5`), which adds its own `tests/e2e/webgpu/three-grid-of-squares.spec.ts` on top of this shell baseline.
- [three-migration-backend-canon.md](./three-migration-backend-canon.md) — backend ownership and guardrails.
