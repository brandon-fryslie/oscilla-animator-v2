---
source: 09-debug-ui-spec.md
source_hash: 6bb9795fe522
generated: 2026-01-12
---

# Index: Debug UI Specification

## 1. Concept Definitions

| Term | Definition | Source |
|------|-----------|--------|
| Probe Mode | Interactive mode that enables cursor changes to crosshair/magnifier for inspecting buses, ports, and bindings | Section 1, lines 22-23 |
| Probe Target | Tagged discriminated union identifying what surface is being inspected (bus, publisher, listener, port, lens, adapter) | Section 1, lines 49-59 |
| Probe Card | Standard 4-section floating panel showing header, live value, trace summary, and fixes | Section 2, line 76 |
| DebugGraph | Data model containing compiled pipelines used in Trace View | Section 3, line 394 |
| DebugService | Service providing real-time snapshots for Probe Card updates | Section 2, line 152 |
| DebugSnapshot | Real-time value snapshot used to visualize current state | Section 2, line 152 |
| Debuggable Surface | Interactive UI element that can be probed (bus row, publisher row, listener row, port badge, lens chip, adapter badge) | Section 1, lines 41-47 |
| Trace View | Expanded view showing detailed transformation pipeline from sources through combine, transform, to result | Section 3, line 217 |

## 2. Key Requirements

### Probe Mode Activation
- Toggle button with "Probe" label or magnifier icon (line 35)
- Cursor changes to crosshair/magnifier when enabled (line 36)
- Can probe any debuggable surface (line 37)

### Debuggable Surfaces
- Bus board row (bus name, value, publishers, listeners)
- Publisher row (shows contribution to bus)
- Listener row (shows transformed value at port)
- Port badge on block (input or output)
- Lens chip (on binding UI)
- Adapter badge (when visible)

### Probe Card Structure (4 Sections)
1. **Header (Identity)**: Title, type+role badges, pin icon, jump link
2. **Now (Live Value)**: Type-specific visualization (meter, phase ring, color swatch, XY plot, pulse lamp)
3. **Where It Comes From (Trace)**: Horizontal transformation chain with source, adapters, lenses, combine, result
4. **Fixes (Guided Actions)**: Up to 3 undoable action buttons from diagnostics rules

### Trace View Columns
- Column 1: Sources (publishers with mini-meters, enable/disable toggles)
- Column 2: Combine (dropdown selector, reorderable list if order-dependent)
- Column 3: Transform (adapter chain, lens stack with toggles and reorder)
- Column 4: Result (same as "Now" section + sparkline)

### Type Badges
- Signal:Float, Signal:Phase, Signal:Color, Signal:Bool, Signal:Trigger, Field:Float

### Role Badges
- Clock, Mixer, Source, Silent, Conflicting, Bound, Unused

## 3. Constraints & Invariants

- All UI is read-only data plus undoable operations (line 26)
- No direct editing of patch structure allowed (line 26)
- Probe Card updates from DebugService at ~15 Hz sample rate (line 392)
- No direct computation—all data pre-calculated (line 393)
- Trace View loads from DebugGraph.pipelines at compile-time (line 394)
- Diagnostics from rules engine (bounded set, <10 items) (line 395)
- Pin/unpin Probe Card via click (pin) or elsewhere click (unpin) (lines 68-70)
- Fixes must be undoable transactions (line 207)
- Color not the only indicator—use icons/badges too (line 383)

## 4. Related Topics

| Topic | Connection | Reference |
|-------|-----------|-----------|
| [08-observation-system.md](./08-observation-system.md) | Provides data model (DebugGraph, DebugSnapshot) | Line 401 |
| [08b-diagnostic-rules-engine.md](./08b-diagnostic-rules-engine.md) | Generates diagnostics shown in Probe Card and Diagnostics Drawer | Lines 209, 402 |

## 5. Visual & Interaction Patterns

### Hover Behavior
- Show subtle outline highlight around surface
- Display Probe Card anchored to cursor or nearby
- Click to pin Probe Card (convert to floating panel)

### Severity Colors
- Error: Red (#e74c3c)
- Warn: Orange (#f39c12)
- Info: Blue (#3498db)
- Hint: Gray (#95a5a6)

### Keyboard Shortcuts (Optional, MVP Not Required)
- P: Toggle Probe mode
- H: Show/hide Trace View
- Escape: Unpin Probe Card, exit Probe mode
- ?: Show keyboard help

### Accessibility Requirements
- All buttons have text labels (not just icons)
- Color not only indicator (use icons/badges)
- Keyboard navigation supported
- Focus indicators visible
- Tooltips on hover

## 6. Implementation Notes

### Performance Targets
- Probe Card updates at ~15 Hz from DebugService.getLatestSnapshot()
- All data pre-calculated (no direct computation)
- Trace View loads from compile-time DebugGraph.pipelines
- Diagnostics bounded to <10 items

### Data Dependencies
- DebugService.getLatestSnapshot() for live values
- DebugGraph.pipelines for trace structure
- Diagnostic rules engine for fixes

### UI Patterns
- Collapse adapter/lens stacks into chips with count badges
- Hoverable chips show mini-tooltip (name, description, type signature)
- Include bypass toggle for each stage
- Reorderable lists with drag handles

## 7. User Workflows

### Workflow 1: Enable Silent Bus ("Why doesn't this animate?")
1. Click Probe toggle
2. Hover "scale" bus
3. Probe Card shows: value 0.5 (constant), no enabled publishers
4. Click "Enable from Slider" fix
5. Scale publisher enabled, animation moves
6. Undo available

### Workflow 2: Smooth Jittery Animation ("Why is this jerky?")
1. Hover "phase" port
2. Probe Card shows jittery phase (high deltaMean)
3. Click "Add smoothing" fix
4. Lag lens inserted with 0.5s preset
5. Animation smooth
6. Undo available

### Workflow 3: Trace Value Sources ("What's feeding this?")
1. Hover port (e.g., Repeat.count)
2. Probe Card shows "Comes from interval bus"
3. Click "Expand Trace"
4. Trace View shows: interval = sum(tempo + offset) with mini-meters
5. Toggle publishers, change combine mode, reorder
6. All changes undoable
