---
topic: 9
name: debug-ui-spec
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/09-debug-ui-spec.md
category: unimplemented
audited: 2026-01-24T22:00:00Z
item_count: 10
---

# Topic 09: Debug UI Spec - Gap Analysis

## Primary Category: UNIMPLEMENTED (10 items)

The spec describes a rich probe-mode UI with bus/binding inspection, trace views, and one-click fixes. The implementation has basic edge-value debugging (hover to see value) and a DiagnosticConsole, but the full probe-mode experience is unimplemented.

### 1. Probe Mode activation (toggle button with crosshair cursor)
- **Spec**: Toggle button, cursor change, debuggable surfaces tagged with ProbeTarget
- **Status**: UNIMPLEMENTED - No explicit probe mode. DebugStore tracks hoveredEdgeId but no mode toggle.

### 2. ProbeTarget tagging (bus row, publisher row, listener row, port badge, lens chip, adapter badge)
- **Spec**: Each debuggable surface is tagged with a ProbeTarget discriminated union
- **Status**: UNIMPLEMENTED - No ProbeTarget type

### 3. Probe Card (hover info panel)
- **Spec**: Floating card showing current value, source, type, sparkline
- **Status**: PARTIALLY - Edge hover shows value tooltip, but not the full card with sparkline/source/type

### 4. Trace View (pipeline expansion)
- **Spec**: Expand to see full pipeline: source -> adapter -> lens -> combine -> listener
- **Status**: UNIMPLEMENTED - No pipeline visualization

### 5. Bus Probe Result UI (publishers, listeners, combined value)
- **Spec**: Shows who feeds the bus, who reads it, current combined value
- **Status**: UNIMPLEMENTED - No bus-level probing UI

### 6. Sparkline component (inline timeseries visualization)
- **Spec**: Mini chart showing recent history from ring buffer
- **Status**: UNIMPLEMENTED - No sparkline component

### 7. One-click fixes (from diagnostic actions)
- **Spec**: UI buttons that execute DiagnosticAction (insertBlock, addAdapter, createTimeRoot, etc.)
- **Status**: UNIMPLEMENTED - DiagnosticConsole shows diagnostics but no action buttons

### 8. Diagnostic severity indicators (port badges, bus board badges)
- **Spec**: Inline icons on ports/buses showing errors/warnings
- **Status**: UNIMPLEMENTED - No per-port or per-bus badges in the graph editor

### 9. Patch Health summary (persistent header)
- **Spec**: "Clean / Warnings / Errors" summary always visible
- **Status**: UNIMPLEMENTED

### 10. Time Console indicators
- **Spec**: TimeRoot health and clock status in specialized view
- **Status**: UNIMPLEMENTED

## Also

### DONE (2 items)
1. DiagnosticConsole panel exists (shows active diagnostics in list view)
2. LogPanel exists (shows param flow events, compiler events)

### TO-REVIEW (1 item)
1. DebugStore hover-to-inspect pattern works for edges but uses polling (1Hz) rather than reactive observation. Different from spec's probe approach but functional.
