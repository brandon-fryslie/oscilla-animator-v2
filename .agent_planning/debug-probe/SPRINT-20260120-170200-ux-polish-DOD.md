# Definition of Done: Sprint 3 - UX Polish

**Sprint ID**: SPRINT-20260120-170200
**Feature**: UX Polish (DebugProbePopover + Type-Specific Renderers)

---

## Functional Requirements

### F1: DebugProbePopover Display
- [ ] Popover appears on edge hover
- [ ] Popover positioned near cursor or edge center (not fixed corner)
- [ ] Popover has four distinct sections (Identity, Now, Trace, Fixes)
- [ ] Popover remains visible while hovering popover itself
- [ ] Popover dismisses when mouse leaves edge AND popover
- [ ] Popover doesn't obscure the hovered edge
- [ ] Multiple edges can be hovered in sequence (popover updates content)

### F2: Section A - Identity Badge
- [ ] Displays port or bus name (e.g., "DotsRenderer.radius")
- [ ] Displays type badge in correct format:
  - [ ] `Signal:Float` for single float
  - [ ] `Signal:Phase` for phase (0..1)
  - [ ] `Signal:Color` for color
  - [ ] `Signal:Vec2` for vec2
  - [ ] `Signal:Bool` for bool
  - [ ] `Signal:Trigger` for trigger/event
  - [ ] `Field:Float` for field (if implemented)
- [ ] Displays role badge if applicable (Clock, Mixer, Bound, etc.)
- [ ] Jump link present (can be placeholder onClick)

### F3: Section B - Type-Specific Renderers
All 7 renderers implemented and working:

**F3.1 NumberRenderer (Float/Int)**
- [ ] Displays horizontal meter (0..1 or domain bounds)
- [ ] Meter fill reflects current value (0.5 → 50% filled)
- [ ] Numeric readout shows value with 2 decimals
- [ ] Range label shows domain (e.g., "Range: 0..1")

**F3.2 PhaseRenderer (Phase)**
- [ ] Displays circular ring with 0..1 wrap indicator
- [ ] Arrow/marker at current phase position (0.25 → 90°)
- [ ] SVG or canvas rendering (smooth, not pixelated)
- [ ] Optional: Pulse indicator if associated trigger exists

**F3.3 ColorRenderer (Color)**
- [ ] Color swatch displays correct color (40×40px or similar)
- [ ] RGB or hex readout below swatch
- [ ] If palette domain: palette strip showing position
- [ ] Swatch matches rgba value from ValueSummary

**F3.4 Vec2Renderer (Vec2)**
- [ ] Displays XY dot plot (100×100px canvas)
- [ ] Point drawn at (x, y) position
- [ ] Numeric readout: "x: 150, y: 200"
- [ ] Optional: Domain bounds overlay

**F3.5 BoolRenderer (Bool)**
- [ ] Displays checkmark (✓) for true, X for false
- [ ] Text label: "true" or "false"
- [ ] Visually distinct from other renderers

**F3.6 TriggerRenderer (Trigger/Event)**
- [ ] Pulse lamp (bright if fired, dim if idle)
- [ ] Status text: "fired" or "idle"
- [ ] Optional: Recent pulses strip (last 5-10 from ring buffer)

**F3.7 UnitRenderer (Unit/None)**
- [ ] Displays "(no value)" or similar placeholder
- [ ] Grayed out text
- [ ] Used for `{ t: 'none' }` ValueSummary

### F4: Section C - Trace Summary
- [ ] Displays horizontal pipeline of transformation stages
- [ ] Shows: SOURCE → [Adapters] → [Lenses] → COMBINE → RESULT
- [ ] Each stage is a chip/badge
- [ ] Collapsed stacks show count: "Lens (2)", "Adapters (3)"
- [ ] Chip labels derived from DebugGraph.pipelines
- [ ] Hover each chip → tooltip with stage details
- [ ] No computation (all data from precomputed pipelines)

### F5: Section D - Fixes (Placeholder)
- [ ] Displays placeholder text: "(No diagnostics for this port)"
- [ ] Section exists (not hidden)
- [ ] TODO comment for future diagnostics integration

### F6: Popover Positioning
- [ ] Popover doesn't overflow viewport top
- [ ] Popover doesn't overflow viewport bottom
- [ ] Popover doesn't overflow viewport left
- [ ] Popover doesn't overflow viewport right
- [ ] Repositions intelligently when edge near viewport edge
- [ ] Offset from cursor/edge (20px or similar)

### F7: SimpleDebugPanel Removal
- [ ] `SimpleDebugPanel.tsx` file deleted
- [ ] No imports of SimpleDebugPanel in codebase
- [ ] Toggle button removed or repurposed
- [ ] No broken references (`npm run typecheck` passes)

---

## Technical Requirements

### T1: DebugProbePopover Implementation
- [ ] Component accepts `portKey` or `busId` prop
- [ ] Queries DebugService.probePort or probeBus
- [ ] Renders all four sections
- [ ] Uses Radix UI Popover or Floating UI for positioning
- [ ] TypeScript types for all props
- [ ] No `any` types without justification

