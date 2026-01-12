# Compiler Audit Red Flags: Export Pipeline (with Solutions)

Scope: phase-driven sampling, deterministic export, and any export-specific runtime/compiler paths.

## Critical

- **No export pipeline exists in code.**
  - **Where:** No export modules or runtime entry points; `rg -i export` yields only unrelated items (path library JSON export, debug table export).
  - **Impact:** Design-doc requirements (phase-driven sampling, loop closure, deterministic exports) are not implemented at all; any “export” would be ad‑hoc or wrong.
  - **Solution:**
    1) Add an `export` module that drives the IR runtime headlessly.
    2) Define `ExportSettings` with target (video/svg), fps, duration, and loop policy.
    3) Implement export‑time execution that evaluates the program at explicit times or phases.

- **Cycle export requires phase-driven evaluation but there’s no phase override path.**
  - **Where:** `resolveTime()` only accepts `tAbsMs` and `TimeModelIR`; no API to override phase.
  - **Impact:** Cyclic exports cannot guarantee loop closure at arbitrary fps, violating spec.
  - **Solution:**
    1) Add an export context (`ExportTimeOverride`) that allows `phase01` to be forced.
    2) In cycle export, compute per-frame phase = frameIndex / framesPerCycle, and override time derivation so phase is exact.
    3) Allow `resolveTime()` to accept `{ tAbsMs, phaseOverride? }` and produce consistent `tModelMs`, `phase01`, `wrapEvent`.

## High

- **No export diagnostics or capability checks.**
  - **Where:** No exporter validates whether features are exportable (e.g., unsupported renderer features, paths needing flattening).
  - **Impact:** Exports can silently be wrong or non‑deterministic.
  - **Solution:**
    1) Add an export analysis pass that inspects RenderIR for unsupported features.
    2) Emit structured diagnostics with export domain and target (video/svg).

- **Materialization policy lacks export scope.**
  - **Where:** schedule materialization steps only consider render sinks and debug probes.
  - **Impact:** Export‑only materializations (e.g., path flattening, color conversions) aren’t requested or cached.
  - **Solution:**
    1) Extend materialization steps with `policy: "perFrame" | "perExport"` and allow export‑only steps.
    2) Add cache keys that include export settings (fps, flatten tolerance, color space).

## Medium

- **No export metadata is emitted.**
  - **Where:** `CompiledProgramIR` lacks export manifest fields.
  - **Impact:** Seed, time model, and export plan aren’t persisted; exports can’t be reproduced.
  - **Solution:**
    1) Emit an export manifest (seed, timeModel, fps, framesPerCycle, duration).
    2) Store this alongside output frames or SVG metadata.

- **No separation between UI preview and export evaluation.**
  - **Impact:** Export risks inheriting UI sampling errors (e.g., RAF jitter, time drift).
  - **Solution:**
    1) Drive export using deterministic time steps (fixed frame indices).
    2) Reuse the IR runtime with explicit time overrides; do not call Player/RAF.

## Notes

- Specs in `design-docs/2-TimeRoot/8-Export.md` and `design-docs/3-Synthesized/08-Export.md` require explicit phase-driven sampling for cyclic exports. This is not implemented anywhere in the code today.

