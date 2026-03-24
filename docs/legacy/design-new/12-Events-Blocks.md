Canonical list of event blocks:	

 - ClockPulse: emits an event at a fixed period (ms / Hz), with phase-aligned start.
 - EdgeDetect: bool signal → events on rising/falling/both edges.
 - ThresholdCrossing: float signal + threshold (+ hysteresis) → events on up/down crossings.
 - PhaseWrapEvent: phase signal → event on wrap (and optionally N subdivisions per cycle).
 - EventCombine: (A,B,…) → any/all, plus first, last within-frame tie-break rules.
 - EventGate: event + bool enable (and optionally “consume while false”) → gated event.
 - EventDelay: event → event delayed by Δt (ms), with deterministic scheduling.
 - EventDebounce: event → event, enforcing a minimum spacing window (ms).
 - SampleAndHold: signal value + event → latched signal (updates only on event).
 - Accumulator: signal + event → integrated value updated only on event (e.g., add, mul, set), with reset event.
 - Toggle/FlipFlop: event → bool signal that toggles each trigger (optionally set/reset events).
 - EventToImpulse: event → short pulse signal (value=1 for N ms or N frames) for driving continuous blocks.

Subtract the least useful one: EventToImpulse.

Below is a strict, nuts-and-bolts implementation spec for each block in terms of our existing IR concepts: SigExpr, EventExpr, FieldExpr, Steps, ValueSlot, and StateSlotId (from the types.ts we showed).

I’m assuming (consistent with our file) that:
 - Signals are evaluated once per frame into ValueSlots via StepEvalSig.
 - Events are evaluated once per frame into boolean “fired” values via EventExpr (and are not stored in ValueSlots unless we explicitly choose to materialize them).
 - Stateful blocks use SigExprStateRead + StepStateWrite with StateSlotId.
 - Time comes from SigExprTime (tMs, dt, phaseA, phaseB, etc.).

⸻

1) ClockPulse

Purpose: emit an event at fixed period.

Ports
 - Inputs: periodMs: one+continuous<float unit=ms> (or static)
 - Output: tick: one+discrete<unit> (event)

IR lowering
 - Create an EventExprPulse variant that supports multiple clocks, or (simpler) implement as EventExprWrap over a phase derived from time.

Canonical implementation (wrap-based):
1.	Build a signal phase = fract(tMs / periodMs) (range [0,1)).
 - tMs is SigExprTime(which='tMs').
 - periodMs is a SigExprId.
 - Construct:
 - div = SigExprZip([tMs, periodMs], fn=Div)
 - phase = SigExprMap(div, fn=Fract) (or Wrap01 if we prefer)
2.	Output event fires when phase wraps. Use existing:
 - EventExprWrap { signal: phaseSigExprId }

Runtime semantics
 - EventExprWrap compares current phase vs previous frame’s phase for this event expr.
 - Therefore EventExprWrap requires internal per-expr previous value state (NOT exposed as StateSlot). Implemented in the event evaluator’s own cache keyed by EventExprId.

Wrap condition (strict):
 - Fired if curr < prev (primary).
 - Also fired if dt jumped large enough to skip multiple wraps: fired still true (we don’t get “multi-fire” in v1; one event per frame).

⸻

2) EdgeDetect

Purpose: bool signal → event on rising/falling edges.

Ports
 - Input: x: one+continuous<bool>
 - Output: rise/fall/both: one+discrete<unit> (choose one output or expose mode)

IR lowering

we currently have EventExprWrap (numeric) and EventExprPulse only. Add a new EventExprEdge or implement via state.

Strict implementation using state (no new EventExpr kinds):
1.	Convert bool signal to numeric (0/1) in a ValueSlot:
 - xSig is already a signal; if it is bool payload, keep as bool.
2.	Allocate StateSlotId prevX.
3.	Read previous: prev = SigExprStateRead(prevX) (type bool).
4.	Compute firedBool as:
 - Rising: fired = (prev == false) AND (x == true)
 - Falling: (prev == true) AND (x == false)
 - Both: prev XOR x
This requires boolean ops; if we don’t have them as opcodes, represent them as a PureFn.kind='kernel' or add opcodes And/Or/Xor/Not.
5.	Wrap firedBool into an event:
 - Add EventExprWrapBool OR re-use EventExprConst each frame (bad).
 - The clean way is to add EventExprFromBool { signal: SigExprId } (fires if signal true this frame).
 - If we refuse adding a new EventExpr kind, then we must model events as signals (bool) everywhere, which conflicts with our discrete temporality axis.

Therefore the minimal correct change is: add

export interface EventExprFromBool { kind:'fromBool'; signal: SigExprId }

	6.	Update prev state:
 - StepStateWrite(prevX, value=xSigExprId)

