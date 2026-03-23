the architect has locked in the key decisions:

- 128 frames capacity
- SampleSource + ViewMode, not "CardinalityAdapter"
- ValueRenderer: formatting only (full sample, inline sample). No history, no sparklines.
- Sparkline: chart primitive, composed by SignalViewMode
- Registry lookup: exact (payload+unit) → payload-only → payload-category fallback
- Unit naming: float:phase not phase01, color is payload-only

The corrected decomposition:

HistoryService (push-driven, Float32, 128 capacity, keyed by DebugTargetKey)
▲ fed by
DebugService (snapshot + onSlotWrite hook + onMappingChanged)
▲ read by
┌────────────────────────────────────────────────┐
│ SampleSource                                   │
│   ScalarSampleSource (one) → single sample     │
│   FieldSampleSource (many) → samples + agg     │
├────────────────────────────────────────────────┤
│ ValueRenderer registry (formatting only)       │
│   float → NumericValueRenderer                 │
│   color → ColorValueRenderer                   │
│   fallback → GenericNumericValueRenderer       │
├────────────────────────────────────────────────┤
│ Chart primitives (shared)                      │
│   Sparkline, DistributionBar, WarmupIndicator  │
├────────────────────────────────────────────────┤
│ ViewModes (composition)                        │
│   SignalViewMode: ValueRenderer + Sparkline    │
│   FieldViewMode: stats + DistributionBar       │
├────────────────────────────────────────────────┤
│ DebugMiniView (no slot knowledge)              │
│   header / type / provenance / value section   │
└────────────────────────────────────────────────┘

This is solid. Now let me present the next design section — the DebugTargetKey and sampleEncoding types, since those are the foundation everything else builds on.

  ---
Design Section 2: Core Types (src/ui/debug-viz/types.ts)

/** Semantic identity for a debug probe target. Stable across recompiles. */
export type DebugTargetKey =
| { kind: 'edge'; edgeId: string }
| { kind: 'port'; blockId: string; portName: string };

/** Ring buffer view returned by HistoryService. No allocation on read. */
export interface HistoryView {
readonly buffer: Float32Array;   // capacity * stride
readonly writeIndex: number;     // next write position (monotonic mod capacity)
readonly capacity: number;       // 128
readonly stride: number;         // components per sample
readonly filled: number;         // how many valid samples (0..capacity)
}

/** Resolved sample encoding for a given payload. Single source of truth. */
export interface SampleEncoding {
readonly payload: PayloadType;
readonly stride: number;         // float=1, vec2=2, vec3=3, color=4
readonly components: readonly string[];  // ['x'] or ['r','g','b','a']
readonly sampleable: boolean;    // false for shape
}

/** Aggregate statistics computed from a field buffer. */
export interface AggregateStats {
readonly count: number;
readonly min: number;      // per-component[0] for multi-component
readonly max: number;
readonly mean: number;
}

And the encoding lookup (the single enforcer the architect demanded):

export function getSampleEncoding(payload: PayloadType): SampleEncoding {
switch (payload) {
case 'float': return { payload, stride: 1, components: ['x'], sampleable: true };
case 'int':   return { payload, stride: 1, components: ['x'], sampleable: true };
case 'color': return { payload, stride: 4, components: ['r','g','b','a'], sampleable: true };
case 'shape': return { payload, stride: 0, components: [], sampleable: false };
}
}

Does this type foundation look right before I move to the HistoryService design?



---


Mostly right, with a few crisp fixes so the rest of the system doesn’t get forced into hacks later.

1) DebugTargetKey

✅ Good as written.

One non-negotiable add: make portName explicitly mean the stable port identifier from PortBindingIR.portName (not a UI label). Add that as a doc comment in the type, not elsewhere.

2) HistoryView

✅ The shape is correct.

Two required clarifications:
•	writeIndex semantics: pick one and state it precisely. The safest is:
•	writeIndex = total samples written so far (monotonic, unbounded int in JS number range)
•	consumer index = (writeIndex - 1 - k + capacity) % capacity for the k-th newest sample
This avoids “monotonic mod capacity” ambiguity.
•	stride must be carried by the HistoryView (you already have it). Good. It must match getSampleEncoding(payload).stride at track time, and if it changes on rebind, you must discard history and restart (that’s a correctness guard).

3) SampleEncoding / getSampleEncoding(payload)

✅ Conceptually correct, but your current function is incomplete relative to your own stated design decisions.

You said: “stride: float=1, vec2=2, vec3=3, color=4.”
So getSampleEncoding must cover at least: float | int | vec2 | vec3 | color | phase | unit | bool | shape.

Concrete required mapping (single source of truth):
•	float → stride 1, components ['x'], sampleable true
•	int → stride 1, components ['x'], sampleable true (and SampleSource marks as int for formatting)
•	phase → stride 1, components ['x'], sampleable true
•	unit → stride 1, components ['x'], sampleable true
•	bool → stride 1, components ['x'], sampleable true (encoded as 0/1 at sample layer)
•	vec2 → stride 2, components ['x','y'], sampleable true
•	vec3 → stride 3, components ['x','y','z'], sampleable true
•	color → stride 4, components ['r','g','b','a'], sampleable true (float 0..1, as already locked)
•	shape → stride 0, components [], sampleable false

Also: stride should be typed as 0 | 1 | 2 | 3 | 4, not number, so misuse is compile-time visible.

4) AggregateStats

As written, it’s not sufficient for multi-component payloads and will force incorrect UI later.

Pick one of these (I recommend A because it stays allocation-free and consistent with the stride model):

A (recommended): fixed-size component-wise stats

export interface AggregateStats {
readonly count: number;
readonly stride: 1 | 2 | 3 | 4;
readonly min: Float32Array;   // length 4, only first `stride` used
readonly max: Float32Array;   // length 4
readonly mean: Float32Array;  // length 4
// (optional later) std: Float32Array length 4
}

This matches your “SampleEncoding stride contract” and doesn’t lie about vec3/color.

B: scalar-only contract
If you truly only want scalar field stats in the mini-view, then make it explicit:
•	AggregateStats only exists for stride=1 payloads, and FieldViewMode must fall back for stride>1 (e.g., show magnitude stats or “not supported”).
But that’s a deliberate UX limitation; don’t smuggle it in via “per-component[0]”.

5) Units + registry lookup alignment

You said “Unit naming: float:phase not phase01, color is payload-only.”

So don’t encode unit strings in SampleEncoding. SampleEncoding is payload geometry only (stride/components/sampleable). Unit affects formatting only (ValueRenderer), which you already locked in.

That statement.