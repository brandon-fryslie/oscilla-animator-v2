Your plan is directionally correct, and the core architectural move—“external inputs are named channels sampled once per frame, then read as pure signals”—is the right primitive to unify MIDI/OSC/audio/mouse/keyboard without infecting the IR/runtime with device-specific logic.

Here’s what I would change / extend so it scales to everything you listed without later rewrites.

⸻

1) Two-layer model: “devices write events” → “frame sampler produces channels”

Keep your DoubleBufferedChannelMap, but treat it as the committed per-frame snapshot only.

Add a separate write-side object that can accept:
•	continuous values (mouse position, MIDI CC value, OSC float)
•	edge events (note-on, key-down, button click)
•	short bursts / streams (audio FFT bins)
•	time-stamped bursts (optional)

Then, at frame start, you run a Sampler/Aggregator that consumes write-side state and publishes the committed snapshot.

Why this matters

If you only have stage(name,value) you’ll end up reinventing “event folding” ad hoc:
•	keyboard needs down/up edges, not just “current value”
•	MIDI notes need velocity and maybe gate
•	OSC can arrive multiple times per frame
•	audio FFT arrives at audio rate, not frame rate

So: preserve your simple reader contract, but enrich the writer contract.

⸻

2) Canonical channel kinds

Define channel semantics explicitly. Don’t leave it implicit or you’ll get inconsistent behavior.

I recommend 3 canonical channel kinds that cover everything:

A) value (sample-and-hold)
•	Represents a continuous quantity.
•	At commit: last staged value wins.
•	Default: 0.

Examples:
•	mouse.x, mouse.y
•	midi.cc.1, osc./foo, keyboard.axis.wasd.x
•	audio.rms, fft.band.12

B) pulse (edge/impulse)
•	Represents an event that should be observable for exactly one frame (or N frames if configured).
•	At commit: becomes 1 if any event occurred since last commit, else 0.
•	Optionally store payload separately (see below).

Examples:
•	mouse.click.left, keyboard.key.space.down
•	midi.noteOn.C4, osc./trigger

C) accum (integrated / counted)
•	Represents a sum/count over the time window since last commit.
•	At commit: publishes the accumulated value and clears.

Examples:
•	“how many note-ons happened this frame”
•	“scroll wheel delta”
•	“OSC message count”

These three let you avoid a bespoke special case for each device class while still having deterministic “what does it mean at frame rate”.

⸻

3) Typed channels (minimal, but real)

Your plan makes ExternalInput output float. That’s fine as a lowest common denominator, but you’ll regret not supporting at least:
•	float (primary)
•	bool (or float 0/1)
•	vec2 (mouse pos, joystick)
•	float[] (FFT bins / spectrum) or a structured mapping

Given your system already has multi-component payloads, the clean move is:
•	keep the channel map internally as numbers + small vectors
•	expose reading as sigExternal(channel, type) where type can be float|vec2|...

If you don’t want arrays in the signal layer, don’t. For FFT, use namespacing:
•	fft.bin.0 … fft.bin.511
•	fft.band.low, fft.band.mid, fft.band.high
•	fft.centroid, fft.flux

That’s boring but works extremely well with your existing scalar graph.

⸻

4) Commit semantics: commit should not live in executeFrame “just because”

You’ve got: executeFrame calls commit() as first operation.

That’s okay, but the real contract should be:
•	Commit uses a monotonic “frame stamp” and publishes an immutable snapshot.
•	Everything in the runtime reads only from snapshot for the whole frame.

So if you keep it in executeFrame, enforce “commit exactly once” and treat it as the start-of-frame boundary.

This becomes important once you add:
•	multithreaded audio callback writing channels
•	OSC network thread writing channels
•	UI thread writing channels

You want all of those to be “write side”, with no chance of tearing the read side mid-frame.

⸻

5) Event payloads (velocity, keycode, etc.) without infecting sigExternal

You will eventually need payloads:
•	MIDI note velocity
•	OSC message argument
•	keycode
•	mouse button id

Don’t try to make sigExternal() return a struct.

Do this instead:
•	Keep sigExternal() strictly “return a scalar/vec2 channel value”.
•	Encode payload into additional channels using a naming convention:

Examples:
•	midi.note.C4.gate (0/1)
•	midi.note.C4.velocity (0..1)
•	keyboard.key.space.down (pulse)
•	keyboard.key.space.held (value 0/1)
•	mouse.button.left.down (pulse)
•	mouse.button.left.held (value 0/1)

This keeps your IR and evaluator dead simple while still carrying the data.

⸻

6) Blocks: one reader block is fine, but you’ll want two more

Your ExternalInput(channel)->float is good as the primitive.

Add these two patterns early (still tiny), because they prevent graph spaghetti:

A) ExternalGate
•	output: bool (or float 0/1)
•	config: channel
•	semantics: threshold/booleanize with consistent policy

B) ExternalVec2
•	output: vec2
•	config: channel
•	reads channel+".x" and channel+".y" or supports vec2 channel directly

You can still keep only one block in UI, but internally it’s useful to have canonical specializations to avoid people wiring “mouse.x” and “mouse.y” everywhere manually.

⸻

7) Naming: make it systematic now

If you don’t standardize names now, you’ll get a mess that becomes “ABI”.

Use a clear scheme:
•	mouse.x, mouse.y, mouse.over
•	mouse.button.left.down, .held, .up
•	keyboard.key.<code>.down|held|up
•	midi.<device>.<chan>.cc.<n>
•	midi.<device>.<chan>.note.<name>.gate|velocity
•	osc.<path> (or osc./foo/bar but normalize it consistently)
•	audio.rms, audio.fft.bin.<i>, audio.fft.band.<name>

This alone will save you months later.

⸻

8) Concrete critique of your sprint plan

Keep as-is (good calls)
•	Double-buffered committed snapshot
•	Unknown channel returns 0 (yes)
•	Mouse smoothing on write side (yes)
•	sigExternal(channel) in IR like sigTime() (yes)
•	Remove hardcoded mouse switch in evaluator (yes)

Change / add
1.	Writer side should support “pulse/accum/value” (even if you store only floats, define semantics).
2.	Commit should fold pulses/accums correctly and then clear them.
3.	Consider storing a per-channel descriptor map (name → kind) so a typo doesn’t silently behave as value when you intended pulse.
4.	For MIDI/keyboard, you’ll want both .down (pulse) and .held (value). Plan that now.
5.	For FFT: prefer scalar channels via naming rather than trying to pipe arrays into signal evaluation.

⸻

9) Minimal target architecture (what it “looks like”)

Runtime-side
•	ExternalWriteBus (thread-safe, accepts events/values)
•	ExternalChannelSnapshot (immutable per-frame map)
•	ExternalSampler.commit(frameId) (folds write bus into snapshot)

IR/runtime read
•	SigExpr { kind:'external', which: string }
•	evaluateSignal(external) = snapshot.get(which) ?? 0

Blocks
•	ExternalInput (primitive reader)
•	optional helper blocks for gate/vec2 conveniences

That matches your plan but makes it robust for MIDI/OSC/audio/keyboard without bolting on exceptions later.

That is the statement.