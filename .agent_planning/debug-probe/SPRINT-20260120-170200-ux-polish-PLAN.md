# SPRINT-20260120-170200: UX Polish (DebugProbePopover + Type-Specific Renderers)

**Status**: PLANNED
**Confidence**: HIGH
**Started**: TBD
**Completed**: TBD

---

## Context

**Sprint Goal**: Replace SimpleDebugPanel with a polished, spec-compliant DebugProbePopover featuring type-specific value renderers and trace summaries.

**Prior State** (After Sprint 2):
- DebugGraph fully implemented
- Ring buffers storing 10 seconds of timeseries data
- DebugService query API complete (probePort, probeBus, getBusSeries)
- SimpleDebugPanel shows text-only values

**Success Criteria**:
- Popover anchored near hovered edge (not fixed corner)
- Four-section layout (Identity, Now, Trace, Fixes)
- Type-specific renderers for all 7 payload types
- Trace summary shows transformation pipeline
- SimpleDebugPanel removed (code cleanup)

---

## What We're Building

### 1. DebugProbePopover Component (Main UI)
**File**: `src/ui/components/DebugProbePopover.tsx` (NEW)

Spec-compliant probe card with four sections (from 09-debug-ui-spec.md, Part 2).

**Layout**:
```
┌─────────────────────────────────────┐
│ Section A: Identity                 │ ← Port/bus name, type badge, role badge
├─────────────────────────────────────┤
│ Section B: "Now" (Live Value)      │ ← Type-specific renderer
├─────────────────────────────────────┤
│ Section C: "Where It Comes From"   │ ← Trace summary (pipeline chips)
├─────────────────────────────────────┤
│ Section D: "Fixes" (Diagnostics)   │ ← Actionable buttons (Sprint 3: placeholder)
└─────────────────────────────────────┘
```

**Positioning**:
- Anchored to cursor position (or edge center if cursor unavailable)
- Uses Radix UI Popover or similar (handles viewport bounds)
- Appears on hover, stays visible while hovering popover itself
- Dismisses when mouse leaves edge + popover

**Complexity**: ~200 lines (layout + positioning)

---

### 2. Section A: Identity Badge Component
**File**: `src/ui/components/debug/IdentityBadge.tsx` (NEW)

Displays:
- **Title**: Port or bus name (large, bold)
- **Type Badge**: `Signal:Float`, `Signal:Phase`, `Field:Vec2`, etc.
- **Role Badge**: `Clock`, `Mixer`, `Silent`, `Bound`, etc. (optional)
- **Jump Link**: Navigate to BusBoard or block inspector

**Example**:
```tsx
<IdentityBadge
  name="DotsRenderer.radius"
  type={signalType}
  role="Bound"
  onJump={() => navigateToBusBoard(busId)}
/>
```

**Renders as**:
```
DotsRenderer.radius
Signal:Float | Bound        [Jump ⊞]
```

**Complexity**: ~80 lines

---

### 3. Section B: Type-Specific Value Renderers

Seven renderer components, one per payload type:

#### 3.1. NumberRenderer (Float/Int)
**File**: `src/ui/components/debug/renderers/NumberRenderer.tsx` (NEW)

```
▓▓▓▓▓▓░░░░ 0.73
Range: 0..1
```

- Horizontal meter (0..1 or domain bounds)
- Numeric readout (2 decimals)
- Optional: min/max from recent history

**Complexity**: ~60 lines

---

#### 3.2. PhaseRenderer (Phase)
**File**: `src/ui/components/debug/renderers/PhaseRenderer.tsx` (NEW)

```
    ⦿ ↑
  ⟲   (0.25)
 •
pulse: ✓ (just fired)
```

- Circular phase ring (0..1 wrap indicator)
- Arrow showing current position
- Pulse status (if trigger associated)

**Complexity**: ~100 lines (SVG circle + arc)

---

#### 3.3. ColorRenderer (Color)
**File**: `src/ui/components/debug/renderers/ColorRenderer.tsx` (NEW)

```
■ rgb(200, 100, 50)
◼◼◼◼◼◼◼◼ palette (5/8)
```

- Color swatch (40×40px box)
- RGB/Hex readout
- If palette domain: palette strip showing position

