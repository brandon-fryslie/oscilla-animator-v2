Yes: events do get “slots,” but not ValueSlots—they get their own storage class because they are discrete, edge-like facts, not numeric samples.

Below is a strict, end-state spec for Events in the same “nuts-and-bolts” style as the stride/slots spec.

⸻

Events in the IR and Runtime

0. Scope

This spec defines:
•	Event typing (extent semantics for discrete time).
•	Event expressions (EventExpr) evaluation.
•	Event storage (“event slots”) and per-frame lifecycle.
•	Event → signal/field interaction rules (explicit only).

Non-goals:
•	No implicit coercion between events and numeric signals.
•	No “special casing in executors” per event kind; event evaluation is generic.
•	No event history/sparklines in v1.

⸻

1. Concept: What an Event Is

An event is a value with:
•	temporality = discrete
•	It is meaningful only at a frame boundary (tick).
•	It is true for exactly one tick when it fires, otherwise false.

Formally, for a given event E:
•	E(t) is boolean evaluated at each tick t.
•	An event “fires” when E(t) = true.
•	There is no interpolation between ticks.

⸻

2. Do Events Get Slots?

2.1 Event slots exist and are mandatory

Events are stored in EventSlots, not ValueSlots.
•	ValueSlot is for numeric sample storage (signals and materialized numeric buffers).
•	Events require boolean storage and edge bookkeeping (previous values for edge detection).

Therefore:

type EventSlotId = string; // or branded index like ValueSlot, but distinct type

2.2 Event storage is separate from numeric stores

Runtime MUST NOT store events in the numeric signal slot store.

Events are stored in:
•	A boolean “fired this tick” buffer.
•	Optional persistent per-event state for edge detection (wrap).

⸻

3. Event Types and Extent Rules

3.1 Allowed extents for events

An event’s CanonicalType payload is always bool and its extent must satisfy:
•	temporality.kind === 'discrete'
•	cardinality.kind ∈ {'one','many'} (events can be per-lane)
•	binding/perspective/branch follow the same rules as signals/fields.

So an event type is:
•	Scalar event: one + discrete <bool>
•	Per-lane event: many(instanceId) + discrete <bool>

3.2 No “event as float”

There is no compatibility rule where discrete bool can connect to float/unit/phase.

If a user wants a numeric mask, it must be explicit via a dedicated block (see §9).

⸻

4. IR: Event Expressions

The IR already has these (from your types.ts), and they remain authoritative:

export type EventExpr =
| { kind: 'const'; fired: boolean }
| { kind: 'pulse'; source: 'timeRoot' }
| { kind: 'wrap'; signal: SigExprId }
| { kind: 'combine'; events: readonly EventExprId[]; mode: 'any' | 'all' }
| { kind: 'never' };

4.1 Type attachment

Every EventExpr in IR MUST have an associated resolved CanonicalType describing:
•	payload: 'bool'
•	extent.temporality: discrete
•	extent.cardinality: one|many(instance)

This is not optional: the compiler must compute it and store it in metadata (same pattern as SigExpr/FieldExpr typing).

⸻

5. Event Slots and Meta

5.1 EventSlotMetaEntry

Compiler emits event-slot metadata analogous to SlotMetaEntry, but event-specific:

interface EventSlotMetaEntry {
readonly slot: EventSlotId;

// Extent identity
readonly cardinality: { kind: 'one' } | { kind: 'many'; instanceId: InstanceId };

// Storage plan
readonly storage: 'scalar' | 'perLane';

// For scalar:
readonly scalarOffset?: number; // index into runtime.eventScalars

// For perLane:
// materialized buffers are sized to instance.count and reused across frames
readonly instanceId?: InstanceId;
}

Constraints:
•	storage === 'scalar' iff cardinality.kind === 'one'.
•	storage === 'perLane' iff cardinality.kind === 'many'.

5.2 Allocation rules
•	Scalar events are packed into a single Uint8Array store (eventScalars).
•	Per-lane events are stored in a reusable Uint8Array per (EventSlotId, instanceId).

No overlap, no ambiguity.

⸻

6. Runtime Storage Layout

RuntimeState contains:

eventScalars: Uint8Array
// 0 = not fired this tick, 1 = fired this tick

eventLaneBuffers: Map<EventSlotId, Uint8Array>
// Each is length = current instance.count for that slot’s instanceId.
// Contents are 0/1 fired-this-tick per lane.

6.1 Lifetime and clearing

At the beginning of each tick:
•	All scalar event slots are cleared to 0.
•	All per-lane event buffers are cleared to 0.

This clearing is mandatory and deterministic.

⸻

7. Execution Schedule: Event Evaluation Steps

7.1 New step kind

Add a schedule step:

interface StepEvalEvent {
readonly kind: 'evalEvent';
readonly expr: EventExprId;
readonly target: EventSlotId;
}

7.2 Tick order