Runtime semantics
 - Event evaluation happens after signal evaluation (so x exists).
 - EventExprFromBool reads the current boolean from the ValueStore (slot backing the SigExprId) and outputs fired = that value.
 - State write happens at end of frame.

⸻

3) ThresholdCrossing

Purpose: float + threshold (+ hysteresis) → events on up/down crossing.

Ports
 - Inputs:
 - x: one+continuous<float>
 - threshold: one+continuous<float> (often static)
 - hysteresis: one+continuous<float> (static allowed)
 - Output: event (up/down/both)

IR lowering (stateful, strict)
1.	Allocate StateSlotId prevSide storing last “side” classification: int (-1 below, +1 above).
2.	Compute side each frame:
 - If hysteresis = 0: side = (x >= threshold) ? +1 : -1
 - If hysteresis > 0: define two bands:
 - enterAbove = threshold + hysteresis/2
 - enterBelow = threshold - hysteresis/2
 - If currently above, we stay above until x < enterBelow
 - If currently below, we stay below until x > enterAbove
This requires knowing previous side; so side computation is a small kernel:
 - Inputs: x, threshold, hysteresis, prevSide
 - Output: side
3.	Fired conditions:
 - Up event: prevSide==-1 && side==+1
 - Down: prevSide==+1 && side==-1
 - Both: prevSide!=side
4.	Use EventExprFromBool as above (with comparisons producing bool signal).
5.	StepStateWrite(prevSide, sideSigExprId)

Runtime semantics
 - deterministic: given same signal stream and initial prevSide, identical events.

⸻

4) PhaseWrapEvent

Purpose: phase signal → event on wrap; optional subdivisions per cycle.

Ports
 - Input: phase: one+continuous<phase>
 - Inputs (optional but if present they exist, not optional in the type system): subdivisions: one+continuous<int> (default 1 handled by editor inserting const)
 - Output: tick: one+discrete<unit>

IR lowering

Case A: wrap only (subdivisions = 1)
 - EventExprWrap { signal: phaseSigExprId } (phase payload is numeric 0..1 with wrap semantics)

Case B: subdivisions = N
 - Compute phaseN = fract(phase * N) as signal.
 - Event = EventExprWrap { signal: phaseN }

Runtime semantics
 - Same wrap rule: fired if curr < prev.

⸻

5) EventCombine

Purpose: combine events (any/all) with strict tie-breaking.

Ports
 - Inputs: events[]: one+discrete<unit> (arity ≥ 2)
 - Output: out: one+discrete<unit>

IR lowering
 - we already have:
 - EventExprCombine { events: EventExprId[], mode:'any'|'all' }
So this is direct.

Runtime semantics
 - Evaluate all input events for frame.
 - any: fired if any fired.
 - all: fired if all fired.
No ordering beyond boolean combination.

⸻

6) EventGate

Purpose: gate events by boolean enable.

Ports
 - Inputs:
 - event: one+discrete<unit>
 - enable: one+continuous<bool>
 - Output: out: one+discrete<unit>

IR lowering

Need EventExprFromBool again (or add EventExprGate).

Strict implementation without new EventExpr kind beyond FromBool:
1.	Compute enabledFiredBool = enable AND eventFired
 - This requires eventFired accessible as bool signal. we do not currently have a way to treat an EventExprId as a SigExprId.
2.	Therefore add:
 - SigExprEventFired { event: EventExprId } : one+continuous<bool>
Then:
 - enabledFired = AND(enableSig, SigExprEventFired(eventExpr))
 - EventExprFromBool(signal=enabledFiredSigExprId)

This keeps “events are separate” while still allowing composition with signals.

Runtime semantics
 - Event evaluated; its fired boolean is readable by SigExprEventFired in the same frame (requires evaluator ordering or a two-pass).

⸻

7) EventDelay

Purpose: delay event by Δt ms.

Ports
 - Inputs:
 - event: one+discrete<unit>
 - delayMs: one+continuous<float unit=ms>
 - Output: delayed event

IR lowering (stateful queue)

This is the first “nontrivial” event op: we need a small runtime queue per block instance.

Canonical approach: internal EventOperator state (not ValueSlot)
 - Introduce a new Step kind:

export interface StepEventOp {
kind: 'eventOp';
op: 'delay';
input: EventExprId;
delayMs: SigExprId;
output: EventExprId; // or writes into a dedicated event result table
stateId: StateSlotId; // references event-op state blob
}

…but we don’t have event slots; so “output EventExprId” means the executor stores event results in an EventValueStore.

If we refuse new Step kinds: we can’t implement delay correctly with our current EventExpr set, because delay needs memory of future firings.

So the strict implementation is: add StepEventDelay (or generic StepEventOp) and an EventStateStore keyed by StateSlotId.