**Complexity**: ~70 lines

---

#### 3.4. Vec2Renderer (Vec2)
**File**: `src/ui/components/debug/renderers/Vec2Renderer.tsx` (NEW)

```
   •              x: 150 y: 200
  / \             (normalized)
 /   \
```

- Tiny XY dot plot (100×100px canvas)
- Numeric (x, y) readout
- Optional: domain bounds overlay

**Complexity**: ~80 lines (canvas drawing)

---

#### 3.5. BoolRenderer (Bool)
**File**: `src/ui/components/debug/renderers/BoolRenderer.tsx` (NEW)

```
✓ true
```

- Checkmark or X icon
- "true" or "false" label
- Optional: recent toggle count

**Complexity**: ~40 lines (simplest)

---

#### 3.6. TriggerRenderer (Trigger/Event)
**File**: `src/ui/components/debug/renderers/TriggerRenderer.tsx` (NEW)

```
● ◇ ◇ ◇ (pulse active)
  ✓ ✓ ✓ (recent pulses)
```

- Pulse lamp (bright if recently fired)
- Mini-strip of recent pulses (last 10 samples)
- "fired" or "idle" status

**Complexity**: ~70 lines

---

#### 3.7. UnitRenderer (Unit/None)
**File**: `src/ui/components/debug/renderers/UnitRenderer.tsx` (NEW)

```
(no value)
```

- Placeholder for `{ t: 'none' }` or unit type
- Grayed out text

**Complexity**: ~20 lines (trivial)

---

### 4. Section C: Trace Summary Component
**File**: `src/ui/components/debug/TraceSummary.tsx` (NEW)

Horizontal chain of transformation steps (from DebugGraph.pipelines).

```
SOURCE → (Adapter) → Lens (2) → COMBINE → RESULT
   ↓         ↓           ↓        ↓       ↓
 phaseA   TypeConv   Smooth   Sum/Last  radius
          i32→f32    0.5s     of 2      0.73
```

**Features**:
- Chip per stage (source, adapter, lens, combine, result)
- Collapsed stacks: "Lens (2)" clickable to expand
- Hover each chip → mini-tooltip with details
- Derived from DebugGraph.pipelines (no computation)

**Complexity**: ~150 lines (chip rendering + tooltips)

---

### 5. Section D: Fixes Placeholder
**File**: `src/ui/components/debug/FixesSection.tsx` (NEW)

**Sprint 3 Scope**: Static placeholder only.

```
(No diagnostics for this port)
```

**Future**: Integrate with diagnostics rules engine (post-Sprint 3).

**Complexity**: ~30 lines (placeholder)

---

### 6. Popover Positioning Logic
**File**: `src/ui/hooks/usePopoverPosition.ts` (NEW)

Calculates popover position relative to hovered edge.

**Strategy**:
- Get edge center point (ReactFlow coordinate system)
- Convert to screen coordinates
- Position popover 20px offset from cursor or edge center
- Use Radix UI or Floating UI for viewport bounds handling

**Complexity**: ~60 lines

---

### 7. Remove SimpleDebugPanel
**File**: `src/ui/components/SimpleDebugPanel.tsx` (DELETE)

Clean up Sprint 1/2 throwaway code.

**Also remove**:
- Any imports of SimpleDebugPanel
- Toggle button for SimpleDebugPanel (if not reused for DebugProbePopover)

---

## Implementation Steps

### Step 1: Create DebugProbePopover Shell (2 hours)
- [ ] Create `src/ui/components/DebugProbePopover.tsx`
- [ ] Implement four-section layout (empty sections)
- [ ] Wire to `useDebugProbe(edgeId)` hook
- [ ] Position near cursor (basic offset)
- [ ] Add show/hide logic on hover
- [ ] Test with placeholder content

**Acceptance**:
- Hover edge → popover appears near cursor
- Leave edge → popover disappears
- Layout has 4 visible sections (empty for now)

---

### Step 2: Implement IdentityBadge (1.5 hours)
- [ ] Create `src/ui/components/debug/IdentityBadge.tsx`
- [ ] Display port/bus name from PortProbeResult
- [ ] Format type badge: `Signal:Float`, `Field:Vec2`, etc.
- [ ] Add role badge (use DebugGraph.buses.reservedRole)
- [ ] Add Jump link (placeholder onClick)

