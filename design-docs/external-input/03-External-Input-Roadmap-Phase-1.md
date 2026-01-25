Roadmap: External Inputs (MIDI/OSC/Audio/Mouse/Keyboard) → Channels → Blocks (Canonical)

Phase 0 — Lock the contract (1–2 PRs)

Goal: everyone agrees on what “external input” is in this system.
•	Spec doc (authoritative): docs/specs/external-input-channels.md
•	Frame boundary snapshot (commit-at-frame-start)
•	Read-only during frame
•	Unknown channel returns default (0 / zero vector)
•	Channel kinds: value | pulse | accum (optionally latch)
•	No device-specific switches in SignalEvaluator / IR
•	Naming + namespaces: reserve canonical prefixes:
•	mouse.*, key.*, midi.*, osc.*, audio.*

Deliverable: merged spec + naming registry skeleton.

⸻

Phase 1 — Minimal infrastructure (channels + snapshot) (2–4 PRs)

Goal: runtime has a real channel system with deterministic sampling, even if only float channels exist at first.
•	ExternalWriteBus
•	set(name, v) / pulse(name) / add(name, dv)
•	internal queue of write records (simple, correct)
•	ExternalChannelSnapshot
•	getFloat(name): number
•	returns 0 if missing
•	ExternalChannelSystem
•	owns staging + committed + writeBus
•	commit() drains bus → folds into staging → swaps to committed
•	clears pulse/accum each commit, preserves value channels
•	executeFrame() calls external.commit() as first operation

Deliverable: channels exist, deterministic, no block integration yet.

⸻

Phase 2 — IR support (sigExternal) + evaluator integration (1–2 PRs)

Goal: the compiler and runtime can express “read channel X” as a first-class signal.
•	IR:
•	add SigExpr { kind:'external', which:string }
•	IRBuilder:
•	sigExternal(channel: string, type: SignalType)
•	SignalEvaluator:
•	external case is a single line: return state.external.snapshot.getFloat(expr.which)

Deliverable: IR can represent external reads; runtime reads from snapshot only.

⸻

Phase 3 — Block surface (ExternalInput + utilities) (2–3 PRs)

Goal: users can actually use it in patches without bespoke blocks per device.
•	ExternalInput block
•	config-only channel: string
•	output value: float
•	lower() emits sigExternal(channel)
•	Convenience blocks (only if they reduce patch boilerplate materially):
•	ExternalGate(channel, threshold) → float/bool
•	ExternalLatch (if you include latch semantics)
•	ExternalVec2(channelBase) (if you don’t want users wiring x/y manually)

Deliverable: complete end-to-end “write channel in app → read in patch”.

⸻

Phase 4 — Migrate existing hardcoded externals (mouse first) (2–4 PRs)

Goal: delete legacy “external inputs” fields and switches, replace with channels.
•	Main/app layer writes:
•	mouse.x, mouse.y, mouse.over as value
•	mouse.button.left.down/up as pulse
•	mouse.wheel.dy/dx as accum
•	Smoothing is write-side only
•	keep smoothX/smoothY local to app loop
•	stage the smoothed values into channels
•	Remove:
•	old ExternalInputs interface / updateSmoothing() in RuntimeState
•	any evaluator switch statements for mouse

Deliverable: mouse is 100% channelized and legacy code is gone.

⸻

Phase 5 — Device adapters as “writers” (MIDI, OSC) (3–6 PRs)

Goal: external devices feed channels; patch surface stays generic.
•	MIDI writer module:
•	CC → midi.<dev>.chN.cc.K normalized [0,1]
•	Note on/off → pulse channels
•	Gate/vel as value channels
•	OSC writer module:
•	map OSC address to canonical channel names (stable transform)
•	numeric payload normalized at writer
•	Add a lightweight “channel mapping config” file format:
•	JSON/YAML: input event → channel + scaling + clamp + smoothing
•	hot-reload optional later

Deliverable: MIDI/OSC events appear as channels without compiler changes.

⸻

Phase 6 — Audio analysis integration (FFT/RMS/etc.) (3–8 PRs)

Goal: audio/fft becomes just another writer producing channels.
•	Audio writer module:
•	audio.rms
•	audio.fft.band.low/mid/high
•	optional audio.fft.bin.N
•	optional audio.onset as pulse
•	Decide bin strategy:
•	either many named channels (audio.fft.bin.0..511)
•	or a separate “FFTBuffer” system (only if you need high throughput; otherwise channels are fine)

Deliverable: common audio-reactive workflows work through channels.

⸻

Phase 7 — Type tightening + registry (quality hardening) (2–5 PRs)

Goal: avoid “stringly-typed” chaos while keeping flexibility.
•	ChannelDefRegistry / resolver:
•	define known channels and families (prefix match)
•	specify kind + type + default
•	Diagnostics:
•	unknown channel read: warn once (dev builds)
•	unknown channel write: warn once (optional)
•	channel kind/type mismatch: warn or assert (dev builds)
•	Optional optimization:
•	string → stable channel id table
•	committed values in typed arrays for perf

Deliverable: robust system with guardrails and predictable behavior.

⸻

Phase 8 — Higher-level UX (mapping UI, discoverability) (later)

Goal: non-engineers can wire devices without editing code.
•	UI: “External Channels” panel
•	live view of committed snapshot
•	search + pin channels
•	“learn” mode for MIDI/OSC
•	UI: mapping editor
•	bind an incoming event to a channel
•	scaling/smoothing/curve
•	Patch UX:
•	autocomplete channel names in ExternalInput config

Deliverable: full product-level usability.

⸻

Ordering constraints (the dependency spine)
•	Phase 1 must precede everything.
•	Phase 2 required before Phase 3.
•	Phase 4 can start as soon as Phase 3 lands.
•	MIDI/OSC/Audio are parallel after Phase 4, but share the same writer pattern.

That’s the roadmap statement.