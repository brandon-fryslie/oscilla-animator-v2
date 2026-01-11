# Debug UI Specification - Indexed Summary

**Tier**: T3 (UI Implementation)
**Size**: 437 lines → ~100 lines (23% compression)

## Overview [L1-27]
Non-technical inspection tool. Three workflows:
1. **Probe mode** - Hover to inspect
2. **Trace view** - Expand to see source
3. **Diagnostics** - Issues + one-click fixes

Read-only data + undoable operations. No direct patch editing.

## Part 1: Probe Mode [L30-71]
**Activation**: Toggle button, crosshair cursor
**Scope**: Can probe any "debuggable surface"

**Debuggable Surfaces**:
- Bus board row
- Publisher row
- Listener row
- Port badge
- Lens chip
- Adapter badge

**ProbeTarget** [L50-59]: bus, publisher, listener, port, lens, adapter

**Hover Behavior** [L61-70]:
- Show outline
- Show Probe Card (anchored to cursor)
- Click to pin (convert to floating panel)

## Part 2: Probe Card Layout [L74-210]
Four stacked sections (always same order, content changes by target):

### Section A: Header [L78-92]
- Title (large): Name
- Type badge: Signal:Float | Field | Trigger etc.
- Role badge: Clock | Mixer | Silent | Conflicting | Unknown
- Jump link

### Section B: "Now" (Live Value) [L94-152]
Type-specific visualization:
- **Number**: Meter + readout
- **Phase**: Circular ring, wrap indicator, pulse indicator
- **Color**: Swatch + palette position
- **Vec2**: Dot plot
- **Trigger**: Pulse lamp + recent pulses

All from `DebugService.getLatestSnapshot()`, no computation

### Section C: "Where It Comes From" (Trace) [L154-188]
Horizontal chain: SOURCE → (Adapter) → Lens(N) → COMBINE → RESULT

**By target**:
- **Bus**: [Publishers] → [Combine] → [Bus Value]
- **Port**: [Bus] → [Listener Chain] → [Port]

Collapse stacks into chips (click to expand), show mini-tooltips, bypass toggles

### Section D: "Fixes" (Actions) [L190-209]
Up to 3 undoable buttons if diagnostics apply

Format: severity icon + reason + fix buttons (immediate execution)

## Part 3: Trace View (Expanded) [L212-290]
Larger panel, non-technical, three columns:

### Column 1: Sources [L219-241]
**Bus**: Publishers with mini-meters, enable/disable toggles, sort order
**Port**: Bus name + publishers feeding it
Actions: [Enable] [Disable] [Solo]

### Column 2: Combine [L243-262]
Dropdown: "Add together (Sum)" | "Take strongest (Max)" | "Take last (Last)" | "Layer (Layer)"
If Last: Show reorderable publisher list with drag handles

### Column 3: Transform [L264-283]
Adapter chain (small, minor visual weight)
Lens stack (reorderable, toggles): Checkbox, drag, "Insert +"

### Column 4: Result [L285-289]
Final value visualization + sparkline (5 seconds)

## Part 4: Diagnostics Drawer [L292-324]
Separate panel showing current diagnostics

Layout:
- Header: count + clear button
- List of diagnostics
- Each: icon + code + target, description, up to 3 fix buttons
- Click target to navigate

## Part 5: Visual Conventions [L327-366]
**Type Badges** [L329-338]: Signal:Float, Phase, Color, Bool, Trigger; Field:Float
**Role Badges** [L340-350]: Clock, Mixer, Source, Silent, Conflicting, Bound, Unused
**Severity Colors** [L352-359]: Error (red), Warn (orange), Info (blue), Hint (gray)
**Hover States** [L361-366]: Subtle highlight, background darken, standard button hover

## Part 6: Keyboard Shortcuts (Optional) [L369-376]
P - Toggle Probe mode
H - Show/hide Trace View
Escape - Unpin/exit
? - Help

## Part 7: Accessibility [L379-386]
- Text labels (not just icons)
- Color not only indicator
- Keyboard navigation
- Focus indicators
- Tooltips on hover

## Part 8: Performance [L389-395]
- Probe Card from `getLatestSnapshot()` (sample rate ~15 Hz)
- Trace View from `DebugGraph.pipelines` (compile-time)
- Diagnostics (bounded <10 items)

## Example Workflows [L406-434]
1. "Why doesn't this animate?" - Scale bus silent, enable publisher
2. "Why is this jerky?" - Phase jittery, add Lag lens
3. "What's feeding this?" - See interval bus = sum(tempo + offset)

## Related
- [08-observation-system](./08-observation-system.md) - Data model
- [08b-diagnostic-rules-engine](./08b-diagnostic-rules-engine.md) - Rules
