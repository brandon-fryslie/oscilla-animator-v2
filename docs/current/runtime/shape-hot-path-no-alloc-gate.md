# Shape Hot Path No-Alloc Gate

This gate is the machine-verifiable enforcement for P0-3 shape handle execution.

## Primary CI Gates

1. `src/runtime/__tests__/shape-hot-path-no-alloc-gate.test.ts`
   - Fails if legacy `writeShape2D(...)` calls reappear in frame executors.
   - Fails if legacy `readShape2D(...)` unpack helper reappears in `RenderAssembler` hot grouping logic.
   - Fails if `Path2D` allocations appear in runtime hot modules.

2. `src/compiler/__tests__/no-shape2d-runtime-storage.test.ts`
   - Fails if compiler-emitted runtime slot metadata reintroduces `shape2d` storage-class entries.
   - Fails if any `evalOne` target resolves to `shape2d` storage in the runtime address table.

## Supplemental Profiler Procedure

The profiler check is supplemental evidence, not the primary pass/fail gate.

1. Run memory profile suite:
   - `pnpm test:memory`
2. Confirm bounded heap growth across repeated frame batches.
3. Treat regressions as failures if they indicate per-frame object churn in the shape path.

The deterministic tests above are the required enforcement. Profiler evidence is used to validate runtime behavior under load.
