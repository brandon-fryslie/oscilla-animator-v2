# Definition of Done: Sprint 2 - Full Data Layer

**Sprint ID**: SPRINT-20260120-170100
**Feature**: Full Data Layer (DebugGraph + Ring Buffers + ValueSummary)

---

## Functional Requirements

### F1: DebugGraph Construction
- [ ] DebugGraph is built at end of `compileBusAwarePatch()`
- [ ] DebugGraph.buses contains all buses with:
  - [ ] Correct BusId, name, SignalType
  - [ ] CombineMode matches bus configuration
  - [ ] publisherIds array populated
  - [ ] listenerIds array populated
- [ ] DebugGraph.publishers contains all publishers with:
  - [ ] Correct PublisherId, busId, from/to endpoints
  - [ ] adapterChain resolved
  - [ ] lensStack resolved
  - [ ] sortKey assigned
- [ ] DebugGraph.listeners contains all listeners with correct fields
- [ ] DebugGraph.byPort reverse-lookup index populated:
  - [ ] All input ports have entries
  - [ ] incomingListeners arrays populated
  - [ ] outgoingPublishers arrays populated
- [ ] DebugGraph.pipelines pre-rendered for all bindings
- [ ] DebugGraph.busIndexById and bindingIndexById assigned sequentially (0..N-1)

### F2: ValueSummary Support
- [ ] ValueSummary tagged union defined for all 7 types:
  - [ ] `{ t: 'num'; v: number }` for float/int
  - [ ] `{ t: 'vec2'; x: number; y: number }` for vec2
  - [ ] `{ t: 'color'; rgba: number }` for color (packed uint32)
  - [ ] `{ t: 'phase'; v: number }` for phase (0..1)
  - [ ] `{ t: 'bool'; v: 0 | 1 }` for bool
  - [ ] `{ t: 'trigger'; v: 0 | 1 }` for trigger/event
  - [ ] `{ t: 'none' }` for no data
  - [ ] `{ t: 'err'; code: string }` for errors
- [ ] `summarizeValue(slotId, type, valueStore): ValueSummary` implemented
- [ ] `formatValueSummary(v): string` formats all types correctly:
  - [ ] num: "0.73" (2 decimals)
  - [ ] phase: "25.0%" (percentage)
  - [ ] color: "#C86432" (hex)
  - [ ] vec2: "(150, 200)" (x, y)
  - [ ] bool: "true" | "false"
  - [ ] trigger: "fired" | "idle"

### F3: Ring Buffer Implementation
- [ ] Generic `RingBuffer<T>` class works with any type
- [ ] `NumericRingBuffer` uses Float64Array for performance
- [ ] Methods implemented:
  - [ ] `push(item)` - adds item, wraps at capacity
  - [ ] `getWindow(count)` - returns last N items
  - [ ] `getAll()` - returns all items in chronological order
  - [ ] `clear()` - resets buffer
  - [ ] `isFull()` - returns true if capacity reached
- [ ] Wrap-around behavior correct (oldest data overwritten)
- [ ] No off-by-one errors in indexing

### F4: DebugSnapshot Emission
- [ ] DebugSnapshot built at sample rate (15Hz ±10%)
- [ ] Snapshot structure matches spec:
  - [ ] `patchRevision` matches current compilation
  - [ ] `tMs` is current time in milliseconds
  - [ ] `busNow[]` indexed by busIndexById
  - [ ] All busNow entries have correct ValueSummary tag
  - [ ] `health` indicators populated (nanCount, infCount, silentBuses)
- [ ] Snapshots emitted via `tap?.onSnapshot?.(snapshot)`
- [ ] DebugService receives snapshots and stores in ring buffers
- [ ] Ring buffers retain 10 seconds of history (150 samples @ 15Hz)

### F5: DebugService Query API
- [ ] `setDebugGraph(g: DebugGraph): void` implemented
  - [ ] Stores DebugGraph immutably
  - [ ] Allocates ring buffers for all buses
  - [ ] Resets buffers on recompilation
- [ ] `pushSnapshot(s: DebugSnapshot): void` implemented
  - [ ] Appends values to ring buffers
  - [ ] Handles wrap-around correctly
