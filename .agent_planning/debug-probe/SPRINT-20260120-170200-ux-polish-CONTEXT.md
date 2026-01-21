# SPRINT CONTEXT: UX Polish (DebugProbePopover + Type-Specific Renderers)

**Sprint ID**: SPRINT-20260120-170200
**Confidence**: HIGH
**Date Created**: 2026-01-20

---

## Purpose of This Document

This CONTEXT file captures:
1. **Why** Sprint 3 is the final MVP sprint (production-ready UI)
2. **Design decisions** for type-specific renderers
3. **Spec alignment** (what we implement vs. defer)
4. **Lessons from Sprints 1 & 2** that inform this sprint

Read this before extending the Debug Probe feature beyond MVP.

---

## Architectural Decisions

### Decision 1: Use Radix UI Popover (Not Custom Positioning)

**Problem**: How to position popover near edge without manual viewport bounds checking?

**Options Considered**:
1. Custom positioning logic (calculate viewport bounds, reposition manually)
2. CSS-only (position: fixed with transforms)
3. Radix UI Popover (handles positioning automatically)
4. Floating UI (headless positioning library)

**Chosen**: Option 3 (Radix UI Popover)

**Rationale**:
- **Battle-tested**: Radix UI handles all edge cases (viewport bounds, scroll, resize)
- **Accessibility**: Built-in ARIA attributes, keyboard navigation
- **Low effort**: ~10 lines of code vs. 100+ for custom logic
- **Future-proof**: Supports advanced features (pin/unpin, drag) if needed later

**Trade-off**:
- ❌ Adds dependency (~20KB)
- ✅ Zero edge cases to handle
- ✅ Accessible out of the box

**Alternative**: Floating UI is more lightweight but requires more integration work. Radix UI is worth the dependency.

---

### Decision 2: Type-Specific Renderers Are Components (Not Functions)

**Problem**: How to render different value types?

**Options Considered**:
1. Single `ValueRenderer` component with switch statement
2. Separate component per type (`NumberRenderer`, `PhaseRenderer`, etc.)
3. Function map: `renderers[value.t](value)`

**Chosen**: Option 2 (Separate components)

**Rationale**:
- **Single responsibility**: Each renderer handles one type (easy to test)
- **Composability**: Can mix renderers in other contexts (e.g., timeseries plot)
- **Code organization**: 7 files, each ~50-100 lines (manageable)
- **Type safety**: Each component has explicit `value: ValueSummary` prop

**Pattern**:
```tsx
// In DebugProbePopover Section B:
{value.t === 'num' && <NumberRenderer value={value} />}
{value.t === 'phase' && <PhaseRenderer value={value} />}
{value.t === 'color' && <ColorRenderer value={value} />}
// ... exhaustive
```

**Trade-off**:
- ❌ More files (7 renderer components)
- ✅ Easy to test each renderer in isolation
- ✅ Easy to extend (add Shape renderer later)

---

### Decision 3: "Functional, Not Fancy" Renderer Scope

**Problem**: How polished should renderers be in Sprint 3?

**Options Considered**:
1. Pixel-perfect, animated, beautiful (high effort)
2. Functional, readable, unstyled (low effort)
3. Functional with minimal styling (medium effort)

**Chosen**: Option 3 (Functional with minimal styling)

**Rationale**:
- **MVP goal**: Prove value, not win design awards
- **Spec alignment**: Spec describes *what* to show, not *how beautiful*
- **Future polish**: Can iterate on styling after MVP validation

**What "functional" means**:
- NumberRenderer: Horizontal bar (CSS `width: ${percent}%`), no gradients
- PhaseRenderer: SVG circle + line, no smooth rotation animation
- ColorRenderer: `<div style={{ background: color }}>`, no fancy swatch
- Vec2Renderer: Canvas with single dot, no grid lines or axes labels

**What we defer**:
- Smooth animations (phase ring rotation, pulse lamp glow)
- Gradients, shadows, polish
- Responsive resizing
- Dark mode support

