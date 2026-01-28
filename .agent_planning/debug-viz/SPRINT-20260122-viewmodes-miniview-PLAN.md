# Sprint: viewmodes-miniview - ViewModes + DebugMiniView Assembly

Generated: 2026-01-22
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Compose the ValueRenderer, chart primitives, and HistoryService into ViewModes, then assemble the DebugMiniView component that replaces the current inline debug UI.

## Scope

**Deliverables:**
1. SignalViewMode component (ValueRenderer + Sparkline + WarmupIndicator)
2. FieldViewMode component (stats + DistributionBar/ColorGradient)
3. DebugMiniView component (header + type line + provenance + value section)
4. Integration with DebugStore hover state
5. Retire SimpleDebugPanel inline value display (replace with MiniView)

## Work Items

### P0: SampleSource Abstraction

**File:** `src/ui/debug-viz/SampleSource.ts`

**Acceptance Criteria:**
- [ ] `buildScalarSample(edgeValue: EdgeValueResult, type: CanonicalType): RendererSample | null` — extracts value into Float32Array components
- [ ] `buildAggregateSample(edgeValue: EdgeValueResult, type: CanonicalType): RendererSample | null` — builds AggregateStats from FieldValueResult
- [ ] Scalar path: signal kind → components[0] = value, stride = getSampleEncoding(type.payload).stride
- [ ] Aggregate path: field kind → compute component-wise stats from buffer (or use pre-computed stats)
- [ ] Returns null for field-untracked or undefined edge values
- [ ] Uses `getSampleEncoding()` as single source of truth for stride
- [ ] Tests: scalar sample has correct stride and components
- [ ] Tests: aggregate sample has correct Float32Array stats

**Technical Notes:**
- This is NOT a React component — it's a pure function that transforms EdgeValueResult → RendererSample
- The existing FieldValueResult has scalar stats (min/max/mean as number). For v1, we map these to AggregateStats with stride=1 and components[0] only. Multi-component stats is a future enhancement.
- SampleSource guards: if EdgeValueResult.kind is 'field-untracked', return null (caller shows WarmupIndicator or placeholder)

### P1: SignalViewMode

**File:** `src/ui/debug-viz/viewModes/SignalViewMode.tsx`

**Acceptance Criteria:**
- [ ] Props: `targetKey: DebugTargetKey`, `sample: RendererSample & { mode: 'scalar' }`, `type: CanonicalType`, `history: HistoryView | undefined`
- [ ] Renders vertically: ValueRenderer.renderFull(sample) → Sparkline (if history) → WarmupIndicator (if not full)
- [ ] Gets ValueRenderer via `getValueRenderer(type)`
- [ ] Sparkline receives `width: 200`, `height: 32`, `unit: type.unit`
- [ ] WarmupIndicator shows when `history.filled < history.capacity`
- [ ] If no history (undefined): shows value only, no sparkline section
- [ ] Tests: renders value + sparkline when history available
- [ ] Tests: renders value only when no history
- [ ] Tests: shows warmup indicator when history not full

### P2: FieldViewMode

**File:** `src/ui/debug-viz/viewModes/FieldViewMode.tsx`

**Acceptance Criteria:**
- [ ] Props: `targetKey: DebugTargetKey`, `sample: RendererSample & { mode: 'aggregate' }`, `type: CanonicalType`, `instanceId: string`, `count: number`
- [ ] Renders vertically: instance summary → ValueRenderer.renderFull(sample) → DistributionBar (for numeric) or color gradient (for color)
- [ ] Instance summary line: `Instance: ${instanceId}  N=${count}`
- [ ] Gets ValueRenderer via `getValueRenderer(type)` for stats formatting
- [ ] Chooses chart based on payload: numeric payloads → DistributionBar, color → ColorGradientBar (future, use DistributionBar for v1)
- [ ] Tests: renders instance summary + stats + distribution
- [ ] Tests: shows count correctly

**Technical Notes:**
- No temporal history for fields in v1 (architect locked: field viz is non-temporal)
- DistributionBar uses stats.min[0], max[0], mean[0] for stride=1 fields
- For color fields: use DistributionBar on luminance for now, ColorGradientBar is future

### P3: DebugMiniView Component

**File:** `src/ui/debug-viz/DebugMiniView.tsx`

**Acceptance Criteria:**
- [ ] Props: `targetKey: DebugTargetKey`
- [ ] Does NOT receive or render slotId directly (architect constraint)
- [ ] Resolves metadata via DebugService using targetKey only
- [ ] Returns null if metadata doesn't resolve
- [ ] Shared structure (always rendered):
  - Header: edge label or port label (from targetKey + patch structure)
  - Type line: `{payload}:{unit} · {cardinality} · {temporality}` in compact form
- [ ] Value section dispatched by resolved cardinality:
  - cardinality.kind === 'one' → SignalViewMode
  - cardinality.kind === 'many' → FieldViewMode
- [ ] Handles field-untracked gracefully (shows "Tracking..." placeholder, auto-tracks via DebugService)
- [ ] Fixed max size: 360×220px, dark background, matches existing debug panel aesthetic
- [ ] Content priority truncation: if height exceeded, drop distribution first, then sparkline, then provenance
- [ ] Tests: renders signal mode for one-cardinality edges
- [ ] Tests: renders field mode for many-cardinality edges
- [ ] Tests: handles field-untracked state without crash

**Technical Notes:**
- Provenance line (spec section 2.3) and storage line (2.4) are optional in v1 — implement header + type + value section first
- The component reads HistoryService directly (via import or context) for sparkline data
- Auto-tracking: if edge is field and not tracked, call debugService.trackField on mount
- Positioning: fixed bottom-right (like current SimpleDebugPanel) or cursor-anchored (like PortInfoPopover). Start with fixed.

### P4: Integration with DebugStore + Retire Inline UI

**Acceptance Criteria:**
- [ ] DebugStore builds DebugTargetKey from hoveredEdge state
- [ ] SimpleDebugPanel renders DebugMiniView instead of inline SignalValueDisplay/FieldValueDisplay
- [ ] HistoryService.track() called when edge hovered (via DebugStore or MiniView mount)
- [ ] HistoryService.untrack() called when edge unhovered
- [ ] PortInfoPopover optionally uses DebugMiniView for debug value section (or keeps existing for now)
- [ ] Existing error banner (unmapped edges) preserved in SimpleDebugPanel shell
- [ ] Tests: hover edge → MiniView appears with correct targetKey

**Technical Notes:**
- Don't delete SimpleDebugPanel entirely — it still owns the panel shell (position, background, error banner)
- The inline SignalValueDisplay and FieldValueDisplay components can be removed once MiniView is working
- PortInfoPopover integration is optional for this sprint — it currently works fine with its own formatting

## Dependencies

- Sprint 1 (core-types-history): types, HistoryService, DebugService push hook
- Sprint 2 (renderers-charts): ValueRenderer registry, FloatValueRenderer, ColorValueRenderer, Sparkline, DistributionBar, WarmupIndicator

## Risks

| Risk | Mitigation |
|------|-----------|
| DebugMiniView accidentally imports ValueSlot | Lint rule or code review check |
| Field-untracked → tracked transition causes flash | Show placeholder immediately, swap to real data when available |
| Content priority truncation complex to implement | Start without truncation (fixed height), add if needed |
| PortInfoPopover integration scope creep | Explicitly defer to future sprint |