Event state format:
 - A ring buffer of scheduled fire times in ms (Float64Array or Uint32Array if ms fits), plus head/tail.
 - On input fired at time t, push (t + delayMs).
 - Each frame, pop while scheduledTime <= tNow, and if any popped, output fired=true for this frame.

Rule: multiple scheduled firings in same frame collapse to single fired=true (v1).

⸻

8) EventDebounce

Purpose: enforce minimum spacing window between firings.

Ports
 - Inputs:
 - event: one+discrete<unit>
 - windowMs: one+continuous<float unit=ms>
 - Output: debounced event

IR lowering (stateful last-fire time)

Same story: requires event memory.

Implement as StepEventDebounce (or StepEventOp with op=‘debounce’).

State:
 - lastFireTimeMs: float initialized to -INF.
 - On input fired:
 - if tNow - lastFireTimeMs >= windowMs then output fired=true and set lastFireTimeMs=tNow else output false.

⸻

9) SampleAndHold

Purpose: latch a signal value when an event fires; output held signal.

Ports
 - Inputs:
 - x: one+continuous<T> (payload-generic, but must be a signal)
 - trigger: one+discrete<unit>
 - Output: y: one+continuous<T>

IR lowering (stateful)
1.	Allocate StateSlotId held typed as T.
2.	Each frame:
 - If trigger fired: write held = x.
 - Output y = held every frame.

In our IR, the conditional write needs either:
 - a kernel select(triggerFired, x, held) and always write, or
 - a new step: StepStateWriteIfEvent.

Strict minimal change: add

export interface StepStateWriteIfEvent {
kind:'stateWriteIfEvent';
stateSlot: StateSlotId;
event: EventExprId;
value: SigExprId;
}

and keep SigExprStateRead to read held.

This avoids inventing boolean mixing and keeps “event-conditional side effect” explicit.

⸻

10) Accumulator

Purpose: update an accumulated value only when event fires (add/mul/set), optional reset event.

Ports
 - Inputs:
 - x: one+continuous<float> (or payload-generic numeric)
 - trigger: one+discrete<unit>
 - reset: one+discrete<unit> (if present, it exists; editor inserts EventNever if unused)
 - Output:
 - y: one+continuous<float>

IR lowering (stateful + conditional)
1.	Allocate StateSlotId acc float.
2.	Each frame:
 - If reset fired: acc = 0 (or a provided resetValue input if we want it explicit).
 - Else if trigger fired: acc = acc + x (or other op)
3.	Output y = acc via SigExprStateRead.

Requires either:
 - StepStateWriteIfEvent plus ordering (reset first, then trigger), or
 - a single StepStateUpdateByEvents with explicit precedence.

Strict precedence rule:
 - If reset and trigger fire in same frame, reset applies first, then trigger uses the reset value as base.

⸻

11) Toggle / FlipFlop

Purpose: event toggles a bool signal; optionally set/reset events.

Ports
 - Inputs:
 - toggle: one+discrete<unit>
 - set: one+discrete<unit>
 - reset: one+discrete<unit>
 - Output:
 - y: one+continuous<bool>

IR lowering (stateful)
1.	Allocate StateSlotId q bool.
2.	Each frame:
 - If set fired: q=true
 - Else if reset fired: q=false
 - Else if toggle fired: q = NOT q
3.	Output q via SigExprStateRead.

Needs conditional state writes again; use StepStateWriteIfEvent in ordered sequence with an explicit precedence table.

Strict precedence:
set > reset > toggle.

⸻

12) EventToImpulse (the one we’d drop, but here’s how)

Purpose: event → short pulse signal for N ms or N frames.

Ports
 - Inputs:
 - event: one+discrete<unit>
 - durationMs: one+continuous<float unit=ms>
 - Output:
 - pulse: one+continuous<float unit=unit> (0 or 1)

IR lowering (stateful end time)
1.	Allocate StateSlotId endTimeMs float.
2.	Each frame:
 - If event fired: endTimeMs = tNow + durationMs
 - pulse = (tNow < endTimeMs) ? 1 : 0
3.	Output pulse as a normal signal.

⸻

To make the above implementable without hacks, we need exactly one of these event “bridge” mechanisms:

Option chosen (single, strict): EventExprFromBool + SigExprEventFired + StepEventOp + StepStateWriteIfEvent
 - EventExprFromBool: turns a boolean signal into an event.
 - SigExprEventFired: lets signal kernels read whether an event fired this frame (for gating/branching).
 - StepEventOp: for event ops that require temporal state (delay/debounce).
 - StepStateWriteIfEvent: explicit event-conditional state updates for S&H, accumulator, toggle.

This keeps:
 - events discrete and not “just bool signals”,
 - stateful event ops explicit in the schedule,
 - no hidden polling, no implicit conversions.

That is the implementation shape.

