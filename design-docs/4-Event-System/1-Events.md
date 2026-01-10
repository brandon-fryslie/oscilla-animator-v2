That instinct is solid — if you keep the system narrowly scoped to “domain events” and you’re ruthless about preventing it from turning into hooks/middleware. You can absolutely “get ahead of gnarl” by standardizing on one minimal event mechanism and refactoring toward it.

Here’s the clean way to do it so it stays minimal and doesn’t metastasize.

⸻

The one event system you want

Design goals
	•	Typed (no stringly-typed event names)
	•	Synchronous by default (no async semantics in the core path)
	•	Non-blocking (listeners can’t affect control flow)
	•	Scoped (per EditorStore / per PatchStore instance, not global singletons)
	•	Traceable (easy to log/inspect for debugging)
	•	Testable (unit tests can subscribe and assert emissions)
	•	Cannot become hooks (no “before/after” patterns unless explicitly modeled as two separate events)

The key rule

Events are emitted after state changes are committed, and handlers are not allowed to mutate core state synchronously.

That rule prevents reentrancy loops and keeps determinism.

⸻

What to standardize across the app

Event types should be domain facts, not UI events

Good event categories for your project:

Patch / Graph lifecycle
	•	PatchLoaded
	•	PatchSaved
	•	PatchReset
	•	MacroExpanded
	•	CompositeEdited / CompositeSaved
	•	BlockAdded
	•	BlockRemoved
	•	BindingAdded (bus listener created)
	•	BindingRemoved
	•	BusCreated
	•	BusDeleted
	•	TimeRootChanged

Compile lifecycle
	•	CompileStarted
	•	CompileSucceeded
	•	CompileFailed
	•	ProgramSwapped

Runtime lifecycle
	•	PlaybackStarted
	•	PlaybackStopped
	•	FrameAdvanced (careful: high frequency; likely not an event, see below)
	•	Pulse (again, not via event emitter; it’s a signal in the model)

Diagnostics
	•	DiagnosticAdded
	•	DiagnosticCleared

This gives you a single spine for decoupling: the log store, diagnostics panel, inspector, bus board, transport UI, analytics, tests—all react the same way.

⸻

What not to do (to keep it minimal)

1) No async event handlers in the core emitter

If someone wants async work (saving, telemetry), they can do it inside their listener, but the emitter:
	•	calls listeners synchronously
	•	does not await
	•	does not accept Promises
	•	isolates failures (try/catch per listener)

This prevents “macro expansion is slow because some listener awaited a fetch”.

2) No cancellation / no return values

The emitter should not allow:
	•	returning false to cancel
	•	mutating a passed “context object” to influence behavior
	•	priority ordering semantics beyond deterministic subscription order

If you need “can this happen?”, that’s not an event: that’s validation.

3) Avoid high-frequency runtime events

Do not emit “frame tick” or “phase changed” through the event system. Those are signals and should remain in the runtime model, not the app event layer.

Events are for discrete actions and lifecycle transitions, not 60fps data.

⸻

The minimal architecture (concrete)

You want one event dispatcher owned by your top-level store:
	•	EditorStore.events (or PatchStore.events, whichever is the true domain root)

It exposes:
	•	emit(event)
	•	on(type, handler) returning an unsubscribe
	•	subscribe(handler) (optional for “all events” logging)

Events are a discriminated union:

type EditorEvent =
  | { type: 'MacroExpanded'; macroId: string; createdBlockIds: string[] }
  | { type: 'BusCreated'; busId: string }
  | ...

No strings beyond the discriminant. That gives you compile-time exhaustiveness.

⸻

Refactor strategy (so this doesn’t become a multi-month detour)

You can refactor broadly without boiling the ocean by doing it in the right order:

Phase A — Put the event spine in place
	•	Add the dispatcher to EditorStore
	•	Add 4–6 events that immediately pay off:
	•	MacroExpanded
	•	PatchLoaded
	•	CompileSucceeded/Failed
	•	DiagnosticCleared
	•	BlockAdded/Removed

Phase B — Convert cross-store coupling first

Find the places where stores import each other or call into UI-ish things and replace them with events.

Rule:
	•	If a store imports another store only to cause a side effect, replace with event.

Phase C — Convert UI coordination next

UI panels should react to events rather than store-to-store calls:
	•	console/log panel
	•	diagnostics panel
	•	selection changes (maybe)
	•	toasts

Phase D — Leave core dataflow alone

Don’t touch the compiler pipeline just to “event-ify” it unless it’s currently coupled in a bad way.

⸻

How to keep it “generic” without making it a framework

Generic is fine as long as:
	•	it’s typed (union)
	•	it’s scoped (one dispatcher)
	•	it’s non-async
	•	it has no ordering guarantees beyond registration order
	•	it cannot be used for “before/after hooks” without explicitly adding those event types

In other words, make it generic in the type system and minimal in behavior.

⸻

One more safeguard that will save you later

Add a rule (enforced socially or with linting if you want):

Domain functions (like expandMacro, addBus, addListener) may emit events, but may not import UI services or other stores.

This keeps the architecture from regressing.

⸻

If you want, paste 2–3 files where you already feel coupling pain (store imports, side effects, etc.) and I’ll propose the exact first batch of event types + emission points so the refactor is coherent rather than piecemeal.