**Future**: Polish sprint can add these without changing component interfaces.

---

### Decision 4: TraceSummary Uses Horizontal Layout (Not Vertical)

**Problem**: How to display multi-stage pipeline?

**Options Considered**:
1. Horizontal flow: `Source → Adapter → Lens → Combine → Result`
2. Vertical stack: Source at top, Result at bottom
3. Tree view: Branching structure (for multiple publishers)

**Chosen**: Option 1 (Horizontal flow)

**Rationale**:
- **Spec alignment**: Spec shows horizontal layout (09-debug-ui-spec.md, Section C)
- **Mental model**: Left-to-right matches signal flow
- **Space efficiency**: Popover is portrait-oriented, horizontal fits better

**Handling overflow**:
- Horizontal scroll if pipeline too long (>5 stages)
- Collapse stacks: "Lens (2)" instead of showing all lenses

**Trade-off**:
- ❌ May scroll for deep pipelines (rare)
- ✅ Matches user mental model (signal flows left-to-right)

---

### Decision 5: FixesSection is Placeholder (No Diagnostics Integration)

**Problem**: Should Sprint 3 integrate diagnostics rules engine?

**Options Considered**:
1. Build diagnostics integration now (high effort)
2. Placeholder only, defer to future sprint (low effort)
3. Static mock data (medium effort, throwaway)

**Chosen**: Option 2 (Placeholder only)

**Rationale**:
- **Scope**: Diagnostics rules engine is a separate feature (not implemented yet)
- **MVP goal**: Prove observation UI works (diagnostics can come later)
- **Risk**: Diagnostics integration is complex (bus health, rules engine, fix actions)

**Implementation**:
```tsx
<FixesSection>
  <p className="text-gray-500">(No diagnostics for this port)</p>
  {/* TODO: Integrate diagnostics rules engine */}
</FixesSection>
```

**Future**: Post-Sprint 3, integrate diagnostics when rules engine exists.

**Trade-off**:
- ❌ Section D is not functional (but present)
- ✅ Sprint 3 stays focused on observation UI
- ✅ Can add diagnostics without changing popover layout

---

## Sprint 1 & 2 Learnings Applied

### Learning 1: DebugService API is Stable (No Changes Needed)

**From Sprint 2**:
- `probePort(portKey)` returns complete PortProbeResult
- `probeBus(busId)` returns BusProbeResult
- `getBusSeries(busId, windowMs)` returns timeseries

**Applied in Sprint 3**:
- DebugProbePopover calls `probePort()` directly
- No need to build additional query methods
- TraceSummary gets pipeline from DebugGraph (already in PortProbeResult)

**Impact**: Sprint 3 is purely UI work (no data layer changes).

---

### Learning 2: ValueSummary Exhaustiveness Checking Works

**From Sprint 2**:
- ValueSummary is tagged union with 7 variants
- TypeScript enforces exhaustive `switch (value.t)` handling

**Applied in Sprint 3**:
```tsx
// In DebugProbePopover:
switch (value.t) {
  case 'num': return <NumberRenderer value={value} />;
  case 'phase': return <PhaseRenderer value={value} />;
  case 'color': return <ColorRenderer value={value} />;
  case 'vec2': return <Vec2Renderer value={value} />;
  case 'bool': return <BoolRenderer value={value} />;
  case 'trigger': return <TriggerRenderer value={value} />;
  case 'none': return <UnitRenderer value={value} />;
  case 'err': return <ErrorDisplay code={value.code} />;
}
// TypeScript error if any case missing
```

**Impact**: Can't forget to handle a type (compile-time safety).

---

### Learning 3: 1Hz UI Updates Still Sufficient

**From Sprint 1 & 2**:
- UI queries at 1Hz (not 15Hz)
- Users don't need real-time updates for debugging