**Acceptance**:
```tsx
<IdentityBadge
  name="DotsRenderer.radius"
  type={signalType}
  role="Bound"
/>
```
Renders: "DotsRenderer.radius" + "Signal:Float | Bound"

---

### Step 3: Implement Type-Specific Renderers (6 hours)

**3.1. NumberRenderer** (1 hour)
- [ ] Create `NumberRenderer.tsx`
- [ ] Horizontal meter (CSS or SVG)
- [ ] Numeric readout from ValueSummary.v
- [ ] Range label (0..1 or custom domain)

**3.2. PhaseRenderer** (1.5 hours)
- [ ] Create `PhaseRenderer.tsx`
- [ ] SVG circular ring (0..1 wrap)
- [ ] Arrow at current position
- [ ] Pulse indicator (if applicable)

**3.3. ColorRenderer** (1 hour)
- [ ] Create `ColorRenderer.tsx`
- [ ] Color swatch (40×40px div with background)
- [ ] RGB/Hex readout
- [ ] Palette strip (if palette domain)

**3.4. Vec2Renderer** (1.5 hours)
- [ ] Create `Vec2Renderer.tsx`
- [ ] Canvas dot plot (100×100px)
- [ ] Draw (x, y) point
- [ ] Numeric readout

**3.5. BoolRenderer** (0.5 hours)
- [ ] Create `BoolRenderer.tsx`
- [ ] Checkmark or X icon
- [ ] "true" or "false" label

**3.6. TriggerRenderer** (1 hour)
- [ ] Create `TriggerRenderer.tsx`
- [ ] Pulse lamp (CSS animation for "active")
- [ ] Recent pulses strip (last 10 from ring buffer)

**3.7. UnitRenderer** (0.5 hours)
- [ ] Create `UnitRenderer.tsx`
- [ ] Grayed out "(no value)" text

**Acceptance**:
- Create test patch with all 7 types
- Hover edges, verify correct renderer used
- All renderers display values accurately

---

### Step 4: Wire Renderers to Popover (1 hour)
- [ ] Switch on `value.t` in DebugProbePopover
- [ ] Render correct renderer component per type
- [ ] Pass ValueSummary to renderer
- [ ] Handle `{ t: 'err' }` case (show error message)

**Acceptance**:
```tsx
// In DebugProbePopover Section B:
{value.t === 'num' && <NumberRenderer value={value} />}
{value.t === 'phase' && <PhaseRenderer value={value} />}
// ... etc.
```

---

### Step 5: Implement TraceSummary (3 hours)
- [ ] Create `TraceSummary.tsx`
- [ ] Query DebugGraph.pipelines for current port
- [ ] Render pipeline stages as horizontal chips
- [ ] Collapse adapter/lens stacks with count badges
- [ ] Add hover tooltips per chip
- [ ] Format stage labels (Source, Adapter, Lens, Combine, Result)

**Acceptance**:
- Hover edge → trace summary shows stages
- Stages match DebugGraph.pipelines
- Chip hover shows tooltip with stage details

---

### Step 6: Implement FixesSection Placeholder (0.5 hours)
- [ ] Create `FixesSection.tsx`
- [ ] Display: "(No diagnostics for this port)"
- [ ] Add TODO comment for future diagnostics integration

**Acceptance**:
- Section D shows placeholder text
- No errors, just static display

---

### Step 7: Polish Popover Positioning (2 hours)
- [ ] Create `usePopoverPosition.ts` hook
- [ ] Calculate edge center from ReactFlow
- [ ] Convert to screen coordinates
- [ ] Add offset (20px from cursor or edge)
- [ ] Integrate Radix UI Popover for viewport bounds
- [ ] Test edge cases (edge near viewport edge)

**Acceptance**:
- Popover doesn't overflow viewport
- Popover repositions when edge near edge of screen
- Smooth appearance/disappearance

---

