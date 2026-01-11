It should integrate cleanly, but with one important boundary:

EventHub is for “domain facts and lifecycle.”
Diagnostics are a stateful, queryable model that can be updated by many events.

So: Diagnostics do not replace EventHub. They sit on top of it.

Here’s the architecture that keeps it coherent and avoids turning EventHub into a logging firehose.

⸻

1) The relationship: Events drive diagnostics

EventHub emits facts like:
	•	MacroExpanded
	•	CompileStarted
	•	CompileFailed
	•	BindingAdded
	•	TimeRootChanged
	•	ProgramSwapped

A DiagnosticHub subscribes to these events and updates the active diagnostics set.

In other words:
	•	EventHub: what happened
	•	DiagnosticHub: what’s currently true / risky / broken because of what happened

This is critical: diagnostics have lifecycle and deduping; events don’t.

⸻

2) Two integration patterns (choose one)

Pattern A: Diagnostics as a first-class subscriber
	•	EditorStore.events exists
	•	DiagnosticHub registers listeners on it
	•	Other systems (logStore, UI panels) read from DiagnosticHub.state

This is the cleanest. It keeps EventHub generic and diagnostics centralized.

Pattern B: Diagnostics are themselves events

You could emit DiagnosticRaised / DiagnosticResolved on EventHub.

This is useful only if you want other tools to react to diagnostics (telemetry, external client, server). But it can get noisy if you do it indiscriminately.

Best practice: do both, but carefully:
	•	Diagnostics are stored in DiagnosticHub
	•	DiagnosticHub emits coarse events when the diagnostic set changes meaningfully (not per-frame)

⸻

3) What EventHub events you need for diagnostics to work well

Diagnostics care about transitions where truth can change.

Patch/graph mutations
	•	block added/removed
	•	binding added/removed/changed
	•	bus created/deleted/edited
	•	composite edited/saved
	•	time root changed
	•	macro expanded

Compile lifecycle
	•	compile started
	•	compile succeeded (with compile result metadata)
	•	compile failed (with error metadata)

Runtime lifecycle (low frequency)
	•	program swapped
	•	playback started/stopped
	•	runtime health snapshots (throttled, e.g. 2–5Hz)

You do not want frame tick events.

⸻

4) The core flow (who does what)

A) Compiler produces structured diagnostics (not strings)

When compiling, the compiler returns:
	•	program (or failure)
	•	compileDiagnostics[] (structured)

Then the store emits:
	•	CompileSucceeded with diagnostics (or CompileFailed with diagnostics)

B) DiagnosticHub consumes compile events

On CompileSucceeded/Failed:
	•	Replace the entire “compile diagnostics snapshot” for the current patch version.
	•	Mark any previous compile diagnostics as resolved (or discard them).

This prevents stale errors from lingering.

C) Runtime monitors feed runtime diagnostics

Runtime monitors should update DiagnosticHub directly, or via a throttled event like RuntimeHealthUpdated.

DiagnosticHub dedupes by diagnostic.id, increments counts, and expires old ones.

⸻

5) The key design choice: keep diagnostics stateful, not event-only

A diagnostic system needs:
	•	dedupe
	•	update counts
	•	resolve/mute
	•	attach to graph targets
	•	query by block/bus/port

If you model diagnostics purely as events, you lose all that and end up rebuilding state in every consumer.

So you want:
	•	EventHub: stateless stream
	•	DiagnosticHub: canonical state + APIs
	•	UI reads state, does not interpret raw streams

⸻

6) Practical integration points in your editor

Where diagnostics come from
	1.	Compiler returns compile diagnostics
	2.	Validator passes triggered after graph mutations (fast checks)
	3.	Runtime monitor reports health snapshots

How they enter the system
	•	Either directly: diagnostics.report(diagnostic)
	•	Or via event payloads: CompileSucceeded({ diagnostics })

How UI consumes them
	•	Bus Board subscribes to DiagnosticHub and shows aggregated badges per bus
	•	Ports show inline icons when there is a diagnostic targeting (blockId, portId)
	•	A Diagnostics panel lists all active diagnostics filtered by severity/type
	•	Clicking a diagnostic focuses the target

⸻

7) How to keep EventHub clean (avoid event spam)

Diagnostics update can be frequent (runtime), but EventHub should stay relatively quiet.

So:
	•	Compile diagnostics: use EventHub (rare)
	•	Authoring diagnostics: update DiagnosticHub directly or via a single “GraphChanged” event (rare-ish)
	•	Runtime diagnostics: do not emit per-diagnostic events; instead, either:
	•	update DiagnosticHub directly from runtime monitor, or
	•	emit a throttled “RuntimeHealthSnapshot” event

If you want external integrations later, DiagnosticHub can emit a debounced event:
	•	DiagnosticsChanged({ deltaSummary })

Not “raised x 1000 times per second.”

⸻

8) Compile-time enforcement synergy (why this is nice)

Because your EventHub is typed and synchronous:
	•	DiagnosticHub subscriptions can’t introduce await-based coupling
	•	DiagnosticHub can never delay compilation or patch edits
	•	The diagnostic state becomes reliable and testable

You can write tests like:
	•	“After BindingAdded between incompatible types, expect diagnostic E_TYPE_MISMATCH targeting those ports”
	•	“After fixing binding, expect diagnostic resolved”

That’s a huge win.

⸻

9) The simplest “one-path” architecture statement

If you want a single sentence spec you can put in your docs:

The Editor emits typed domain events through EventHub. DiagnosticHub subscribes to these events and maintains the canonical set of active diagnostics, combining compiler snapshots, authoring validation, and throttled runtime health checks. UI renders diagnostics by querying DiagnosticHub, not by interpreting events directly.

That’s the clean division of responsibilities.

⸻