**Applied in Sprint 3**:
- DebugProbePopover updates at 1Hz (same as SimpleDebugPanel)
- No need for higher-frequency React re-renders
- Ring buffer data (15Hz) available for future timeseries view

**Impact**: Sprint 3 doesn't need to change update frequency.

---

### Learning 4: Popover Can Reuse useDebugProbe Hook

**From Sprint 1**:
- `useDebugProbe(edgeId)` queries DebugService at 1Hz
- Hook handles throttling, null handling

**Applied in Sprint 3**:
- DebugProbePopover calls `useDebugProbe(edgeId)`
- May refactor to `useDebugProbe(portKey)` (more direct)
- Same throttling logic (no changes needed)

**Impact**: Sprint 3 can reuse Sprint 1 hook (minor refactor at most).

---

## Spec Alignment

### What Sprint 3 Implements from Spec

From **09-debug-ui-spec.md**:
- ✅ Part 2: Probe Card Layout (complete)
  - ✅ Section A: Identity (port name, type badge, role badge)
  - ✅ Section B: "Now" (type-specific renderers)
  - ✅ Section C: "Where It Comes From" (trace summary)
  - ✅ Section D: "Fixes" (placeholder only)
- ✅ Part 5: Visual Conventions
  - ✅ Type badges (Signal:Float, etc.)
  - ✅ Role badges (Clock, Mixer, etc.)
- ❌ Part 1: Probe Mode (deferred)
  - ❌ Global toggle button
  - ❌ Cursor change to crosshair
- ❌ Part 3: Trace View (Expanded) (deferred)
  - ❌ Separate panel with three columns
  - ❌ Reorderable lens stack
  - ❌ Combine mode selector
- ❌ Part 4: Diagnostics Drawer (deferred)
  - ❌ Separate diagnostics panel
  - ❌ Fix buttons (real actions)

**Deferred to Future**:
- Global Probe mode toggle (spec Part 1)
- Expanded trace view (spec Part 3)
- Diagnostics drawer (spec Part 4)
- Keyboard shortcuts (spec Part 6)

**Verdict**: Sprint 3 is **MVP-complete** for observation UI. Deferred items are enhancements, not core functionality.

---

## Renderer Design Rationale

### NumberRenderer: Horizontal Meter

**Why horizontal (not vertical, not circular)?**
- Most values are horizontal ranges (0..1, 0..100)
- Easier to read (compare to ruler)
- Matches common UI pattern (progress bar)

**Why meter + numeric (not just numeric)?**
- Meter provides visual scale (quick glance)
- Numeric provides precision (exact value)
- Together: fast and precise

---

### PhaseRenderer: Circular Ring

**Why circular (not linear 0..1)?**
- Phase wraps (0.99 → 0.01 is a small step, not a big jump)
- Circular matches mental model (clock, rotation)
- Spec explicitly describes "circular phase ring" (09-debug-ui-spec.md)

**Why arrow (not fill)?**
- Arrow indicates direction (clockwise)
- Fill would be ambiguous (is 0.25 25% or 75% filled?)

---

### ColorRenderer: Swatch + Hex

**Why swatch (not just hex text)?**
- Color is inherently visual (text is not enough)
- Swatch provides instant recognition
- Hex provides exact value (for copy-paste)

**Why 40×40px (not smaller/larger)?**
- Large enough to see color clearly
- Small enough to fit in popover
- Standard swatch size in design tools

---

### Vec2Renderer: XY Plot

**Why plot (not just x, y text)?**
- Spatial values are spatial (plot matches mental model)
- Plot shows position relative to bounds
- Text provides exact values

**Why 100×100px (not larger)?**
- Fits in popover
- Shows enough detail for debugging
- Not a full data visualization (just a probe)

---

### TriggerRenderer: Pulse Lamp

**Why lamp (not just text)?**
- Triggers are momentary (lamp conveys "just fired")
- Visual indicator more noticeable than text
- Matches physical hardware (LED indicators)