- [ ] `probePort(portKey: PortKey): PortProbeResult` implemented
  - [ ] Returns port name, type, current value
  - [ ] Includes bus information (busId, busName)
  - [ ] Includes listener chain (if exists)
  - [ ] Returns undefined for unknown ports
- [ ] `probeBus(busId: BusId): BusProbeResult` implemented
  - [ ] Returns bus name, type, combineMode
  - [ ] Includes all publishers with current values
  - [ ] Includes all listeners
- [ ] `getBusSeries(busId: BusId, windowMs: number): Series` implemented
  - [ ] Returns timeseries data for specified window
  - [ ] Includes stats (min, max, mean, range)
  - [ ] Handles missing/incomplete data gracefully

### F6: SimpleDebugPanel Upgrade
- [ ] Panel now calls `probePort(portKey)` instead of `getEdgeValue(edgeId)`
- [ ] Displays PortProbeResult fields:
  - [ ] Port name (e.g., "DotsRenderer.radius")
  - [ ] Type badge (e.g., "Signal:Float")
  - [ ] Bus name (e.g., "Comes from: energy")
  - [ ] Current value formatted via formatValueSummary
- [ ] Panel updates at 1Hz (unchanged from Sprint 1)
- [ ] Panel still toggleable (same UX as Sprint 1)

---

## Technical Requirements

### T1: DebugGraph Builder Implementation
- [ ] `DebugGraphBuilder.ts` exports `buildDebugGraph(compilerState): DebugGraph`
- [ ] Builder accesses resolved buses, publishers, listeners from compiler
- [ ] byPort index built by iterating listeners (for inputs) and publishers (for outputs)
- [ ] Pipelines pre-rendered with stages in evaluation order
- [ ] busIndexById and bindingIndexById are sequential (no gaps)
- [ ] Builder has unit tests covering:
  - [ ] Empty patch (no buses)
  - [ ] Single bus, one publisher, one listener
  - [ ] Multi-input port (multiple listeners to same port)
  - [ ] Publisher with adapter chain
  - [ ] Publisher with lens stack

### T2: DebugTap Interface Extension
- [ ] `DebugTap` interface in RuntimeState.ts extended with:
  ```typescript
  interface DebugTap {
    level: DebugLevel;
    onDebugGraph?(g: DebugGraph): void;
    onSnapshot?(s: DebugSnapshot): void;
    recordBusNow?(busId: string, v: ValueSummary): void;
    recordBindingNow?(bindingId: string, v: ValueSummary): void;
    hitMaterialize?(who: { blockId: string; reason: string }): void;
    hitAdapter?(adapterId: string): void;
    hitLens?(lensId: string): void;
  }
  ```
- [ ] Sprint 1's `recordSlotValue` removed (breaking change documented)
- [ ] All methods are optional (use optional chaining in calls)

### T3: Snapshot Builder Implementation
- [ ] `buildDebugSnapshot(state, graph, tMs): DebugSnapshot` function created
- [ ] Iterates buses using busIndexById for correct indexing
- [ ] Converts slot values to ValueSummary using SignalType from DebugGraph
- [ ] Handles missing slots (returns `{ t: 'none' }`)
- [ ] Handles NaN/Inf (returns `{ t: 'err', code: 'nan' | 'inf' }`)
- [ ] Health indicators sourced from HealthMonitor (if available)
- [ ] Function is pure (no side effects)

### T4: Runtime Integration
- [ ] `ScheduleExecutor.ts` tracks sample time (`nextSampleTime`)
- [ ] Snapshot built and emitted at 15Hz (every ~66ms)
- [ ] Uses `performance.now()` or `tMs` for timing
- [ ] Snapshot emission happens after frame execution (not mid-frame)
- [ ] DebugService wired as tap implementation in main app initialization
- [ ] Sprint 1's per-slot recording removed (replaced by snapshot-based)

### T5: Memory Management
- [ ] Ring buffers pre-allocated at `setDebugGraph()` time
- [ ] Total memory usage for 50 buses × 150 samples ≈ 150KB
- [ ] NumericRingBuffer uses Float64Array (8 bytes per sample)
- [ ] No unbounded growth (buffers have fixed capacity)
- [ ] Buffers cleared on recompilation (new DebugGraph)
- [ ] No memory leaks over 10,000 frames (verified with profiler)

