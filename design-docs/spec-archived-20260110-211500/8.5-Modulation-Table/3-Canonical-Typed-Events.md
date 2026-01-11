Canonical typed event taxonomy (UI → Controller)

Goal: one stable contract, compile-time enforced, no ad-hoc mutations, no async awaiting of handlers.

This is the complete list of events you should standardize around for the graph editor + bus system + structured growth model. It’s grouped by domain, with payload shapes and invariants. (If you adopt this, engineers stop inventing one-off callbacks.)

⸻

0) Foundational types (used everywhere)

type BlockId = string;
type PortId = string;
type BusId = string;
type GraphId = string;

type PortRef = { blockId: BlockId; portId: PortId };
type BlockRef = { blockId: BlockId };
type BusRef = { busId: BusId };

type DensityMode = 'overview'|'normal'|'detail';

type PointerAnchor =
  | { kind: 'port'; port: PortRef }
  | { kind: 'block'; blockId: BlockId }
  | { kind: 'busRow'; busId: BusId }
  | { kind: 'screen'; x: number; y: number };

type TypeDesc = { world:'signal'|'field'|'scalar'|'special'; domain:string; semantics?:string; unit?:string };

type LensStep = { id: string; params: Record<string, unknown> }; // details in lens registry

type CandidateId = string; // typed chooser items resolve to concrete actions


⸻

1) Navigation events

nav.enterGraph

{ graphId: GraphId }

nav.exitToRoot

{}

nav.renameGraph

{ graphId: GraphId; name: string }

nav.createGraph

{ templateId?: string; name?: string }

nav.duplicateGraph

{ graphId: GraphId }

nav.deleteGraph

{ graphId: GraphId }

Invariant: these events never mutate blocks/buses directly; they only change patch structure and selection.

⸻

2) Viewport and density events

view.setDensity

{ density: DensityMode }

view.pan

{ dx: number; dy: number }

view.zoom

{ factor: number; around?: { x: number; y: number } } // screen coords

view.zoomToFit

{ graphId: GraphId; mode?: 'all'|'selection'|'focused' }

view.jumpTo

{ target: { kind:'block'; blockId: BlockId } | { kind:'bus'; busId: BusId } | { kind:'port'; port: PortRef } }

Invariant: view events never mutate graph model.

⸻

3) Selection, focus, hover events

sel.clear

{}

sel.set

{ selection:
  | { kind:'block'; ids: BlockId[] }
  | { kind:'bus'; id: BusId }
  | { kind:'port'; ref: PortRef }
  | { kind:'none' }
}

hover.block

{ blockId?: BlockId } // undefined = clear hover

hover.port

{ port?: PortRef } // undefined = clear

focus.block

{ blockId: BlockId }

focus.bus

{ busId: BusId }

focus.clear

{}

Invariant: focus can change without selection; selection drives bulk operations, focus drives inspector content.

⸻

4) Typed chooser events (the “grow graph” system)

chooser.open

{ anchor: PointerAnchor; forPort: PortRef; expectedType: TypeDesc }

chooser.close

{}

chooser.preview

{ forPort: PortRef; candidateId: CandidateId | null }

chooser.pick

{ forPort: PortRef; candidateId: CandidateId }

Invariant: preview never commits changes. pick must commit via a single transaction.

⸻

5) Block lifecycle events

block.add

{ graphId: GraphId; typeId: string; near?: { blockId: BlockId }; initialParams?: Record<string, unknown> }

block.delete

{ graphId: GraphId; blockIds: BlockId[] }

block.duplicate

{ graphId: GraphId; blockIds: BlockId[] }

block.swapType

{ blockId: BlockId; newTypeId: string; preserveBindings: boolean }

block.rename

{ blockId: BlockId; name: string }

block.setParam

{ blockId: BlockId; paramPath: string; value: unknown } // path supports nested params

block.setParams

{ blockId: BlockId; patch: Record<string, unknown> } // batch update

Invariant: parameter changes are always granular ops (good undo), but setParams is allowed for UI multi-edit.

⸻