### Step 8: Remove SimpleDebugPanel (1 hour)
- [ ] Delete `src/ui/components/SimpleDebugPanel.tsx`
- [ ] Remove imports in ReactFlowEditor
- [ ] Remove toggle button (or reuse for DebugProbePopover)
- [ ] Verify no broken references

**Acceptance**:
- `npm run typecheck` passes
- No imports of SimpleDebugPanel
- Toggle button either removed or repurposed

---

### Step 9: Integration Testing (2 hours)
- [ ] Test with all 7 payload types
- [ ] Test popover positioning (center, edges, corners)
- [ ] Test hover on/off behavior
- [ ] Test with complex pipelines (3+ stages)
- [ ] Test with empty pipeline (direct bus connection)
- [ ] Verify no memory leaks (hover 100 edges)

**Acceptance**:
- All renderers work correctly
- Popover positioning solid (no flickering)
- Trace summary shows correct stages
- No console errors

---

## Files Changed

### New Files
- `src/ui/components/DebugProbePopover.tsx` (~200 lines)
- `src/ui/components/debug/IdentityBadge.tsx` (~80 lines)
- `src/ui/components/debug/renderers/NumberRenderer.tsx` (~60 lines)
- `src/ui/components/debug/renderers/PhaseRenderer.tsx` (~100 lines)
- `src/ui/components/debug/renderers/ColorRenderer.tsx` (~70 lines)
- `src/ui/components/debug/renderers/Vec2Renderer.tsx` (~80 lines)
- `src/ui/components/debug/renderers/BoolRenderer.tsx` (~40 lines)
- `src/ui/components/debug/renderers/TriggerRenderer.tsx` (~70 lines)
- `src/ui/components/debug/renderers/UnitRenderer.tsx` (~20 lines)
- `src/ui/components/debug/TraceSummary.tsx` (~150 lines)
- `src/ui/components/debug/FixesSection.tsx` (~30 lines)
- `src/ui/hooks/usePopoverPosition.ts` (~60 lines)

### Deleted Files
- `src/ui/components/SimpleDebugPanel.tsx` (Sprint 1/2 code)

### Modified Files
- `src/ui/reactFlowEditor/ReactFlowEditor.tsx` (~30 lines changed: wire DebugProbePopover)

**Total LOC**: ~960 lines (NEW: ~960, DELETED: ~150, MODIFIED: ~30)

---

## Dependencies

### External
- **Radix UI Popover** (or @floating-ui/react): For popover positioning
- **SVG/Canvas**: For phase ring, vec2 plot

### Internal
- DebugService (from Sprint 2)
- DebugGraph.pipelines (from Sprint 2)
- ValueSummary (from Sprint 2)
- useDebugProbe hook (from Sprint 1, may need minor updates)

### Coordination
- None (isolated sprint)

---

## Risks & Mitigations

### Risk 1: Popover Positioning Complexity
**Impact**: MEDIUM (poor UX if buggy)
**Probability**: LOW

**Mitigation**:
- Use battle-tested library (Radix UI Popover or Floating UI)
- Test edge cases (edges near viewport bounds)
- Start with simple offset, add smart repositioning later

**Fallback**: Fixed position (bottom-right) like SimpleDebugPanel (regression, but functional).

---

### Risk 2: Type-Specific Renderer Scope Creep
**Impact**: LOW (just more time)
**Probability**: MEDIUM

**Mitigation**:
- Define "functional, not beautiful" scope
- No animations in Sprint 3 (just static rendering)
- Defer advanced features (timeseries sparklines, etc.)

**Scope Limit**:
- NumberRenderer: meter + readout (no sparkline)
- PhaseRenderer: ring + arrow (no pulse animation)
- ColorRenderer: swatch + hex (no palette editor)

---

### Risk 3: TraceSummary Chip Layout Overflow
**Impact**: LOW (cosmetic)
**Probability**: MEDIUM

**Mitigation**:
- Horizontal scroll if pipeline too long
- Collapse multiple stages into single chip with count
- Test with 5+ stage pipeline

**Fallback**: Vertical layout (stacked chips) if horizontal doesn't fit.

---

### Risk 4: DebugGraph.pipelines Not Available
**Impact**: HIGH (blocks Sprint 3)
**Probability**: VERY LOW

