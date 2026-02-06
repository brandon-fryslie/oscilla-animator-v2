# Plan: Fix Memory Leaks

## Problem Statement

Long-running sessions accumulate memory through unbounded Maps, per-frame allocations that bypass GC, and caches without eviction. This manifests as monotonically growing heap usage during idle-but-running animations and during live editing with frequent recompiles.

## Investigation Summary

Six parallel investigations examined: RenderAssembler, RenderBufferArena, Canvas2DRenderer, global caches/pools, RuntimeState/banks, and observability hooks.

**Findings rated HIGH through LOW, grouped by fix approach.**

---

## Phase 1: Per-Frame Allocation Churn (Performance)

These aren't true leaks (GC reclaims them), but they create unnecessary allocation pressure at 60fps.

### 1a. Cache `fieldExprToSlot` Map at program level
**File:** `src/runtime/ScheduleExecutor.ts:136-141`
**Problem:** `new Map<number, ValueSlot>()` created every frame, content is deterministic per program.
**Fix:** Cache in a `WeakMap<CompiledProgramIR, Map<number, ValueSlot>>` following the existing `SLOT_LOOKUP_CACHE` pattern.

### 1b. Cache `sigToSlot` Map at program level
**File:** `src/runtime/ScheduleExecutor.ts:552-559`
**Problem:** Same pattern - `new Map<number, number>()` recreated every frame with identical content.
**Fix:** Same `WeakMap<CompiledProgramIR, ...>` caching pattern.

### 1c. Pre-compute dash pattern pixel arrays
**Files:** `src/render/svg/SVGRenderer.ts:287,392` and `src/render/canvas/Canvas2DRenderer.ts:141`
**Problem:** `.map(d => d * D)` allocates a temporary array per-instance (SVG) or per-op (Canvas) per-frame.
**Fix:** Allocate a reusable `dashPxBuffer: number[]` at renderer instance level, fill in-place.

---

## Phase 2: Unbounded Maps/Caches (True Leaks)

### 2a. `domainChangeLogThrottle` never cleared
**File:** `src/services/DomainChangeDetector.ts:14`
**Problem:** Module-level `Map<string, number>` that stores throttle timestamps per instanceId. Entries are never removed. Over an editing session with many graph changes, this grows indefinitely.
**Fix:** Clear stale entries in `detectAndLogDomainChanges()` — when an instance is removed from `newInstances`, also delete its throttle entry. (The `prevInstanceCounts` Map at line 11 already does cleanup at line 75, but `domainChangeLogThrottle` doesn't.)

### 2b. `ContinuityState.prevDomains` / `mappings` accumulate across hot-swaps
**File:** `src/runtime/ContinuityState.ts:115-118`, written at `src/runtime/ScheduleExecutor.ts:421,430`
**Problem:** `prevDomains.set(instanceId, newDomain)` runs every frame for each active instance. When instances are removed from the graph (user deletes blocks), their entries persist in `prevDomains` and `mappings` forever. Only `clearContinuityState()` clears them, which requires explicit user action.
**Fix:** After each frame (or on hot-swap), prune entries whose instanceId is not in the current program's `schedule.instances`. Add a `pruneStaleContinuity(continuity, activeInstanceIds)` function called from the hot-swap path.

### 2c. `DiagnosticHub.runtimeDiagnostics` unbounded
**File:** `src/diagnostics/DiagnosticHub.ts:59`
**Problem:** Runtime diagnostics are added via `raised` events but only removed via explicit `resolved` events. If diagnostics are never resolved (e.g., persistent NaN warnings), the Map grows indefinitely.
**Fix:** Add a cap (e.g., 200 entries). When exceeded, evict oldest by insertion order (Map iteration order). This is consistent with the existing bounded patterns elsewhere (DiagnosticsStore logs capped at 1000, HistoryService at 32 entries).

### 2d. SVG `GeometryDefCache.defIdByKey` unbounded
**File:** `src/render/svg/SVGRenderer.ts:99`
**Problem:** String-keyed Map that grows with every unique (topologyId, buffer identity) pair. Buffer identities change on recompile (new Float32Array allocations), so old keys become orphaned.
**Fix:** Call `defCache.clear()` on hot-swap (when program changes), since all geometry buffers are new anyway. The `clearAll()` method already exists but is only called on `dispose()`.

---

## Phase 3: Dead Code Cleanup

### 3a. `heavyMaterializationBlocks` is dead code
**File:** `src/runtime/RuntimeState.ts:281,371`
**Problem:** Declared in `HealthMetrics` interface and initialized in `createHealthMetrics()`, but `.set()` is never called anywhere in the codebase. This is dead scaffolding.
**Fix:** Remove the field from `HealthMetrics` interface, remove from `createHealthMetrics()`, and remove from test fixtures.

---

## Phase 4: Verification

### 4a. Add memory regression test
Create a test that:
1. Runs 1000 frames with a simple graph
2. Simulates 5 hot-swaps (recompiles)
3. Asserts that `continuity.prevDomains.size` equals current active instance count (not accumulated)
4. Asserts `domainChangeLogThrottle` size doesn't exceed active instance count

### 4b. Confirm existing bounded patterns are correct
Already verified as correct (no action needed):
- `SLOT_LOOKUP_CACHE` (WeakMap, auto-clears)
- `MATERIALIZER_POOL` (BufferPool with maxPoolSize=1000, releaseAll per frame)
- `topologyGroupCache` (WeakMap, auto-clears)
- `CompilationInspectorService` (capped at 2 snapshots)
- `HealthMonitor` (ring buffers, fixed capacity)
- `DiagnosticsStore` (logs capped at 1000, timing at 30)
- `HistoryService` (capped at 32 entries)
- `RenderBufferArena` (pre-allocated, reset per frame)

---

## Execution Order

1. **Phase 2** first (true leaks) — highest impact
2. **Phase 1** next (allocation churn) — measurable perf win
3. **Phase 3** (dead code) — hygiene
4. **Phase 4** (verification) — prevents regression

## Confidence

**HIGH** — All findings are based on direct code reading. The investigation covered all files mentioned in the user's analysis plus discovered additional concerns (DomainChangeDetector, DiagnosticHub). The patterns are straightforward unbounded-Map growth, and fixes follow existing codebase patterns (WeakMap caching, explicit pruning, bounded collections).