6) Port binding events (the heart)

6.1 Inline literal binding

port.bindInline

{ port: PortRef; value: unknown; editorKind?: string }

port.clearInline

{ port: PortRef }

6.2 Bus binding (subscribe)

port.bindBus

{ port: PortRef; busId: BusId; lensChain?: LensStep[] }

port.unbindBus

{ port: PortRef }

port.setLensChain

{ port: PortRef; busId: BusId; lensChain: LensStep[] }

6.3 Publish to bus (output)

port.publishBus

{ port: PortRef; busId: BusId; adapterChain?: LensStep[]; sortKey?: number }

port.unpublishBus

{ port: PortRef; busId?: BusId } // if omitted, remove all publishes from that port

port.setPublisherSortKey

{ port: PortRef; busId: BusId; sortKey: number }

port.setPublisherEnabled

{ port: PortRef; busId: BusId; enabled: boolean }

6.4 Direct binding (local)

port.bindDirect

{ from: PortRef; to: PortRef } // from=output, to=input

port.unbindDirect

{ to: PortRef } // input port can only have one direct source

6.5 Conversions

binding.convertDirectToBus

{ to: PortRef; suggestedBusName?: string; preferExistingBusId?: BusId }

binding.convertBusToDirect

{ to: PortRef; busId: BusId }

Invariants (compile-time enforced by controller):
	•	input port can be in exactly one of: unbound | inline | direct | bus
	•	direct binding allowed only if local-eligible (policy engine)
	•	conversions must be atomic

⸻

7) Bus management events

bus.create

{ name: string; type: TypeDesc; combineMode: string; silentValue: unknown }

bus.rename

{ busId: BusId; name: string }

bus.setCombineMode

{ busId: BusId; combineMode: string }

bus.setSilentValue

{ busId: BusId; silentValue: unknown }

bus.delete

{ busId: BusId; mode: 'force'|'ifUnused' }

bus.duplicate

{ busId: BusId; newName?: string }

bus.setEnabled

{ busId: BusId; enabled: boolean }

Invariant: bus world/type is immutable after creation (no bus.setType event exists).

⸻

8) Diagnostics and repair events

diag.open

{ graphId: GraphId; focus?: { kind:'block'; id: BlockId } | { kind:'bus'; id: BusId } }

diag.applyFix

{ fixId: string; scope: { graphId: GraphId } }

Examples of fix IDs:
	•	convert-long-direct-to-bus
	•	remove-unused-bus
	•	insert-lens-broadcast
	•	replace-illegal-cycle (if you support an auto-fix)

Invariant: fixes are just named transactions.

⸻

9) History / checkpoints events

history.undo

{}

history.redo

{}

history.checkout

{ commitId: string } // history tree navigation

history.createCheckpoint

{ label?: string }

history.tag

{ commitId: string; tag: string }

Invariant: no “truncate history” event exists (per your requirement).

⸻

10) Runtime / player events (looping-aware but UI-driven)

player.play

{}

player.pause

{}

player.scrubTo

{ timeMs: number }

player.setTransportMode

{ mode: 'scrub'|'perform' }

player.setLoopMode

{ mode: 'loop'|'pingpong'|'none' } // UI control; actual topology comes from TimeRoot model

player.setWindow

{ windowMs: number } // for infinite patches: preview window length


⸻

11) How this enforces “no async awaiting handlers”

This taxonomy is intended for your synchronous event dispatcher:
	•	UI emits event
	•	Controller handles synchronously, returns a transaction
	•	Store applies immediately
	•	Rendering updates

No event returns a Promise; no handler is awaited.
(Async work like preview simulation must be done via a separate service that emits a follow-up event like chooser.previewResult, but even that should update UI state without blocking mutation.)

If you want, I can give you the exact TypeScript typings for:
	•	EventMap
	•	emit<K extends keyof EventMap>(k: K, payload: EventMap[K])
	•	on<K extends keyof EventMap>(k: K, handler: (p: EventMap[K]) => void): Unsub
…and the compile-time trick that rejects handlers that return Promise.