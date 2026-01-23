# Definition of Done: viewmodes-miniview

## Acceptance Tests

### SampleSource
- [ ] `buildScalarSample()` produces RendererSample with correct stride and components from signal EdgeValueResult
- [ ] `buildAggregateSample()` produces RendererSample with AggregateStats from field EdgeValueResult
- [ ] Returns null for field-untracked kind
- [ ] Returns null for undefined edge value

### SignalViewMode
- [ ] Renders ValueRenderer output + Sparkline when history available
- [ ] Renders ValueRenderer output only when no history
- [ ] Shows WarmupIndicator when history.filled < capacity
- [ ] Hides WarmupIndicator when fully warmed

### FieldViewMode
- [ ] Shows instance summary line with instanceId and count
- [ ] Renders ValueRenderer aggregate output
- [ ] Shows DistributionBar for numeric payloads
- [ ] Handles count=0 gracefully

### DebugMiniView
- [ ] Resolves metadata from DebugTargetKey (never receives slotId)
- [ ] Returns null for unresolvable target
- [ ] Shows header with edge/port label
- [ ] Shows type line in compact canonical form
- [ ] Dispatches to SignalViewMode for cardinality=one
- [ ] Dispatches to FieldViewMode for cardinality=many
- [ ] Field-untracked state shows placeholder and auto-tracks
- [ ] Fixed max size 360×220px
- [ ] Dark background matching existing panel

### Integration
- [ ] Hovering edge in graph triggers MiniView with correct targetKey
- [ ] Unhovering dismisses MiniView and calls untrack
- [ ] HistoryService track/untrack called on hover lifecycle
- [ ] Sparkline populates as frames tick (visible warm-up)
- [ ] Existing error banner (unmapped edges) still works
- [ ] All existing DebugService tests still pass

## Verification Commands

```bash
npx tsc --noEmit
npx vitest run src/ui/debug-viz/
npx vitest run src/services/DebugService.test.ts
npx vitest run src/stores/
npm run build  # Full build succeeds
```

## Visual Verification

- [ ] Hover a signal edge → see current value + sparkline filling up
- [ ] Hover a field edge → see instance summary + stats + distribution bar
- [ ] Type line shows correct payload:unit · cardinality · temporality
- [ ] Sparkline auto-scales as values change
- [ ] Color field → shows color swatch with channel ranges
