Great — here’s the systematic emission map: where each EditorEvent should be emitted in your existing architecture (stores/actions/compiler/player), with consistent rules for meta.tx, meta.rev, and the “single source of truth” for patch mutations.

I’m going to assume your current shape roughly has:
	•	EditorStore (top-level coordination + selection)
	•	PatchStore / patch state mutations (blocks, wires, macros, composites)
	•	BusStore or bus arrays on the store (buses/publishers/listeners)
	•	compile* (compiler entrypoint)
	•	Player (player.ts)

If the actual files differ slightly, the emission points still apply.

⸻

A. Canonical mechanics you’ll use everywhere

A1) Single function to create EventMeta

Centralize meta creation so you don’t duplicate logic:

Where: EditorStore (or whichever owns patch identity + revision)
	•	patchId: current patch id
	•	rev: incremented once per committed transaction (not per event)
	•	tx: created per user action / command (UUID)
	•	origin: 'ui' | 'import' | 'system' | 'remote' | 'migration'
	•	at: performance.now() (or Date.now() if you want wall clock)

Important decision: transaction boundaries

A “transaction” is one user intent:
	•	Insert macro
	•	Create bus
	•	Add listener
	•	Delete block(s)
	•	Change param slider (maybe coalesced)

Within that transaction, you may emit multiple events, but they all share the same tx and the same rev (post-commit).

Implementation implication: use a store-level runTx(origin, fn) wrapper:
	•	beginTx() creates tx id
	•	fn() mutates state
	•	state revision increments once
	•	emit events (or emit during mutation but all use the same rev)

You can do this with MobX runInAction / transaction.

⸻

B. Patch lifecycle emission points

B1) PatchCreated

Where: when you create a new patch object (new project, template, empty patch).

Emit:
	•	PatchCreated { template? }

Also consider emitting:
	•	BusCreated for default buses (if your product always bootstraps them)

B2) PatchLoaded

Where: loadPatch() / openPatch()

Emit:
	•	PatchLoaded { source, version }

Then (still same tx):
	•	if migration occurs: PatchMigrated { fromVersion, toVersion }

Finally:
	•	CompileStarted (reason: load)
	•	CompileSucceeded/Failed
	•	ProgramSwapped

B3) PatchSaved

Where: save/export routines.

Emit:
	•	PatchSaved { destination }

⸻

C. Graph mutation emission points (blocks/wires/params)

These should be emitted inside the same store methods that mutate the patch.

C1) BlockAdded

Where: addBlock(type, position, initialParams)

Emit:
	•	BlockAdded { blockId, blockType, position }

Then (if adding implies any bindings, e.g. dropping a macro already wired):
	•	emit bus events separately (PublisherAdded/ListenerAdded etc.)

C2) BlockRemoved

Where: removeBlock(blockId) or multi-delete

Emit:
	•	BlockRemoved { blockId, blockType }

Also emit, in same tx:
	•	WireDisconnected for each removed wire (optional but good for debug tools)
	•	PublisherRemoved / ListenerRemoved for any routes that were removed implicitly

C3) BlocksMoved

Where: drag move commit (not every mousemove)

Emit:
	•	BlocksMoved { blockIds, delta }

C4) BlockParamChanged

Where: setBlockParam(blockId, paramKey, next) (the single choke point)

Emit:
	•	BlockParamChanged { blockId, blockType, paramKey, prev, next }

Important: coalesce slider drags
	•	either:
	•	emit only on “pointerup”
	•	or emit continuously but throttle; your event log gets noisy otherwise

C5) WireConnected / WireDisconnected

If you are keeping wires for now, emit at wire mutation points:

Where: connect(from, to), disconnect(from, to)

Emit:
	•	WireConnected { from, to }
	•	WireDisconnected { from, to }

Even if you plan to remove wires later, this event map still works during transition.

⸻

D. Macro emission points (this is your immediate use case)

D1) MacroInserted vs MacroExpanded

Pick one canonical event. You can keep both, but you don’t need both long-term.

Recommendation:
	•	Emit MacroInserted once at the end of expansion, with full created ids.
	•	Optionally also emit MacroExpanded for legacy listeners (but I’d choose one).

Where: expandMacro(macroId, dropPosition, options) — the moment it has committed its new blocks/wires/publishers/listeners.

Emit:
	•	MacroInserted { macroId, macroName, createdBlocks, createdWires, createdPublishers, createdListeners }

Then, downstream systems react:
	•	ConsoleCleared { reason: 'macro' } (from logStore reacting)
	•	compile system triggers compile

Do not clear the console inside expandMacro.

⸻

E. Composite emission points

You’ll have two different categories:

E1) Composite definition lifecycle (library-level)

Where: composite library store (definition CRUD)

