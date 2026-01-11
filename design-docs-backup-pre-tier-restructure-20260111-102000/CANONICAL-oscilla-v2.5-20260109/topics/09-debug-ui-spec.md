---
parent: ../INDEX.md
topic: debug-ui-spec
order: 9
---

# Debug UI Specification

> Non-technical debug user interface for inspection and one-click fixes.

**Related Topics**: [08-observation-system](./08-observation-system.md), [08b-diagnostic-rules-engine](./08b-diagnostic-rules-engine.md)

**Key Terms**: [DebugGraph](../GLOSSARY.md#debuggraph), [DebugSnapshot](../GLOSSARY.md#debugsnapshot), [DebugService](../GLOSSARY.md#debugservice)

---

## Overview

The debug UI is not a technical panel. It is a non-technical inspection tool that makes the patch feel transparent.

Core workflows:
1. **Probe mode** - Hover to inspect any bus, port, or binding
2. **Trace view** - Expand to see where a value comes from
3. **Diagnostics** - See issues and one-click fixes

All UI is read-only data + undoable operations. No direct editing of patch structure.

---

## Part 1: Probe Mode

### Activation

A toggle button in the main UI:
- **Label**: "Probe" or magnifier icon
- **Behavior**: When enabled, cursor changes to crosshair/magnifier
- **Scope**: Can probe any "debuggable surface" (see below)

### Debuggable Surfaces

Probe works on:
- Bus board row (bus name, current value, publishers, listeners)
- Publisher row (shows contribution to bus)
- Listener row (shows transformed value at port)
- Port badge on a block (input or output)
- Lens chip (on binding UI)
- Adapter badge (when visible)

Each surface is tagged with a `ProbeTarget`:

```typescript
type ProbeTarget =
  | { kind: 'bus'; busId: string }
  | { kind: 'publisher'; publisherId: string }
  | { kind: 'listener'; listenerId: string }
  | { kind: 'port'; portKey: string }
  | { kind: 'lens'; bindingId: string; lensIndex: number }
  | { kind: 'adapter'; bindingId: string; adapterIndex: number };
```

### Hover Behavior

When hovering a debuggable surface:
- Show **outline** around the surface (subtle highlight)
- Show **Probe Card** anchored to cursor or nearby

When clicking:
- **Pin** the Probe Card (convert to floating panel)
- Card remains visible until unpinned
- Clicking elsewhere unpins

---

## Part 2: Probe Card Layout

Standard card with 4 stacked sections. Always in same order, content changes by target kind.

### Section A: Header (Identity)

```
┌─────────────────────────────────────┐
│ energy                              │
│ Signal: Float | Clock               │ Jump ⊞
└─────────────────────────────────────┘
```

- **Title** (large): Bus/port name (e.g., "energy", "DotsRenderer.radius")
- **Subtitle** (small): Two badges:
  - **Type badge**: `Signal:Float` | `Signal:Phase` | `Signal:Color` | `Field` | `Trigger`
  - **Role badge**: `Clock` | `Mixer` | `Silent` | `Conflicting` | `Unknown`
- **Right corner**: Pin icon + Jump link
  - Jump navigates to BusBoard if bus, block inspector if port

### Section B: "Now" (Live Value)

Real-time value visualization, type-specific:

**Number**:
```
┌─────────────────────────────────────┐
│ ▓▓▓▓▓░░░░ 0.73                      │
│ Range: 0..1                         │
└─────────────────────────────────────┘
```
- Horizontal meter (0..1 or domain bounds)
- Numeric readout

**Phase**:
```
┌─────────────────────────────────────┐
│        ⦿ ↑                          │
│      ⟲   (0.25)                     │
│     •                               │
│    pulse: ✓ (just fired)            │
└─────────────────────────────────────┘
```
- Circular phase ring (0..1 wrap)
- Wrap indicator (tick mark at 0)
- Recent pulse indicator

**Color**:
```
┌─────────────────────────────────────┐
│ ■ rgb(200, 100, 50)                 │
│ ◼◼◼◼◼◼◼◼ palette (5/8)              │
└─────────────────────────────────────┘
```
- Color swatch
- If palette domain: palette strip showing position

**Vec2**:
```
┌─────────────────────────────────────┐
│    •              x: 150 y: 200      │
│   / \             (normalized)       │
│  /   \                               │
└─────────────────────────────────────┘
```
- Tiny XY dot plot
- Numeric (x, y) readout

**Trigger**:
```
┌─────────────────────────────────────┐
│ ● ◇ ◇ ◇ (pulse active)              │
│   ✓ ✓ ✓ (recent pulses)             │
└─────────────────────────────────────┘
```
- Pulse lamp (bright if recently fired)
- Mini-strip of recent pulses

All driven from `DebugService.getLatestSnapshot()`. No computation.

### Section C: "Where It Comes From" (Trace Summary)

Horizontal chain of transformation steps. Comes from `DebugGraph.pipelines` or constructed trace.

```
SOURCE → (Adapter) → Lens (2) → COMBINE → RESULT
   ↓         ↓           ↓        ↓       ↓
 phaseA   TypeConv   Smooth   Sum/Last  radius
          i32→f32    0.5s     of 2      0.73
```

**Rules**:
- Always show start and end
- Collapse stacks into single chips with count badge
  - `Lens (3)` - click to expand
  - `Adapters (2)` - click to expand
- Each chip is hoverable
  - Show mini-tooltip: name + brief description + type signature
  - Include "bypass" toggle (for that stage)

**By target kind**:

**Bus probe**:
```
[Publishers] → [Combine Mode] → [Bus Value]
  radio       Sum               0.73
  bass        (add together)
```

**Port probe**:
```
[Bus] → [Listener Chain] → [Port]
phaseA   Adapt+Lenses     0.25
(5 stages)
```

### Section D: "Fixes" (Guided Actions)

Up to 3 actionable buttons if diagnostics apply:

```
⚠ Value is jumping sharply
  □ Add smoothing

⚠ No enabled publishers
  □ Enable from Slider
  □ Set to 0.5
```

**Format**:
- Diagnostic severity icon + one-line reason
- Up to 3 fix buttons
- Each button: action label
- Click executes undoable transaction immediately

Fixes come from rules engine (topic 08b).

---

## Part 3: Trace View (Expanded)

When user clicks "Expand" in Probe Card (or via menu), open a larger panel.

Still non-technical, but more detailed. Three columns: Sources → Combine → Transform → Result.

### Column 1: Sources

**If probing a bus**:
- List of publishers with mini-meters
- Enable/disable toggles
- Sort order visible (if relevant)
- Current value per publisher (from TRACE snapshot if available)

**If probing a port**:
- Bus name (source)
- List of publishers feeding that bus
- Same detail as bus case

Example:
```
Sources:
─────────────────
radio (enabled)       0.8 ▓▓▓▓▓▓░░░
bass (enabled)        0.3 ▓▓░░░░░░░
vox (disabled)        0.0 ░░░░░░░░░

[Enable] [Disable] [Solo]
```

### Column 2: Combine

Dropdown selector showing combine mode in plain language:
- "Add together (Sum)"
- "Take strongest (Max)"
- "Take last (Last)"
- "Layer together (Layer)"

If combine mode depends on order (Last), show publisher order:
- Reorderable list with drag handles
- Dragging updates underlying `sortKey` via undoable operation

```
Combine: ▼ Add together (Sum)

Order:  (only visible if relevant)
 1 ↕ radio
 2 ↕ bass
 3 ↕ vox
```

### Column 3: Transform

Adapter chain (usually small, often hidden):
- List with one-line descriptions
- Minor visual weight

Lens stack (reorderable, toggles):
```
Lenses:
─────────────────
✓ Lag (0.5s)         smooth
✓ Clamp (0..1)       protect
  Softclip           safe
  (insert +)
```

- Checkbox to enable/disable
- Drag handles for reorder
- "Insert +" to add lens

### Column 4: Result

Final value at the target port or bus:
- Same visualization as "Now" section in Probe Card
- Sparkline of last 5 seconds

---

## Part 4: Diagnostics Drawer

Separate panel showing current diagnostics (from rules engine).

```
┌─────────────────────────────────────┐
│  3 Issues Found                     │
├─────────────────────────────────────┤
│ ⚠ W_BUS_SILENT (energy)             │
│   No enabled publishers.            │
│   □ Enable slider_1                 │
│   □ Set to 0.5                      │
│                                     │
│ ⚠ W_JITTER (radius)                 │
│   Value oscillates sharply.         │
│   □ Add smoothing                   │
│   □ Disable publisher               │
│                                     │
│ ℹ I_FLATLINE (scale)                │
│   Value hasn't changed.             │
│   □ Probe this bus                  │
└─────────────────────────────────────┘
```

**Layout**:
- Header: count + clear button
- List of diagnostics
- Each diagnostic:
  - Icon + code + target
  - One-line description
  - Up to 3 fix buttons
  - Click target to navigate

---

## Part 5: Visual Conventions

### Type Badges

```
Signal:Float    Numeric single value
Signal:Phase    Circular/wrapped value
Signal:Color    RGBA or palette index
Signal:Bool     Binary flag
Signal:Trigger  Discrete pulse
Field:Float     Array of floats
```

### Role Badges

```
Clock        Time source (TimeRoot rail)
Mixer        Bus combining multiple inputs
Source       Publisher with no upstream
Silent       No enabled publishers
Conflicting  Multiple publishers in Last mode
Bound        Has consumer
Unused       No consumer
```

### Severity Colors

```
Error    Red (#e74c3c or similar)
Warn     Orange (#f39c12)
Info     Blue (#3498db)
Hint     Gray (#95a5a6)
```

### Hover States

- Surfaces: subtle highlight outline
- Chips: background darkens slightly
- Buttons: standard button hover

---

## Part 6: Keyboard Shortcuts (Optional, MVP Not Required)

```
P              Toggle Probe mode
H              Show/hide Trace View
Escape         Unpin Probe Card, exit Probe mode
?              Show keyboard help
```

---

## Part 7: Accessibility

- All buttons have text labels (not just icons)
- Color is not the only indicator (use icons/badges too)
- Keyboard navigation supported
- Focus indicators visible
- Tooltips on hover (not just on icons)

---

## Part 8: Performance

- Probe Card updates from `DebugService.getLatestSnapshot()` at sample rate (~15 Hz)
- No direct computation—all data pre-calculated
- Trace View loads from `DebugGraph.pipelines` (compile-time)
- Diagnostics from rules engine (bounded set, <10 items)

---

## Related Documents

- [08-observation-system.md](./08-observation-system.md) - Data model (DebugGraph, DebugSnapshot)
- [08b-diagnostic-rules-engine.md](./08b-diagnostic-rules-engine.md) - Rules that generate diagnostics

---

## Example Workflows

### User Workflow 1: "Why doesn't this animation move?"

1. User clicks Probe toggle
2. Hovers "scale" bus
3. Probe Card shows: value is 0.5 (constant), no enabled publishers
4. Sees fix: "Enable from Slider"
5. Clicks fix → scale publisher enabled → animation now moves
6. Undo available

### User Workflow 2: "Why is this jerky?"

1. Hovers "phase" port
2. Probe Card shows phase is jittery (high deltaMean)
3. Sees fix: "Add smoothing"
4. Clicks → Lag lens inserted with 0.5s preset
5. Animation now smooth
6. Undo available

### User Workflow 3: "What's feeding this value?"

1. Hovers port (Repeat.count)
2. Probe Card shows: "Comes from interval bus"
3. Clicks "Expand Trace"
4. Trace View shows: interval = sum(tempo + offset), with mini-meters
5. Can toggle publishers, change combine mode, reorder
6. All changes are undoable

---

