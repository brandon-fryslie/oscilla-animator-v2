# Plan: Refactor main.ts - Separate Concerns

**Status**: APPROVED
**Created**: 2025-01-25
**Confidence**: HIGH (clear separation boundaries, well-understood code)

## Problem Statement

`main.ts` at ~1220 lines has become a dumping ground containing:
1. **Demo patches** (7 patch builders, ~450 lines) - should be in dedicated patch library
2. **Patch persistence** (serialize/deserialize/localStorage, ~100 lines) - should be a service
3. **Live recompile system** (MobX reactions, debouncing, ~100 lines) - should be a service
4. **Animation loop** (frame execution, rendering, metrics, ~100 lines) - should be a service
5. **Debug probe setup** (~20 lines) - already mostly in DebugService, just needs wiring
6. **Domain change detection** (~60 lines) - should be in continuity system
7. **Compile orchestration** (~120 lines) - should be a service

What should remain in main.ts:
- React app bootstrap (~30 lines)
- Canvas setup and ref management
- Store initialization coordination
- Entry point for services

## Proposed Architecture

```
src/
├── main.ts                      # Slim bootstrap only (~100 lines)
├── demo/                        # NEW: Demo patch library
│   ├── index.ts                 # Exports patches array + types
│   ├── golden-spiral.ts
│   ├── domain-test.ts
│   ├── tile-grid.ts
│   ├── orbital-rings.ts
│   ├── rect-mosaic.ts
│   ├── shape-kaleidoscope.ts
│   └── perspective-camera.ts
├── services/
│   ├── PatchPersistence.ts      # NEW: localStorage save/load/serialize
│   ├── CompileOrchestrator.ts   # NEW: compile, swap, state migration
│   ├── LiveRecompile.ts         # NEW: MobX reactions, debouncing
│   ├── AnimationLoop.ts         # NEW: rAF, frame execution, metrics
│   └── (existing services...)
└── runtime/
    └── DomainChangeDetector.ts  # NEW: domain change logging (or extend ContinuityState)
```

## Implementation Phases

### Phase 1: Extract Demo Patches (LOW RISK)
**Confidence**: VERY HIGH

1. Create `src/demo/` directory
2. Extract each `patchXxx` function to its own file
3. Create `src/demo/index.ts` that exports:
   - `PatchBuilder` type
   - `patches` array
   - `DEFAULT_PATCH_INDEX`
4. Update `main.ts` to import from `src/demo`

**Verification**: All 7 demo patches load and render correctly

### Phase 2: Extract Patch Persistence Service (LOW RISK)
**Confidence**: VERY HIGH

1. Create `src/services/PatchPersistence.ts` containing:
   - `STORAGE_KEY` constant
   - `SerializedPatch` interface
   - `serializePatch()`
   - `deserializePatch()`
   - `savePatchToStorage()`
   - `loadPatchFromStorage()`
   - `clearStorageAndReload()`
2. Export all functions
3. Update `main.ts` to import from service

**Verification**: Patch persistence works (save, load, clear)

### Phase 3: Extract Compile Orchestrator (MEDIUM RISK)
**Confidence**: HIGH

This is the most complex extraction - needs careful dependency management.

1. Create `src/services/CompileOrchestrator.ts` containing:
   - `compileAndSwap()` function
   - `setupDebugProbe()` helper (or keep in DebugService)
   - State migration coordination
   - ProgramSwapped event emission
2. Define clear interface:
   ```typescript
   interface CompileOrchestratorDeps {
     store: RootStore;
     sessionState: SessionState;
     getCurrentState: () => RuntimeState | null;
     setCurrentState: (state: RuntimeState) => void;
     getCurrentProgram: () => Program | null;
     setCurrentProgram: (program: Program) => void;
   }
   ```
3. Create factory function or class to manage dependencies

**Verification**:
- Initial compile succeeds
- Live recompile (param changes) works
- State migration preserves continuity

### Phase 4: Extract Live Recompile Service (MEDIUM RISK)
**Confidence**: HIGH

1. Create `src/services/LiveRecompile.ts` containing:
   - `hashBlockParams()` helper
   - `scheduleRecompile()` with debouncing
   - `setupLiveRecompileReaction()` MobX setup
   - `cleanupReaction()` for teardown
2. Depends on CompileOrchestrator
3. Takes store as dependency

**Verification**: Parameter slider changes trigger recompile

### Phase 5: Extract Animation Loop (MEDIUM RISK)
**Confidence**: HIGH

1. Create `src/services/AnimationLoop.ts` containing:
   - `AnimationLoop` class with start/stop/pause
   - Frame timing metrics
   - Health monitoring integration
   - Continuity store updates
   - Stats callback management
2. Dependencies: RuntimeState, Program, Canvas, Store
3. Clean lifecycle management

**Verification**:
- Animation runs smoothly
- FPS counter updates
- Health snapshots emit correctly

### Phase 6: Domain Change Detection (LOW RISK)
**Confidence**: VERY HIGH

1. Move to `src/runtime/DomainChangeDetector.ts` or extend `ContinuityState.ts`
2. Contains:
   - `prevInstanceCounts` tracking
   - `domainChangeLogThrottle`
   - `logDomainChange()`
   - `detectAndLogDomainChanges()`
3. Called from CompileOrchestrator

**Verification**: Domain count changes logged correctly

## Dependency Graph

```
main.ts
  └── initializeRuntime()
       ├── PatchPersistence.loadPatchFromStorage()
       ├── patches[] (from src/patches)
       ├── CompileOrchestrator.compileAndSwap()
       │    ├── DomainChangeDetector
       │    └── DebugService.setupDebugProbe()
       ├── LiveRecompile.setupReaction()
       │    └── CompileOrchestrator.compileAndSwap()
       └── AnimationLoop.start()
            ├── RuntimeState
            ├── Program
            └── HealthMonitor
```

## Risk Mitigation

1. **Extract one concern at a time** - Each phase is independently verifiable
2. **Keep existing tests passing** - `initial-compile-invariant.test.ts` must pass throughout
3. **Maintain backwards compatibility** - Window globals for presets still work
4. **Add integration test** - Verify full startup cycle after refactor

## Success Criteria

1. `main.ts` reduced to ~100-150 lines (from ~1220)
2. Each extracted module has single responsibility
3. All existing functionality preserved
4. Demo patches easily discoverable in `src/patches/`
5. Services are testable in isolation
6. No circular dependencies introduced

## Out of Scope

- Changing the demo patch implementations
- Modifying the compile pipeline
- Changing the MobX store structure
- UI changes

## Decisions (Resolved)

1. **CompileOrchestrator**: Class - has mutable state (currentProgram, currentState) ✓
2. **Demo patches location**: `src/demo/` ✓
3. **AnimationLoop**: Own rAF with start/stop - simpler lifecycle ✓
