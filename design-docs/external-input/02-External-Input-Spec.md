Canonical External Input System Spec (Concrete, Implementable)

0) Non-negotiable contract
    1.	All external inputs are sampled at a single frame boundary into an immutable snapshot.
    2.	The runtime only reads from the snapshot during frame execution.
    3.	Writers never mutate the snapshot, only a write-side staging structure.
    4.	Unknown channels return a safe default (0 for float, {0,0} for vec2, etc.).
    5.	No device-specific logic in IR. IR only knows {kind:'external', which:string}.

⸻

1) Data model

1.1 Channel value types (keep it tight)

Support exactly these at the channel layer:
•	float (primary scalar; bools are encoded as 0/1)
•	vec2 (mouse/joystick)
•	vec3 (optional, if you already have it)
•	color (optional)
•	int (optional; often you can keep it as float if you want)

If you want to keep the channel map minimal: store everything as float, and represent vec2 as two channels. The spec below supports both.

1.2 Channel semantics (kinds)

Each channel has a Kind that defines how writes are folded into a snapshot at commit:

type ChannelKind =
| 'value'   // sample-and-hold, last write wins
| 'pulse'   // 1 for exactly one frame if any event occurred
| 'accum'   // sums deltas/counts since last commit, then clears
| 'latch';  // holds nonzero until explicitly cleared (optional but useful)

If you want the smallest set, use: value | pulse | accum.

1.3 Channel definition registry (prevents silent bugs)

You need a registry that declares which channels exist (or at least a prefix family) and their kind/type.

type ChannelType = 'float' | 'vec2' | 'vec3' | 'color' | 'int';

type ChannelDef = {
name: string;              // exact channel name
kind: ChannelKind;
type: ChannelType;
defaultValue?: number | {x:number,y:number} | ...; // optional
};

type ChannelDefResolver = (name: string) => ChannelDef | null;

Resolver behavior:
•	exact match, or prefix match (e.g. audio.fft.bin.123)
•	unknown channel: treat as {kind:'value', type:'float'} OR return null and fallback to default 0 without creating a def (your choice).
The safer option is: unknown returns 0 and logs a diagnostic once per session.

⸻

2) Runtime structures

2.1 Write side vs read side

You want three structures:
1.	Write bus: thread-safe-ish, accepts writes from UI/network/audio.
2.	Staging accumulator: owned by main thread at commit time; it folds all pending writes.
3.	Committed snapshot: immutable map for the frame.

2.2 Write bus API

Two write operations cover everything:

// For 'value' channels: set current value (last write wins)
set(name: string, v: number): void;

// For 'pulse' channels: mark an event occurred (optionally with payload channels set separately)
pulse(name: string): void;

// For 'accum' channels: add delta/count (sum within frame window)
add(name: string, dv: number): void;

Optional convenience:
•	set2(name, x, y) for vec2 or set(name+'.x', x) / set(name+'.y', y)
•	clear(name) for latch or manual reset.

Implementation detail: the write bus stores a queue of “write records” or uses per-channel atomic slots. The simplest that works well:

type WriteRecord =
| { op: 'set', name: string, v: number }
| { op: 'pulse', name: string }
| { op: 'add', name: string, dv: number };

class ExternalWriteBus {
private queue: WriteRecord[] = [];
// If you need cross-thread: swap to a ring buffer or message channel.
push(r: WriteRecord): void;
drain(): WriteRecord[];  // returns and clears the queue
}

Even in JS, this separation is useful: you can drain once per frame and you’re done.

2.3 Snapshot map layout

For speed, don’t use a plain Map<string, number> if you can avoid it long term. But start with it.

Phase 1 (fast to implement):
•	Map<string, number> for float
•	optional Map<string, {x,y}> for vec2

Phase 2 (scales):
•	a stable ChannelIndex (string → int id)
•	Float32Array for values by id

You can start with Phase 1 and keep the API compatible so the swap is mechanical.

⸻

3) Commit algorithm (exact semantics)

3.1 Commit steps (single frame boundary)

At frame start:
1.	Drain write bus → list of WriteRecord.
2.	Apply records into staging according to each channel’s ChannelDef.
3.	Swap staging into committed snapshot atomically (in JS, just swap references).
4.	Clear any one-shot staging for pulse and accum channels (or clear as part of swap).

3.2 Folding rules (precise)

Let S be the staging store and C the committed store.

For each record:

set(name, v):
•	if kind is value or latch: S[name] = v
•	if kind is pulse: S[name] = 1 (and ignore v), or treat set as pulse if you want
•	if kind is accum: S[name] += v (or treat as set, but pick one and lock it)

Canonical:
•	value: set
•	pulse: set means “pulse value” (1)
•	accum: add only, set is allowed but treated as overwrite if you need it

pulse(name):
•	S[name] = 1 for this commit window
•	on next commit, if no new pulse, becomes 0

add(name, dv):
•	S[name] = (S[name] ?? 0) + dv
•	on next commit, if no new adds, becomes 0

Clearing policy:
•	value: persists across frames until overwritten
•	pulse: resets to 0 every commit
•	accum: resets to 0 every commit
•	latch: persists until explicit clear (optional)

This is the key difference between “sample” and “event”.