Within a tick, evaluation order is:
1.	Evaluate any prerequisite signals needed by event expressions (only those referenced by EventExprWrap).
2.	Evaluate all StepEvalEvent steps.
3.	Execute downstream steps that read event slots (see §9).

The compiler is responsible for ordering steps so that:
•	Any SigExprId used by EventExprWrap has been computed for the same tick before the wrap is evaluated.

⸻

8. Semantics of EventExpr Evaluation

Event evaluation writes “fired this tick” into the target event slot.

8.1 Common rules
•	The write target is either:
•	scalar slot (eventScalars[offset] = 0|1), or
•	per-lane buffer (buf[i] = 0|1).
•	Writing “true” means setting to 1.
•	Multiple writes to the same target in one tick are resolved as:
•	If any write sets 1, it remains 1 (monotone OR within a tick).

8.2 const
•	Writes 1 if fired=true else writes nothing (i.e., remains 0 after clearing).

8.3 never
•	Writes nothing (always 0).

8.4 pulse (timeRoot)

pulse is the global tick pulse. It fires every tick:
•	scalar: set to 1 every tick
•	per-lane: set all lanes to 1 every tick

8.5 combine(mode:any|all)

Combine inputs pointwise in cardinality space.

Constraints:
•	All combined events must have the same cardinality (all scalar or all many over the same instanceId).
•	Compiler must reject mismatches.

Evaluation:
•	any: OR across inputs
•	all: AND across inputs

8.6 wrap(signal)

wrap is edge detection on a scalar numeric signal that is evaluated every tick.

Constraints enforced by compiler:
•	wrapped signal must be temporality=continuous
•	wrapped signal must be cardinality.kind === 'one'
•	wrapped signal payload must have stride=1 (float/int/unit/phase/bool are allowed; vec2/vec3/color forbidden)

8.6.1 Edge rule (strict)
Define x(t) as the wrapped signal’s scalar value for tick t.
Define predicate p(t) = (x(t) >= 0.5).

Event fires on rising edge:
•	wrap(t) = p(t) && !p(t-1)

8.6.2 Persistent state for wrap
Wrap requires per-expression persistent previous predicate value.

Runtime maintains:

eventPrevPredicate: Map<EventExprId, 0|1>

Rules:
•	Initialized to 0 on runtime start and on recompile.
•	Updated after computing p(t) each tick.

8.6.3 NaN/Inf handling
If x(t) is NaN or ±Inf:
•	treat p(t)=false (0)
•	thus it cannot produce a rising edge on that tick

This is deterministic and avoids “poisoning” event state.

⸻

9. Using Events (No Implicit Coercion)

Events are consumed only by ports that explicitly require discrete temporality.

9.1 Event input ports

A port that accepts events must have:
•	payload: 'bool'
•	temporality: discrete
•	cardinality matching whatever the block expects (usually one)

9.2 Explicit adapters/blocks for event ↔ numeric

If you want to use an event as a numeric mask, you must use an explicit block:

9.2.1 EventToSignalMask
•	Input: one+discrete<bool>
•	Output: one+continuous<unit> (or <float> if you prefer)
•	Semantics per tick:
•	output is 1.0 for the tick where event fired, else 0.0
•	The output is a continuous signal that is piecewise-constant per tick.

This is the canonical “event → numeric” bridge and is always explicit.

9.2.2 SampleHold (canonical event-driven state)
•	Input: value signal one+continuous<T> where T is any stride/sampleable payload
•	Input: trigger event one+discrete<bool>
•	Output: held signal one+continuous<T>
•	Semantics:
•	On tick where trigger fires: output becomes current input value
•	Otherwise: output retains previous output value
•	Requires state slots for T (stride-aware, same mechanism as signal slots).

This avoids needing “conditional step execution” in the runtime; it is expressed as dataflow + state.

⸻

10. Debug / Visualization Policy for Events

10.1 Current value

DebugMiniView for an event shows:
•	“FIRED” badge if 1, else “—”
•	No sparkline (history is out of scope; also event is discrete and would require a different renderer anyway).

10.2 History

HistoryService does not track events in v1:
•	track(key) MUST reject if resolved temporality is discrete.

⸻

11. Compiler Validations (Must Reject)

Compiler MUST reject programs that violate any of:
1.	Any EventExprCombine mixing different cardinalities or different instanceIds.
2.	Any EventExprWrap where wrapped signal is not one+continuous and stride=1.
3.	Any wiring from an event output to a non-discrete input port (no implicit conversions).
4.	Any attempt to allocate event data in ValueSlot storage.

These make “events accidentally acting like floats” structurally impossible.

⸻

12. Recompile Semantics

On recompile:
•	All event runtime storage is cleared.
•	eventPrevPredicate is cleared (wrap state resets).
•	Any debug probes referring to event targets rebind the same way as signals (by semantic key), but see no history.

This makes event behavior deterministic with respect to compilation boundaries.

This is the event model that matches your existing temporality axis, preserves explicitness, and cleanly composes with stride-aware value storage without contaminating ValueSlot semantics.