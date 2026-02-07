# Evaluation: Memory Leak Fixes
Generated: 2026-02-06

## Context

An existing plan exists at `.claude/plans/memory-leak-fixes.md` that identified 9 work items across 4 phases. This evaluation checks current implementation status against that plan.

## Prior Work Assessment

| Item | Plan Phase | Status | Evidence |
|------|-----------|--------|----------|
| pruneStaleContinuity | Phase 2 (true leaks) | DONE | ContinuityState.ts:200-219, called from CompileOrchestrator.ts:324 |
| domainChangeLogThrottle cleanup | Phase 2 | DONE | DomainChangeDetector.ts:73-77, both maps cleaned |
| DiagnosticHub cap | Phase 2 | DONE | DiagnosticHub.ts:59, MAX_RUNTIME_DIAGNOSTICS=200, FIFO eviction |
| SVG GeometryDefCache hot-swap clear | Phase 2 | PARTIALLY | Method exists but never called from hot-swap path |
| fieldExprToSlot caching | Phase 1 (perf) | DONE | ScheduleExecutor.ts:44-45, WeakMap per program |
| sigToSlot caching | Phase 1 | DONE | ScheduleExecutor.ts:47-48, WeakMap per program |
| Dash pattern buffer reuse | Phase 1 | PARTIALLY | SVG pre-computes; Canvas2D still allocates per pass |
| heavyMaterializationBlocks removal | Phase 3 (dead code) | DONE | Successfully purged from codebase |
| Memory leak guard tests | Phase 4 (verification) | DONE | memory-leak-guards.test.ts, 7 tests |

## Verified Bounded Patterns (No Action Needed)

- `SLOT_LOOKUP_CACHE` - WeakMap, auto-clears
- `MATERIALIZER_POOL` - BufferPool with maxPoolSize=1000, releaseAll per frame
- `topologyGroupCache` - WeakMap, auto-clears
- `CompilationInspectorService` - capped at 2 snapshots
- `HealthMonitor` - ring buffers, fixed capacity
- `DiagnosticsStore` - logs capped at 1000, timing at 30
- `HistoryService` - capped at 32 entries
- `RenderBufferArena` - pre-allocated, reset per frame

## Remaining Gaps

### Gap 1: SVG GeometryDefCache not cleared on hot-swap
- `SVGRenderer.invalidateGeometryCache()` exists and works correctly
- But it has **zero call sites** in the codebase
- The hot-swap path (CompileOrchestrator) does not trigger it
- Risk: SVG geometry cache accumulates stale defs across recompiles
- Severity: LOW (SVG is export-only, not the main render path)

### Gap 2: Canvas2D dash pattern per-pass allocation
- `Canvas2DRenderer.ts:139-142` creates `dashPx` array fresh each frame
- SVG renderer already pre-computes the string outside the loop
- Risk: Minor GC pressure at 60fps, not a leak
- Severity: LOW (small arrays, GC handles it fine)

## Verdict: CONTINUE

Two low-severity gaps remain. Both are straightforward fixes with clear implementation paths. No blockers or ambiguities.
