# Sprint: debug-miniview - DebugMiniView Dockview Tab

Generated: 2026-01-22
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Implement the DebugMiniView as a Dockview tab in the bottom-left group, wiring the debug-viz infrastructure (HistoryService, Sparkline, DistributionBar, WarmupIndicator, ValueRenderer) to live runtime data. This validates the prior two sprints' work end-to-end.

## Scope

**Deliverables:**
1. `DebugMiniView` component — the main panel body
2. `DebugMiniViewPanel` — thin Dockview wrapper
3. Panel registration in `panelRegistry.ts` + layout in `defaultLayout.ts`
4. `useDebugMiniView` hook — reactive data resolution from DebugStore hover state
5. Integration of HistoryService tracking with DebugStore hover lifecycle

## Architecture

```
DebugStore.hoveredEdgeId (MobX observable)
  → useDebugMiniView hook (resolves metadata, value, history)
    → DebugMiniView component
      ├─ Header (label + kind badge)
      ├─ TypeLine (payload/unit · cardinality · temporality)
      ├─ ValueSection (dispatches by cardinality/temporality)
      │   ├─ Signal: ValueRenderer.renderFull + Sparkline + WarmupIndicator
      │   ├─ Field: AggregateStats + DistributionBar
      │   └─ (Events/Shape: placeholder text for now)
      └─ StorageLine (slot ID)
```

## Work Items

### P0: useDebugMiniView Hook

**File:** `src/ui/debug-viz/useDebugMiniView.ts`

**Acceptance Criteria:**
- [ ] Reads `debug.hoveredEdgeId` from MobX stores (reactive)
- [ ] Resolves `EdgeMetadata` (type, cardinality, slotId) from DebugService
- [ ] Resolves edge label: finds patch edge by ID → formats "fromBlock.fromPort → toBlock.toPort"
- [ ] Tracks/untracks the edge in HistoryService when hover changes (for signal-cardinality only)
- [ ] Returns: `{ key, label, meta, value, history, isTracking }` or null when nothing hovered
- [ ] Polls value at ~4Hz (250ms) for responsive display (faster than DebugStore's 1Hz)
- [ ] Cleans up (untrack) on unmount or edgeId change

**Technical Notes:**
- Uses `observer` pattern: the hook itself reads from MobX, triggering re-render on hover change
- HistoryService is accessed via `debugService.historyService` (established in sprint 1)
- History comes from `historyService.getHistory()` — object-stable, no allocation per frame
- Must NOT duplicate the field-tracking in DebugStore (that's for field slots, not history)

### P1: DebugMiniView Component

**File:** `src/ui/debug-viz/DebugMiniView.tsx`

**Acceptance Criteria:**
- [ ] Fixed max dimensions via CSS (360×220px content area)
- [ ] Graceful degradation: truncates long IDs, elides sections per spec priority order
- [ ] Shows "Hover an edge to inspect" placeholder when nothing hovered
- [ ] **Header line:** Edge label + kind badge ("Edge" / "Port")
- [ ] **Type line:** `payload:unit · cardinality · temporality` in compact form
- [ ] **Value section (signal):**
  - Current value rendered via `getValueRenderer(meta.type).renderFull(sample)`
  - Sparkline (100×30px) from HistoryView
  - WarmupIndicator below sparkline when not filled
- [ ] **Value section (field):**
  - Aggregate stats (min/max/mean from EdgeValueResult.kind==='field')
  - DistributionBar (width: 280px)
  - Instance line: "N=<count>"
- [ ] **Storage line:** "Slot: <slotId>" when available
- [ ] Styling: dark theme (background #1a1a2e), monospace for values, Mantine color tokens for badges
- [ ] Non-interactive (no click handlers, no selection changes)
- [ ] Performance: O(1) render for signals (reads pre-computed HistoryView)

**Technical Notes:**
- For the signal value section, convert the current EdgeValueResult to a RendererSample:
  - signal → `{ type: 'scalar', components: new Float32Array([value]), stride: 1 }`
  - field → Use DistributionBar directly from min/max/mean (don't convert to RendererSample)
- Import and call `'../renderers/register'` for side-effect registration on first render
- The Sparkline reads directly from `history: HistoryView` (the TrackedEntry object)
- For WarmupIndicator: `filled = Math.min(history.writeIndex, history.capacity)`, pass `capacity`

### P2: Dockview Integration

**Files:**
- `src/ui/dockview/panels/DebugMiniViewPanel.tsx` (new)
- `src/ui/dockview/panelRegistry.ts` (modify)
- `src/ui/dockview/defaultLayout.ts` (modify)

**Acceptance Criteria:**
- [ ] `DebugMiniViewPanel` follows existing wrapper pattern: `<DebugMiniView />`
- [ ] Registered in `PANEL_COMPONENTS` as `'debug-miniview'`
- [ ] Added to `PANEL_DEFINITIONS` with `{ id: 'debug-miniview', component: 'debug-miniview', title: 'Debug', group: 'bottom-left' }`
- [ ] Added to default layout (tab in bottom-left group, after Compilation)
- [ ] Panel renders correctly alongside existing bottom-left tabs

### P3: HistoryService Lifecycle Integration

**File:** Modify `src/stores/DebugStore.ts`

**Acceptance Criteria:**
- [ ] When `setHoveredEdge(edgeId)` is called for a signal edge:
  - Constructs `DebugTargetKey` (kind: 'edge', edgeId)
  - Calls `debugService.historyService.track(key)`
- [ ] When edge changes (prev edge unhovored):
  - Calls `debugService.historyService.untrack(prevKey)`
- [ ] Does NOT track field edges in HistoryService (they use the existing field-tracking path)
- [ ] History tracking is separate from field tracking (no interference)
- [ ] On `dispose()`: untracks any active history key

**Technical Notes:**
- The HistoryService `track()` already guards on cardinality=signal, so calling it for field edges is a no-op. But for clarity, only call track for signal edges.
- DebugStore already tracks `hoveredEdgeId` and has cleanup logic — extend it.

## Verification

**Runtime validation checklist:**
- [ ] Start dev server (`npm run dev`)
- [ ] Open Debug tab in bottom-left panel group
- [ ] Hover a signal edge in the flow editor → mini-view shows value + sparkline filling up
- [ ] Hover a field edge → mini-view shows aggregate stats + distribution bar
- [ ] Unhover → mini-view shows placeholder
- [ ] Sparkline auto-scales and wraps correctly
- [ ] WarmupIndicator disappears after buffer fills
- [ ] Type line shows correct payload:unit · cardinality · temporality
- [ ] No console errors or warnings
- [ ] Typecheck passes
- [ ] All existing tests pass

## Dependencies

- Sprint 1 (core-types-history): types.ts, HistoryService, DebugService integration ✅
- Sprint 2 (renderers-charts): ValueRenderer, Sparkline, DistributionBar, WarmupIndicator ✅
- DebugStore (existing), DebugService (existing)
- Dockview infrastructure (existing)

## Risks

| Risk | Mitigation |
|------|-----------|
| 4Hz polling may cause visible lag | Start at 4Hz, can increase to requestAnimationFrame if needed |
| Sparkline re-render on every poll tick | Sparkline reads from object-stable HistoryView; only canvas redraws |
| Edge label resolution needs patch access | Read from PatchStore via useStores() |
| History not populated until runtime starts | WarmupIndicator handles empty state; Sparkline handles 0 samples |
