Based on your specs, here's the concrete structure for what we're building:

┌─────────────────────────────────────────────────────┐
│ HistoryService (new)                                │
│  - push-driven from DebugService.updateSlotValue    │
│  - Float32Array ring buffers, keyed by DebugTargetKey│
│  - rebinds on recompile                             │
│  - getHistory(key) → { buffer, writeIndex, ... }    │
└─────────────────────────────────────────────────────┘
▲ fed by
┌─────────────────────────────────────────────────────┐
│ DebugService (existing)                             │
│  - current-frame snapshot                           │
│  - EdgeValueResult discriminated union              │
│  - calls historyService.onSlotWrite on each update  │
└─────────────────────────────────────────────────────┘
▲ read by
┌─────────────────────────────────────────────────────┐
│ ValueRenderer registry (new)                        │
│  Keyed by (payload, unit):                          │
│   - float:scalar  → NumericRenderer (sparkline)     │
│   - float:phase01 → (future) PhaseRenderer          │
│   - color:rgba01  → ColorRenderer (swatch/gradient) │
│   - fallback      → GenericNumericRenderer          │
└─────────────────────────────────────────────────────┘
▲ composed with
┌─────────────────────────────────────────────────────┐
│ CardinalityAdapter (new)                            │
│   ScalarSource (one) → single value + sparkline     │
│   FieldSource (many) → stats + micro-distribution   │
└─────────────────────────────────────────────────────┘
▲ rendered by
┌─────────────────────────────────────────────────────┐
│ DebugMiniView (new component, replaces inline UI)   │
│  - Shared header/type/provenance                    │
│  - Value section delegates to above                 │
└─────────────────────────────────────────────────────┘

Does this decomposition look right to you? Key decisions baked in:
- HistoryService is push-driven (not polling), Float32 ring buffers
- ValueRenderer is a registry, not per-block logic
- CardinalityAdapter handles one vs many — ValueRenderer never knows about lanes

---

Almost right, but three corrections are necessary to keep it consistent with the earlier constraints and to avoid a “quiet spec drift.”

1) Registry key should be payload-first, unit-second (and unit names must be canonical)

Don’t make “(payload, unit)” the primary key in practice. You want:
•	lookup order: exact (payload+unit) → payload-only → payload-category fallback
•	most renderers should be payload-level and read type.unit for decorations

Also, your unit strings in the diagram (phase01, rgba01) don’t exist in your canonical type system. For numeric you have phase, normalized, scalar, etc. For color, you should not invent a “unit” unless you actually add one; color’s canonical meaning is already “RGBA 0..1.”

So: float:phase (not phase01). color is payload-only unless you formally add a color unit concept.

2) “CardinalityAdapter” is the wrong abstraction boundary (call it SampleSource + ViewMode)

A “cardinality adapter” implies you’re adapting types. What you’re actually doing is:
•	SampleSource: how to read values (signal vs field) in a stride-stable way
•	ViewMode: how to present them (signal view vs field view)

ValueRenderer stays “single-sample formatting,” and charts are shared primitives.

So rename that box to:
•	SampleSource (ScalarSampleSource / FieldSampleSource)
•	SignalViewMode / FieldViewMode (composition layer)

That will prevent “adapters” from metastasizing into hidden coercions (you already have an explicit Adapter system for types/units elsewhere).

3) “ValueRenderer never knows about lanes” is correct, but it must never receive history either

History belongs to charts / viewmodes, not the ValueRenderer. The ValueRenderer should render:
•	full sample
•	inline sample

It should not be responsible for sparklines. Sparklines are chart primitives fed by HistoryService.

So change:
•	“NumericRenderer (sparkline)” → “NumericValueRenderer (formatting), Sparkline (chart) composed by SignalViewMode”

Push-driven HistoryService decision: yes, with one explicit requirement

Push-driven is correct, but only if DebugService provides a stable “slot write hook” and you keep the slotToProbes reverse mapping (or equivalent) so you’re not scanning probes per write. That needs to be an explicit invariant in your plan.

With those three adjustments, the decomposition is exactly aligned with the spec and stays clean under growth.

That statement.

---

128 frames.
•	64 frames (~1s @ 60fps) is too twitchy for anything “LFO-ish” or eased motion; you often can’t see the phase relationship or trend.
•	256 frames (~4s) is nice sometimes, but it increases warm-up time, makes the mini-view feel “laggier,” and costs 2× the memory/bandwidth of 128 for marginal benefit in a tiny strip.

Canonical choice: HISTORY_CAPACITY = 128 samples per tracked DebugTargetKey, stored as Float32Array(128 * stride) with writeIndex monotonic.