### T2: Type-Specific Renderer Implementation
- [ ] Each renderer is a separate component file
- [ ] Each renderer accepts `value: ValueSummary` prop
- [ ] Switch statement or component map for dispatch:
  ```typescript
  {value.t === 'num' && <NumberRenderer value={value} />}
  {value.t === 'phase' && <PhaseRenderer value={value} />}
  // ... etc.
  ```
- [ ] All renderers handle missing/undefined data gracefully
- [ ] Error case `{ t: 'err', code }` shows error message

### T3: TraceSummary Implementation
- [ ] Queries DebugGraph.pipelines for current binding
- [ ] Renders pipeline.stages in order
- [ ] Each stage has type:
  - [ ] `kind: 'source'` → "Source" chip
  - [ ] `kind: 'adapter'` → "Adapter" chip with label
  - [ ] `kind: 'lens'` → "Lens" chip with label
  - [ ] `kind: 'combine'` → "Combine" chip with mode
- [ ] Collapsed stacks implemented (e.g., "Lens (2)")
- [ ] Tooltip per chip implemented (shows stage details)

### T4: Popover Positioning Logic
- [ ] `usePopoverPosition` hook or similar
- [ ] Calculates edge center from ReactFlow coordinates
- [ ] Converts to screen coordinates
- [ ] Adds offset (20px from edge or cursor)
- [ ] Integrates with Radix UI or Floating UI
- [ ] Handles viewport bounds automatically

### T5: Integration with ReactFlowEditor
- [ ] `ReactFlowEditor` wires DebugProbePopover to edge hover
- [ ] `onEdgeMouseEnter` sets hovered edge ID
- [ ] `onEdgeMouseLeave` clears hovered edge ID (with delay for hover-over-popover)
- [ ] DebugProbePopover receives hovered edge ID
- [ ] No conflicts with existing edge context menu

---

## Performance Requirements

### P1: Popover Responsiveness
- [ ] Popover appears within 100ms of hover
- [ ] Popover dismisses within 100ms of mouse leave
- [ ] No flickering on rapid hover on/off
- [ ] No jank when popover repositions

### P2: Renderer Performance
- [ ] All renderers render within 16ms (single frame)
- [ ] SVG/canvas renderers don't cause frame drops
- [ ] PhaseRenderer SVG updates smoothly (no re-render thrashing)
- [ ] Vec2Renderer canvas redraws correctly on value change

### P3: Memory Management
- [ ] No memory leaks from popover show/hide
- [ ] Hover 100 edges in sequence → no unbounded growth
- [ ] Canvas/SVG elements cleaned up on unmount

---

## Quality Requirements

### Q1: Code Quality
- [ ] All components have TypeScript types (no `any`)
- [ ] All props have interfaces or types
- [ ] ESLint passes with no warnings
- [ ] Prettier formatting applied
- [ ] No console.log statements
- [ ] Meaningful component and variable names

### Q2: Testing
- [ ] Unit tests for each renderer:
  - [ ] NumberRenderer: meter width matches value
  - [ ] PhaseRenderer: arrow angle matches phase
  - [ ] ColorRenderer: swatch color matches rgba
  - [ ] TraceSummary: chip count matches pipeline stages
- [ ] Integration test: Popover renders all sections correctly
- [ ] Integration test: Hover edge → popover appears with data
- [ ] All tests pass (`npm run test`)

### Q3: Error Handling
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] No runtime errors in console during normal operation
- [ ] Graceful handling of:
  - [ ] Edge with no DebugGraph entry → show "No data available"
  - [ ] ValueSummary `{ t: 'err' }` → show error message in renderer
  - [ ] Missing pipeline → TraceSummary shows "Direct connection"
  - [ ] Invalid portKey → popover doesn't crash, shows "Unknown port"
- [ ] No uncaught exceptions

---

## Documentation Requirements

### D1: Code Comments
- [ ] Each renderer has JSDoc comment explaining usage
- [ ] TraceSummary has comment explaining pipeline structure
- [ ] usePopoverPosition has comment explaining coordinate transforms