Emit:
	•	CompositeDefinitionCreated { defId, name, origin }
	•	CompositeDefinitionUpdated { defId, summary }
	•	CompositeDefinitionDeleted { defId }

E2) Composite instance lifecycle (patch-level)

Where: adding/removing composite blocks in the patch

When placing a composite block:
	•	emit CompositeInstanceAdded { blockId, defId, name }

When expanding an instance to primitives:
	•	emit CompositeInstanceExpanded { blockId, defId, expandedBlockIds }

(You may also emit BlockAdded/Removed for the internal changes; either is fine, but keep it consistent. For debugging, I’d emit both: the high-level composite event + the underlying block changes.)

⸻

F. Bus system emission points (core)

These must live in the same actions that mutate buses[], publishers[], listeners[].

F1) BusCreated / Renamed / Deleted

Where: createBus(), renameBus(), deleteBus()

Emit:
	•	BusCreated { busId, name, typeDesc, combineMode, defaultValue, isReserved? }
	•	BusRenamed { busId, prev, next }
	•	BusDeleted { busId }
	•	BusCombineModeChanged { busId, prev, next }
	•	BusDefaultValueChanged { busId, prev, next }

F2) PublisherAdded / Removed / SortKeyChanged

Where: addPublisher(fromPort, busId, sortKey) etc.

Emit:
	•	PublisherAdded { publisherId, busId, from, sortKey }
	•	PublisherRemoved { publisherId, busId }
	•	PublisherSortKeyChanged { publisherId, busId, prev, next }

F3) ListenerAdded / Removed / ChainChanged

Where: addListener(toPort, busId, chain) etc.

Emit:
	•	ListenerAdded { listenerId, busId, to, chain }
	•	ListenerRemoved { listenerId, busId }
	•	ListenerChainChanged { listenerId, busId, prev, next }

This is the backbone that will make bus UI, diagnostics, and compilation all decouple cleanly.

⸻

G. Time model + timeline hint emission points

G1) TimeRootChanged

Where: wherever “TimeRoot” is set or changed in the patch (e.g. dropping a TimeRoot block, or selecting which one is active)

Emit:
	•	TimeRootChanged { prev?, next, timelineHint }

G2) TimelineHintChanged

Where: either
	•	compiler result (if hint derived)
	•	or explicit UI setting (if user changes preview window)

Emit:
	•	TimelineHintChanged { prev, next }

⸻

H. Compile pipeline emission points (this will pay off immediately)

You want compile to be orchestrated by one component (EditorStore or a CompileController) that reacts to “patch changed” events or direct calls from mutations.

H1) CompileStarted

Where: compile entrypoint just before compilation begins

Emit:
	•	CompileStarted { compileId, reason }

H2) CompileSucceeded / CompileFailed

Where: compile completion

Emit:
	•	CompileSucceeded { compileId, durationMs, timelineHint, stats }
or
	•	CompileFailed { compileId, durationMs, errors }

H3) ProgramSwapped

Where: after player/runtime is updated to use new program

Emit:
	•	ProgramSwapped { compileId, strategy }

This will make “no jank” work auditable because you can see when swaps happen and why.

⸻

I. Player/runtime emission points

I1) PlaybackStarted / PlaybackStopped

Where: player.play() and player.pause/stop()

Emit:
	•	PlaybackStarted
	•	PlaybackStopped

I2) ScrubStarted / ScrubEnded

Where: scrubber interaction start/end (UI emits, or player API emits)

Emit:
	•	ScrubStarted
	•	ScrubEnded

I3) TransportModeChanged

Where: switching between scrub/performance semantics

Emit:
	•	TransportModeChanged { prev, next }

⸻

J. Diagnostics + console emission points

J1) DiagnosticAdded / Cleared

Where: diagnostics store (fed by compiler errors, runtime validation, type mismatch checks)

Emit:
	•	DiagnosticAdded { diag }
	•	DiagnosticCleared { scope }

J2) ConsoleCleared / ConsoleLogAdded

Where: logStore only

Emit:
	•	ConsoleCleared { reason }
	•	ConsoleLogAdded { level, message, data? }

And logStore subscribes to the domain event it cares about:
	•	On MacroInserted, if autoClearOnMacro, emit ConsoleCleared.

⸻

K. Refactor order (so you don’t half-do it)
	1.	Add events hub to EditorStore + runTx() wrapper + patch rev.
	2.	Convert the “worst” coupling points first:
	•	macro expansion → emits MacroInserted
	•	logStore reacts → emits ConsoleCleared
	3.	Convert bus CRUD + binding CRUD to events (huge payoff).
	4.	Convert compile pipeline to emit compile lifecycle.
	5.	Convert player to emit runtime lifecycle.

Once you do steps 1–3, most “coupling pressure” disappears.