---

## Performance Requirements

### P1: Frame Budget (Same as Sprint 1)
- [ ] Frame execution time with snapshots ≤ 1% slower than Sprint 1
- [ ] Snapshot building time < 1ms (measured separately)
- [ ] No frame drops during normal operation (60fps maintained)
- [ ] Benchmark: 1000 frames, compare average frame time to Sprint 1 baseline

### P2: DebugGraph Build Time
- [ ] DebugGraph construction < 50ms for patch with 100 buses
- [ ] Construction happens during compilation (not on frame loop)
- [ ] No user-visible delay on recompile

### P3: Ring Buffer Performance
- [ ] `push()` operation < 1μs (constant time)
- [ ] `getWindow(150)` operation < 100μs (linear in window size)
- [ ] No GC pauses from buffer allocations (pre-allocated)

---

## Quality Requirements

### Q1: Code Quality
- [ ] All new files have TypeScript types (no `any` without justification)
- [ ] DebugGraph types match spec exactly (08-observation-system.md)
- [ ] ValueSummary is exhaustively handled (no missing switch cases)
- [ ] ESLint passes with no warnings
- [ ] Prettier formatting applied
- [ ] No console.log statements (use proper logging if needed)
- [ ] Meaningful variable names

### Q2: Testing
- [ ] Unit tests for RingBuffer:
  - [ ] Push and wrap-around
  - [ ] getWindow returns correct window
  - [ ] getAll returns items in order
  - [ ] clear works
- [ ] Unit tests for ValueSummary:
  - [ ] summarizeValue for all 7 types
  - [ ] formatValueSummary for all types
  - [ ] Error cases (NaN, Inf)
- [ ] Unit tests for DebugService:
  - [ ] setDebugGraph allocates buffers
  - [ ] pushSnapshot appends to buffers
  - [ ] probePort returns correct result
  - [ ] probeBus returns complete structure
  - [ ] getBusSeries returns timeseries
- [ ] Integration test: Compile → Runtime → DebugService
  - [ ] DebugGraph built with correct structure
  - [ ] Snapshots emitted at 15Hz
  - [ ] Ring buffers populated over 10 seconds
  - [ ] probePort returns current value
- [ ] All tests pass (`npm run test`)

### Q3: Error Handling
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] No runtime errors in console during normal operation
- [ ] Graceful handling of:
  - [ ] Port not in byPort → return undefined
  - [ ] Bus not in DebugGraph → return undefined
  - [ ] NaN/Inf slot values → `{ t: 'err', code: 'nan' }`
  - [ ] Missing DebugGraph → queries return undefined
- [ ] No uncaught exceptions

---

## Documentation Requirements

### D1: Code Comments
- [ ] DebugGraph structure has JSDoc comments on all fields
- [ ] DebugGraphBuilder has comments explaining byPort indexing
- [ ] RingBuffer has usage examples in comments
- [ ] ValueSummary has comments explaining each variant