### D2: Sprint Artifacts
- [ ] PLAN.md completed (this file's companion)
- [ ] CONTEXT.md updated with:
  - [ ] Implementation decisions (popover library choice, etc.)
  - [ ] Renderer design rationale
  - [ ] Lessons learned
- [ ] This DOD.md reviewed and updated

---

## Acceptance Criteria (End-User Perspective)

### AC1: Basic Probe Workflow
**Given** a patch with edges of all 7 types
**When** user hovers over each edge
**Then**:
- [ ] Popover appears near each edge (not fixed corner)
- [ ] Identity section shows correct port name and type
- [ ] "Now" section shows type-appropriate renderer
- [ ] Trace section shows pipeline stages
- [ ] Fixes section shows placeholder
- [ ] Popover doesn't obscure the edge

### AC2: Type-Specific Rendering
**Given** edges of different payload types
**When** user hovers:
- **Float edge** → [ ] Shows horizontal meter + numeric value
- **Phase edge** → [ ] Shows circular ring with arrow
- **Color edge** → [ ] Shows color swatch + hex value
- **Vec2 edge** → [ ] Shows XY plot + coordinates
- **Bool edge** → [ ] Shows checkmark/X + "true"/"false"
- **Trigger edge** → [ ] Shows pulse lamp + status
- **None edge** → [ ] Shows "(no value)"

### AC3: Trace Summary Display
**Given** an edge with multi-stage pipeline (e.g., Slider → Smooth lens → Add combine)
**When** user hovers the edge
**Then**:
- [ ] Trace section shows: "Slider → Smooth → Add → Port"
- [ ] Each stage is a chip
- [ ] Hovering chip shows tooltip with details
- [ ] Collapsed lens stack shows "Lens (1)" or count

### AC4: Popover Positioning
**Given** edges in different viewport positions
**When** user hovers:
- **Edge in center** → [ ] Popover appears below or beside (not obscuring)
- **Edge near top** → [ ] Popover appears below edge
- **Edge near bottom** → [ ] Popover appears above edge
- **Edge near left** → [ ] Popover appears to right
- **Edge near right** → [ ] Popover appears to left
- [ ] Popover never overflows viewport

### AC5: SimpleDebugPanel Removed
**Given** Sprint 3 completed
**When** developer searches codebase
**Then**:
- [ ] `SimpleDebugPanel.tsx` file does not exist
- [ ] No imports of SimpleDebugPanel
- [ ] Grep for "SimpleDebugPanel" returns zero results (except comments)
- [ ] Toggle button either removed or repurposed for DebugProbePopover

---

## Regression Prevention

### R1: Sprint 1 & 2 Features Preserved
- [ ] Edge hover still works (same trigger mechanism)
- [ ] DebugService queries still work (probePort, probeBus)
- [ ] Ring buffers still populated (getBusSeries works)
- [ ] Frame execution unchanged (no performance regression)

### R2: Existing UI Unchanged
- [ ] ReactFlow editor still functional (pan, zoom, drag)
- [ ] Edge context menu still works (right-click)
- [ ] Node rendering unchanged
- [ ] Other panels (diagnostics, etc.) unaffected

---

## Known Limitations (Acceptable for Sprint 3)

**Documented limitations** (not DoD failures):
- Fixes section is placeholder (no diagnostics integration) → Future
- No expanded trace view (separate panel) → Future
- No timeseries sparklines in renderers → Future
- No pin/unpin popover → Future
- No global Probe mode toggle (always-on hover) → Future
- No keyboard shortcuts → Future

These are **intentional scope limits** for Sprint 3 MVP. Future sprints will add these.

---

## Sign-off Checklist

Before marking sprint DONE:
- [ ] All checkboxes in sections F1-F7 checked
- [ ] All checkboxes in sections T1-T5 checked
- [ ] All checkboxes in sections P1-P3 checked
- [ ] All checkboxes in sections Q1-Q3 checked
- [ ] All checkboxes in sections AC1-AC5 verified by manual testing
- [ ] All checkboxes in sections R1-R2 verified
- [ ] Sprint retrospective completed (what went well, what didn't)
- [ ] CONTEXT.md updated with implementation notes
- [ ] Screenshots of all 7 renderers captured
- [ ] Demo recorded (hover workflow)

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
4. Hover float edge:
   - [ ] Popover appears near edge (not corner)
   - [ ] Shows "Signal:Float" badge
   - [ ] Shows horizontal meter
   - [ ] Shows numeric value
   - [ ] Trace section shows pipeline
5. Hover phase edge:
   - [ ] Shows circular phase ring
   - [ ] Arrow position matches value
6. Hover color edge:
   - [ ] Shows color swatch
   - [ ] Swatch color matches expected
7. Hover vec2 edge:
   - [ ] Shows XY plot
   - [ ] Point position matches (x, y)
8. Hover bool edge:
   - [ ] Shows checkmark or X
   - [ ] Text matches value
9. Hover trigger edge:
   - [ ] Shows pulse lamp
   - [ ] Status text correct
10. Hover edge with no data:
    - [ ] Shows "(no value)" renderer
11. Test popover positioning:
    - Hover edge in center → popover positioned smartly
    - Hover edge near top → popover below
    - Hover edge near bottom → popover above
    - Hover edge near left → popover right
    - Hover edge near right → popover left
12. Verify SimpleDebugPanel removed:
    - [ ] File deleted
    - [ ] No imports found
13. Performance check:
    - Hover 100 edges rapidly → no frame drops
    - DevTools memory profiler → no leaks
14. Review code:
    - All new files have types
    - No TODOs left (except Fixes section)
15. Sign off in PLAN.md

**Evidence**:
- Screenshots of all 7 renderers in action
- Video recording of hover workflow
- Performance profiler screenshot (no leaks)
- Test output logs

---

**END OF DEFINITION OF DONE**