**Why recent pulses strip (not just current state)?**
- Triggers are discrete (may fire between samples)
- Strip shows pattern (regular pulse vs. sporadic)
- Helps debug "why didn't this fire?"

---

### BoolRenderer: Checkmark

**Why checkmark/X (not colored box)?**
- Universal symbol (no localization needed)
- Clearer than "true"/"false" text alone
- Visually distinct from other renderers

---

### UnitRenderer: Grayed Out Text

**Why "(no value)" (not hide renderer)?**
- Communicates "this is intentional, not a bug"
- User knows data layer is working (just no value)
- Consistent layout (all 7 types have renderers)

---

## Risks Identified During Planning

### Risk 1: Radix UI Popover Integration
**Status**: LOW RISK
**Mitigation**:
- Radix UI has excellent docs and examples
- Used in many production apps (proven)
- Fallback: Use @floating-ui/react (more manual but well-documented)

---

### Risk 2: PhaseRenderer SVG Complexity
**Status**: MANAGEABLE
**Mitigation**:
- Use simple SVG circle + line (not complex paths)
- Test with various phase values (0, 0.25, 0.5, 0.75, 0.99)
- Arrow rotation: `transform="rotate(${phase * 360})"`

**Fallback**: Use canvas instead of SVG (same visual result).

---

### Risk 3: TraceSummary Pipeline Rendering
**Status**: MANAGEABLE
**Mitigation**:
- DebugGraph.pipelines is precomputed (no runtime work)
- Test with 0-stage, 1-stage, 5-stage pipelines
- Collapse stacks to handle deep pipelines

**Fallback**: Show static "Source → Result" if pipeline rendering is buggy.

---

### Risk 4: Popover Hover Behavior (Stays Visible)
**Status**: MEDIUM
**Mitigation**:
- Use Radix UI's `onPointerEnter`/`onPointerLeave` (handles hover-over-popover)
- Add small delay (~100ms) before dismissing
- Test rapid hover on/off

**Fallback**: Click to open popover (not hover) if hover is too flaky.

---

## Open Questions for Future Enhancements

### Q1: Should Popover Be Pinnable?
**Question**: Click to pin popover (stays open after mouse leave)?
**Use Case**: User wants to inspect value while editing patch
**Recommendation**: Defer to post-MVP. Spec mentions pinning in Part 2 (future).

### Q2: Should Renderers Show Timeseries Sparklines?
**Question**: Embed mini-chart in NumberRenderer (last 5 seconds)?
**Use Case**: See value trend at a glance
**Recommendation**: Defer to polish sprint. Ring buffer data already available.

### Q3: Should TraceSummary Be Expandable Inline?
**Question**: Click chip to expand details (e.g., lens parameters)?
**Use Case**: Inspect lens settings without navigating away
**Recommendation**: Sprint 3 shows tooltips only. Inline expansion is post-MVP.

### Q4: Should Popover Be Draggable?
**Question**: Drag popover to reposition (for multi-edge inspection)?
**Use Case**: Advanced debugging workflow
**Recommendation**: Defer. Radix UI supports drag but MVP doesn't need it.

---

## Lessons Learned (To Be Updated After Sprint)

**Placeholder**: Fill this section after sprint completion.

### What Went Well
- TBD

### What Didn't Go Well
- TBD

### What We'd Do Differently
- TBD

### Renderer Implementation Insights
- TBD (note which renderers were easy/hard)

### Popover Positioning Challenges
- TBD (edge cases encountered)

---

## Future Enhancement Roadmap (Post-Sprint 3)

**Phase 2 Features** (from spec):
- Global Probe mode toggle (spec Part 1)
- Expanded trace view panel (spec Part 3)
  - Three-column layout (Sources, Combine, Transform, Result)
  - Reorderable lens stack
  - Enable/disable publishers
  - Combine mode selector
- Diagnostics integration (spec Part 4)
  - Real fix buttons (add smoothing, enable publisher, etc.)
  - Diagnostics drawer (separate panel)