⸻

4) Reader contract (what the runtime exposes)

4.1 RuntimeState surface

class ExternalChannelSnapshot {
getFloat(name: string): number; // returns 0 if absent
getVec2(name: string): { x: number; y: number }; // returns {0,0} if absent
}

RuntimeState.externalSnapshot: ExternalChannelSnapshot

4.2 SignalEvaluator change

Change your IR to:

type SigExpr =
| ...
| { kind: 'external', which: string };

Evaluator:
•	return state.externalSnapshot.getFloat(expr.which);

No switch statements per device. Ever.

⸻

5) IRBuilder API

Add:

sigExternal(channel: string, type: SignalType): SigExprId

Emission rule:
•	the type is for the compiler/type checker; runtime reads numeric.
•	if you use vec2 channels, either:
•	encode vec2 as packed payload in signal layer (requires support), or
•	restrict sigExternal to scalars and use block-level packing (recommended initially)

Canonical minimal:
•	sigExternal returns scalar only.
•	vec2 is two channels + MakeVec2 block.

⸻

6) Block layer (concrete block configs)

6.1 ExternalInput (scalar)
•	category: io
•	capability: io
•	cardinality: preserve
•	payload: float
•	unit: scalar (or unit-var if you want to constrain it by consumer; I’d keep it scalar unless you have a reason)

Config-only input channel (string).

Lowering:
•	ctx.b.sigExternal(channel, signalType('float'))

6.2 ExternalGate (scalar -> bool-ish)

Config:
•	channel: string
•	threshold: float default 0.5
Output:
•	out: bool (or float)

Lower:
•	sigExternal(channel) then opcode('gt') (if you have it) or step style op.

6.3 ExternalVec2 (optional convenience)

Config:
•	channelBase: string (e.g. mouse)
Reads:
•	channelBase + '.x', channelBase + '.y'
Outputs:
•	vec2 via pack kernel or MakeVec2.

This prevents every user patch from manually wiring x/y.

⸻

7) Concrete channel namespace (authoritative)

7.1 Mouse

Value:
•	mouse.x ∈ [0,1]
•	mouse.y ∈ [0,1]
•	mouse.over ∈ {0,1}

Pulse:
•	mouse.button.left.down
•	mouse.button.left.up
•	mouse.button.right.down …
Accum:
•	mouse.wheel.dx
•	mouse.wheel.dy

7.2 Keyboard

Value:
•	key.space.held ∈ {0,1}
Pulse:
•	key.space.down
•	key.space.up

If you want WASD axis:
Accum or value computed at write side:
•	key.axis.wasd.x in [-1,1]
•	key.axis.wasd.y in [-1,1]

7.3 MIDI

Value:
•	midi.<dev>.ch<1-16>.cc.<0-127> ∈ [0,1]
Pulse:
•	midi.<dev>.chN.note.<note>.on
•	midi.<dev>.chN.note.<note>.off
Value (paired payload):
•	midi.<dev>.chN.note.<note>.gate ∈ {0,1}
•	midi.<dev>.chN.note.<note>.vel ∈ [0,1]
•	midi.<dev>.chN.pitchbend ∈ [-1,1]

7.4 OSC

Value:
•	osc./path/to/value (normalized by writer)
Pulse:
•	osc./path/to/trigger (if messages are events)

If OSC path strings are awkward, canonicalize to osc.path.to.value.

7.5 Audio / FFT

Value:
•	audio.rms
•	audio.fft.band.low
•	audio.fft.band.mid
•	audio.fft.band.high
Scalar bins if needed:
•	audio.fft.bin.0 … audio.fft.bin.511

Accum (optional):
•	audio.onset could be a pulse instead.

⸻

8) Where smoothing and filtering lives (hard rule)

All smoothing is write-side. The reader is pure.

So:
•	UI thread maintains mouseSmoothX/Y
•	Audio thread maintains smoothing and writes final channels
•	MIDI smoothing (if any) done at write side

This keeps evaluation deterministic and avoids “hidden state in reads”.

⸻

9) Determinism and debugging hooks

Add minimal instrumentation:
•	Maintain a per-frame list of “channels read” (optional, debug build)
•	Maintain a per-frame list of “channels written” (optional)
•	Log unknown channel reads once per session (rate-limited)

This makes it easy to see typos.

⸻

10) Acceptance tests (specific)
    1.	Value persists:

    •	stage mouse.x=0.2 then commit then read during frame → 0.2
    •	next frame with no writes → still 0.2

    2.	Pulse is one frame:

    •	pulse('key.space.down') before frame → reads as 1 for that frame
    •	next frame no pulse → reads 0

    3.	Accum clears:

    •	add('mouse.wheel.dy', 1) twice before commit → committed is 2
    •	next frame no adds → 0

    4.	Unknown returns 0:

    •	read midi.foo never written → 0

⸻

11) Small edits to your sprint plan (concrete)
    •	Rename stage(name,value) to set(name,value) to avoid conflating with double-buffering.
    •	Add pulse(name) and add(name,delta) now (they’re tiny and prevent future hacks).
    •	Add a minimal ChannelDefResolver now, even if it’s just prefix rules for FFT/MIDI.

That’s the statement.