# Definition of Done: runtime-selection

## Required for Completion

### Code Quality
- [ ] RuntimeService/AnimationLoop has EventHub reference
- [ ] SelectionStore has EventHub reference
- [ ] Events fire at correct times in lifecycle
- [ ] No performance regression (frame rate stays ≥60fps)

### Testing
- [ ] Test: play → PlaybackStateChanged('playing')
- [ ] Test: pause → PlaybackStateChanged('paused')
- [ ] Test: stop → PlaybackStateChanged('stopped')
- [ ] Test: select block → SelectionChanged with blockId
- [ ] Test: deselect → SelectionChanged with empty
- [ ] Test: frame loop → FrameStarted/FrameCompleted fire

### Performance Verification
- [ ] Profile with events enabled vs disabled
- [ ] Frame events don't cause GC pressure
- [ ] Selection events don't cause UI jank

### Behavioral Verification
- [ ] Click play → event observable in debug
- [ ] Select block → event observable
- [ ] Hover over port → event observable (if implemented)

### Integration
- [ ] Existing animation loop behavior unchanged
- [ ] Selection UI still works correctly

## Verification Commands
```bash
npm run typecheck
npm run test -- AnimationLoop
npm run test -- SelectionStore
npm run test -- src/events
npm run dev  # Manual verification in browser
```

## Exit Criteria
All checkboxes above must be checked. Sprint is complete when:
1. All tests pass
2. Manual verification confirms events fire
3. No frame rate degradation