### D2: Sprint Artifacts
- [ ] PLAN.md completed (this file's companion)
- [ ] CONTEXT.md updated with:
  - [ ] Decisions made during implementation
  - [ ] Lessons learned
  - [ ] Deviations from spec (if any)
- [ ] This DOD.md reviewed and updated

---

## Acceptance Criteria (End-User Perspective)

### AC1: DebugGraph Visible in Logs
**Given** a patch with 5 buses and 10 bindings
**When** patch compiles
**Then**:
- [ ] Console log shows: "DebugGraph: 5 buses, 10 publishers, 10 listeners"
- [ ] DebugGraph can be inspected in DevTools (window.debugService.getDebugGraph())
- [ ] All buses have non-empty publisherIds and listenerIds arrays

### AC2: Value Display for All Types
**Given** a test patch with edges of all 7 payload types
**When** user hovers each edge
**Then**:
- [ ] Float edge shows: "Signal:Float: 0.73"
- [ ] Phase edge shows: "Signal:Phase: 25.0%"
- [ ] Color edge shows: "Signal:Color: #C86432"
- [ ] Vec2 edge shows: "Signal:Vec2: (150, 200)"
- [ ] Bool edge shows: "Signal:Bool: true"
- [ ] Trigger edge shows: "Signal:Trigger: fired" (if active)
- [ ] No "t: 'err'" unless actual error (NaN/Inf)

### AC3: Ring Buffer History
**Given** a running patch
**When** patch runs for 15 seconds
**Then**:
- [ ] `debugService.getBusSeries(busId, 10000)` returns ~150 samples
- [ ] Oldest sample is ~10 seconds old
- [ ] Newest sample is current value
- [ ] Stats (min, max, mean) calculated correctly

### AC4: Recompilation Behavior
**Given** a patch with DebugGraph and ring buffers populated
**When** user recompiles patch (edit and save)
**Then**:
- [ ] New DebugGraph built
- [ ] Ring buffers cleared
- [ ] Snapshots start accumulating from zero
- [ ] No stale data from old patch
- [ ] No crashes or errors

---

## Regression Prevention

### R1: Sprint 1 Features Preserved
- [ ] Edge hover still works (same UX)
- [ ] SimpleDebugPanel still displays values
- [ ] Panel toggle still works
- [ ] Frame execution still works (no breakage)

### R2: Performance Not Degraded
- [ ] Frame time same as Sprint 1 (±1%)
- [ ] Memory usage increased by expected amount (~150KB for buffers)
- [ ] No new GC pauses

### R3: Backward Compatibility
- [ ] System works with `tap = undefined` (optional feature)
- [ ] DebugGraph is optional output of compiler (doesn't break non-debug builds)

---

## Known Limitations (Acceptable for Sprint 2)

**Documented limitations** (not DoD failures):
- SimpleDebugPanel still exists (text-only, no fancy renderers) → Sprint 3 replaces it
- No popover positioning → Sprint 3
- No trace view UI → Sprint 3
- DebugLevel enforcement incomplete (all recording happens at FULL) → Future sprint
- Performance counters (perf field) not populated → Future sprint
- No Field/Shape value capture (only scalar types) → Future (may require spec update)

These are **intentional scope limits** for Sprint 2. Future sprints will address them.

---

## Sign-off Checklist

Before marking sprint DONE:
- [ ] All checkboxes in sections F1-F6 checked
- [ ] All checkboxes in sections T1-T5 checked
- [ ] All checkboxes in sections P1-P3 checked
- [ ] All checkboxes in sections Q1-Q3 checked
- [ ] All checkboxes in sections AC1-AC4 verified by manual testing
- [ ] All checkboxes in sections R1-R3 verified
- [ ] Sprint retrospective completed (what went well, what didn't)
- [ ] CONTEXT.md updated with implementation decisions
- [ ] DebugGraph structure logged and validated
- [ ] Ring buffer memory usage confirmed (~150KB)

---

**DEFINITION OF DONE ENDS HERE**

---

## Verification Protocol

**Who**: Developer implementing sprint
**When**: Before marking sprint COMPLETE
**How**:

1. Run automated tests: `npm run test && npm run typecheck`
2. Start dev server: `npm run dev`
3. Load test patch with all 7 payload types
4. Open browser DevTools console
5. Verify DebugGraph log: "DebugGraph: X buses, Y publishers, Z listeners"
6. Inspect `window.debugService.graph` (or equivalent)
7. Hover edges of each type, verify ValueSummary tags correct
8. Let patch run for 30 seconds
9. Call `debugService.getBusSeries(busId, 10000)` for several buses
10. Verify timeseries has ~150 samples, stats look correct
11. Edit patch, recompile
12. Verify new DebugGraph built, ring buffers cleared
13. Check performance: Run 1000 frames, ensure stable 60fps
14. Check memory: DevTools Memory tab, ensure ~150KB for buffers
15. Review code: All new files have proper types, no TODOs left
16. Sign off in PLAN.md

**Evidence**: Screenshots of DebugGraph in DevTools, timeseries output, performance benchmark results, memory profiler screenshot

---

**END OF DEFINITION OF DONE**