- Keyboard shortcuts (spec Part 6)
  - `P` toggle Probe mode
  - `Escape` dismiss popover

**Polish Sprint** (post-MVP):
- Renderer animations (phase ring rotation, pulse lamp glow)
- Timeseries sparklines in renderers
- Dark mode support
- Responsive resizing
- Pin/unpin popover
- Drag to reposition

**Advanced Features** (power users):
- Multi-popover (inspect multiple edges simultaneously)
- Popover history (recently inspected ports)
- Export popover data (screenshot, JSON)

---

## References

### Spec Documents
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/08-observation-system.md` (data layer)
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/09-debug-ui-spec.md` (UI spec)

### Related Code (To Be Created in Sprint 3)
- `src/ui/components/DebugProbePopover.tsx` (main component)
- `src/ui/components/debug/IdentityBadge.tsx` (Section A)
- `src/ui/components/debug/renderers/NumberRenderer.tsx` (Section B)
- `src/ui/components/debug/renderers/PhaseRenderer.tsx`
- `src/ui/components/debug/renderers/ColorRenderer.tsx`
- `src/ui/components/debug/renderers/Vec2Renderer.tsx`
- `src/ui/components/debug/renderers/BoolRenderer.tsx`
- `src/ui/components/debug/renderers/TriggerRenderer.tsx`
- `src/ui/components/debug/renderers/UnitRenderer.tsx`
- `src/ui/components/debug/TraceSummary.tsx` (Section C)
- `src/ui/components/debug/FixesSection.tsx` (Section D placeholder)
- `src/ui/hooks/usePopoverPosition.ts` (positioning logic)

### Planning Artifacts
- `.agent_planning/debug-probe/EVALUATION-20260120-163500.md` (initial evaluation)
- `.agent_planning/debug-probe/SPRINT-20260120-170000-minimal-debug-panel-*` (Sprint 1)
- `.agent_planning/debug-probe/SPRINT-20260120-170100-full-data-layer-*` (Sprint 2)
- `.agent_planning/debug-probe/SPRINT-20260120-170200-ux-polish-*` (Sprint 3)

---

## Example Popover Layout (To Be Filled After Implementation)

**Placeholder**: After implementation, add screenshot or ASCII mockup here.

```
┌─────────────────────────────────────┐
│ DotsRenderer.radius                 │
│ Signal:Float | Bound        [Jump] │
├─────────────────────────────────────┤
│ ▓▓▓▓▓▓░░░░ 0.73                     │
│ Range: 0..1                         │
├─────────────────────────────────────┤
│ energy → Smooth(0.5s) → Sum → radius│
│   ↓         ↓            ↓      ↓   │
│  0.80     Lens          2 pubs  0.73│
├─────────────────────────────────────┤
│ (No diagnostics for this port)      │
└─────────────────────────────────────┘
```

---

## Incremental Testing Strategy

**Step-by-step validation** (don't wait until end):

1. **After Step 1** (Popover shell):
   - Hover edge → empty popover appears
   - Verify positioning (not fixed corner)

2. **After Step 2** (IdentityBadge):
   - Popover shows port name and type badge
   - Verify badge format

3. **After Step 3.1** (NumberRenderer):
   - Hover float edge → meter + numeric value
   - Verify meter fill matches value

4. **After Step 3.2-3.7** (Other renderers):
   - Test each type individually
   - Verify visual distinctness

5. **After Step 5** (TraceSummary):
   - Hover edge with pipeline → chips appear
   - Verify chip labels match pipeline

6. **After Step 7** (Popover positioning):
   - Test edges in all viewport positions
   - Verify no overflow

7. **After Step 8** (Remove SimpleDebugPanel):
   - Verify no broken imports
   - Verify typecheck passes

This incremental approach catches issues early (not at the end).

---

**END OF CONTEXT DOCUMENT**
