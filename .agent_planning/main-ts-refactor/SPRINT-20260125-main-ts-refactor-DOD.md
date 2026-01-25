# Definition of Done: Refactor main.ts - Separate Concerns

**Sprint**: SPRINT-20260125-main-ts-refactor
**Status**: READY FOR IMPLEMENTATION
**Confidence**: HIGH

## Acceptance Criteria

### Phase 1: Extract Demo Patches
- [ ] `src/demo/` directory exists
- [ ] Each of the 7 demo patches extracted to its own file
- [ ] `src/demo/index.ts` exports `PatchBuilder` type, `patches` array, and `DEFAULT_PATCH_INDEX`
- [ ] `main.ts` imports from `src/demo` instead of inline definitions
- [ ] All 7 demo patches load and render correctly

### Phase 2: Extract Patch Persistence Service
- [ ] `src/services/PatchPersistence.ts` exists
- [ ] Contains: `STORAGE_KEY`, `SerializedPatch`, `serializePatch()`, `deserializePatch()`, `savePatchToStorage()`, `loadPatchFromStorage()`, `clearStorageAndReload()`
- [ ] `main.ts` imports persistence functions from service
- [ ] Patch save/load/clear functionality works correctly

### Phase 3: Extract Compile Orchestrator
- [ ] `src/services/CompileOrchestrator.ts` exists
- [ ] Contains `compileAndSwap()` function with clear interface
- [ ] Handles state migration coordination
- [ ] Emits ProgramSwapped event
- [ ] Initial compile succeeds
- [ ] Live recompile (param changes) works
- [ ] State migration preserves continuity

### Phase 4: Extract Live Recompile Service
- [ ] `src/services/LiveRecompile.ts` exists
- [ ] Contains: `hashBlockParams()`, `scheduleRecompile()`, `setupLiveRecompileReaction()`, `cleanupReaction()`
- [ ] Uses CompileOrchestrator for compilation
- [ ] Parameter slider changes trigger recompile

### Phase 5: Extract Animation Loop
- [ ] `src/services/AnimationLoop.ts` exists
- [ ] Contains `AnimationLoop` class with start/stop/pause methods
- [ ] Handles frame timing metrics
- [ ] Integrates with health monitoring
- [ ] Animation runs smoothly
- [ ] FPS counter updates correctly
- [ ] Health snapshots emit correctly

### Phase 6: Extract Domain Change Detection
- [ ] Domain change detection moved to dedicated module (either `src/runtime/DomainChangeDetector.ts` or integrated into `ContinuityState.ts`)
- [ ] Contains: `prevInstanceCounts`, `domainChangeLogThrottle`, `logDomainChange()`, `detectAndLogDomainChanges()`
- [ ] Domain count changes logged correctly

## Global Success Criteria

- [ ] `main.ts` reduced to ~100-150 lines (from ~1220)
- [ ] Each extracted module has single responsibility
- [ ] All existing functionality preserved
- [ ] Demo patches easily discoverable in `src/demo/`
- [ ] Services are testable in isolation
- [ ] No circular dependencies introduced
- [ ] `initial-compile-invariant.test.ts` passes
- [ ] Window globals for presets still work
- [ ] TypeScript compilation succeeds with no errors
- [ ] Lint passes

## Verification Commands

```bash
npm run typecheck
npm run test
npm run dev  # Verify all functionality works
```

## Out of Scope

- Changing the demo patch implementations
- Modifying the compile pipeline
- Changing the MobX store structure
- UI changes