**Mitigation**:
- Sprint 2 DoD requires pipelines implemented
- Verify pipelines exist before starting Sprint 3 Step 5

**Fallback**: Show static text "Source → Result" if pipelines missing. No trace summary.

---

## Testing Strategy

### Unit Tests
- IdentityBadge: Renders name, type, role correctly
- NumberRenderer: Meter position matches value (0.5 → 50% width)
- PhaseRenderer: Arrow position matches phase (0.25 → 90° rotation)
- ColorRenderer: Swatch background matches rgba value
- TraceSummary: Renders correct # of chips for pipeline

### Integration Tests
- DebugProbePopover: Receives PortProbeResult, renders all sections
- Hover edge → popover appears with correct data
- Popover positioning near viewport edge

### Manual Tests
- Hover all 7 payload types, verify renderers
- Hover edges in different viewport positions (center, corners, edges)
- Hover edge with complex pipeline (3+ stages)
- Rapid hover on/off (no flickering)

---

## Success Metrics

### Functional
- [ ] Popover appears on edge hover
- [ ] All 7 type-specific renderers work
- [ ] IdentityBadge shows correct info
- [ ] TraceSummary displays pipeline stages
- [ ] Popover dismisses on mouse leave

### UX
- [ ] Popover doesn't obscure graph
- [ ] Popover doesn't flicker on rapid hover
- [ ] All sections readable (fonts, spacing, colors)
- [ ] Renderers visually distinct (not all text)

### Performance
- [ ] No frame drops during hover
- [ ] Popover appears within 100ms of hover
- [ ] No memory leaks (hover 100 edges in sequence)

### Quality
- [ ] All TypeScript types defined
- [ ] All tests pass
- [ ] No console warnings
- [ ] Code passes lint

---

## Follow-up Work (Not This Sprint)

**Future Enhancements**:
- Diagnostics integration (FixesSection real data) → Post-Sprint 3
- Expanded trace view (separate panel) → Post-Sprint 3
- Timeseries sparklines in renderers → Post-Sprint 3
- Keyboard shortcuts (Probe mode toggle) → Post-Sprint 3
- Pin/unpin popover → Post-Sprint 3

**Deferred Features** (from spec):
- Global Probe mode toggle (spec 09-debug-ui-spec.md Part 1) → Future
- Cursor change to crosshair → Future
- Advanced popover features (resize, drag) → Future

---

## Notes

- Sprint 3 is the **final MVP sprint** for Debug Probe feature
- All code from Sprint 3 is **production-quality** (not throwaway)
- Type-specific renderers are **functional, not fancy** (polish later)
- TraceSummary uses **pre-computed pipelines** (no runtime computation)
- Popover is **read-only** (no editing, just inspection)

---

## Estimated Effort

| Task | Estimate | Confidence |
|------|----------|------------|
| Popover shell | 2h | HIGH |
| IdentityBadge | 1.5h | HIGH |
| Type renderers | 6h | MEDIUM |
| Wire renderers | 1h | HIGH |
| TraceSummary | 3h | MEDIUM |
| FixesSection | 0.5h | HIGH |
| Popover positioning | 2h | MEDIUM |
| Remove SimpleDebugPanel | 1h | HIGH |
| Integration testing | 2h | HIGH |
| **TOTAL** | **19 hours** | **HIGH** |

**Recommended allocation**: 2.5 days with buffer

---

## Dependencies for Future Work

**Post-Sprint 3 enhancements will need**:
- Diagnostics rules engine integration (for FixesSection)
- Expanded trace view panel (for deep pipeline inspection)
- Timeseries query API (for sparklines) — already exists (getBusSeries)

**No changes to Sprint 2 code needed** for future enhancements.

---

## Sign-off Checklist

Before marking sprint COMPLETE:
- [ ] All 9 implementation steps checked off
- [ ] All success metrics met
- [ ] DoD items verified (see SPRINT-20260120-170200-ux-polish-DOD.md)
- [ ] SimpleDebugPanel removed
- [ ] All 7 renderers tested
- [ ] Popover positioning tested (viewport edges)
- [ ] Code reviewed
- [ ] Tests passing
- [ ] Ready for production use

---

**END OF SPRINT PLAN**
