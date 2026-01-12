# Paths2D Risk Register & Mitigations

This file tracks risks specific to the IR-only Paths2D pipeline and how to mitigate them.

## Risk: Path buffers too small
- **Cause:** `materializePath` underestimates command/point counts.
- **Impact:** Buffer overflow or truncated geometry.
- **Mitigation:** Implement resize-on-demand or grow heuristics based on prior frame sizes.

## Risk: Unsupported Field<path> ops
- **Cause:** Field ops (map/zip/transform/broadcast) not implemented for path types.
- **Impact:** Compile-time or runtime errors when paths are dynamic.
- **Mitigation:** Explicit error messages in lowering and runtime with a TODO pointing to missing opcodes/kernels.

## Risk: Incorrect per-path indexing
- **Cause:** cmdStart/cmdLen/pointStart/pointLen mismatched to encoded data.
- **Impact:** Corrupted geometry and rendering artifacts.
- **Mitigation:** Add DevTools inspection steps, validate lengths, and assert that computed lengths match encoded output.

## Risk: Style slot type mismatch
- **Cause:** Style slots (fill/stroke/opacity) carry unexpected types.
- **Impact:** Renderer throws or silently mis-renders.
- **Mitigation:** Runtime slot checks for type and length; early error on mismatch.

## Risk: Field<path> type drift
- **Cause:** Type system conflates `Field:path` with other domains.
- **Impact:** Incorrect IR lowering or runtime dispatch.
- **Mitigation:** Ensure TypeDesc world/domain checks in lowering; add explicit checks in schedule.

## Risk: Non-deterministic path generation
- **Cause:** Path ops rely on non-seeded randomness.
- **Impact:** Breaks determinism (scrubbing, export).
- **Mitigation:** Use seeded sources only; reject any random op without a seed.

