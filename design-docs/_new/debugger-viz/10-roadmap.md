Structure is right; I would make four concrete reorder/tightening changes so you don’t paint yourself into a corner.

Reorder

A) Build HistoryService earlier (before Sparkline)

Sparkline’s contract is “given HistoryView, render it.” If HistoryService lands late, you’ll either (a) mock history and rework, or (b) couple Sparkline to DebugService. So:
•	Move Step 11 (HistoryService) to Step 6
•	Move Step 12 (wire push) to Step 7
•	Then build Sparkline (now it has real data)

Revised middle:
•	2 types.ts
•	3 SampleSources
•	4 registry
•	5 GenericValueRenderer
•	6 HistoryService
•	7 DebugService → HistoryService push
•	8 Sparkline
•	9 FloatValueRenderer
•	10 ColorValueRenderer
•	11 DistributionBar
•	12 WarmupIndicator
•	13/14 ViewModes
•	15 MiniView

B) ViewModes should land before specialized renderers

SignalViewMode / FieldViewMode define what data you need from renderers and charts. If you build Float/Color renderers first, you’ll refactor them once ViewMode decides what “full vs inline” actually needs.

So: build SignalViewMode + FieldViewMode immediately after Sparkline + DistributionBar exist, and only then refine Float/Color renderers.

Tighten the file split (to keep “no implicit” enforceable)

C) DebugMiniView.tsx must not know about slots

It should take only:
•	DebugTargetKey
•	DebugService query handles (to build SampleSource)
•	HistoryService handle (to read HistoryView)

Everything slot-related stays inside SampleSource + HistoryService rebinding logic. This prevents UI components from drifting into “just grab a slot and render it.”

D) Put the stride/layout contract in exactly one place

Create a single function in src/ui/debug-viz/types.ts (or a nearby sampleEncoding.ts) that defines:
•	payload → stride
•	payload → component meaning
•	payload sampleability rules (shape = not sampleable)

Both SampleSources and HistoryService must call the same helper so you can’t get a “color is u8 here, float there” split later.

One additional missing step you should add

E) Add a “MappingChanged” notification surface in DebugService before HistoryService rebinding

Even if you already have something informal, make it explicit and typed:
•	DebugService.setEdgeToSlotMap(nextMap) emits onMappingChanged()

HistoryService listens and rebuilds reverse maps + rebinding in one place. This should be an explicit numbered step in the plan, not an implied part of wiring.

With those adjustments, the structure is solid and the ordering will reduce rework while preserving your performance constraints.

--- 

