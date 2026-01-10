Below is the concrete data model that makes the Modulation Table the authoritative UI, plus a step-by-step transformation plan from your current “blocks + inspector + preview” editor into this table-driven editor—without needing any node layout, wires, or lanes.

I’m going to assume you already have (or are close to) these concepts in the repo:
	•	Block instances with typed ports
	•	Bus objects with type + combine mode
	•	Publisher and Listener records (your bus routing)
	•	TypeDesc compatibility + adapter/lens registry

If any of those are still partial, this spec is still the right target; it just defines the missing pieces clearly.

⸻

Part 1 — Canonical data structures

1) Keep your “engine truth” model simple and explicit

Your core patch model should remain graph-ish internally, but UI never shows it.

// Patch is the source of truth.
interface Patch {
  id: string;

  // blocks exist (renderers, domains, clocks, ops, etc.)
  blocks: Record<BlockId, BlockInstance>;

  // bus system is the routing backbone
  buses: Record<BusId, Bus>;

  // publishing is “outputs contribute to bus”
  publishers: Publisher[];  // flat list is fine; index for perf

  // listening is “input reads from bus through lenses”
  listeners: Listener[];    // flat list is fine

  // no direct wires required for UI; if you keep them internally, they are a separate mechanism
  directBindings?: DirectBinding[];
}

interface BlockInstance {
  id: BlockId;
  typeId: string;
  name?: string;
  params: Record<string, unknown>;
  // ports are defined by registry for typeId; instance doesn't need to store them
}

interface Bus {
  id: BusId;
  name: string;
  type: TypeDesc;  // immutable
  combineMode: CombineMode;
  silentValue: unknown; // explicit "empty bus" value
  enabled: boolean;
}

interface Publisher {
  id: string;
  from: PortRef;        // output port
  busId: BusId;
  sortKey: number;      // deterministic ordering
  enabled: boolean;

  // optional: publisher-side adapters (usually you do it on listener side)
  adapterChain?: LensChain;
}

interface Listener {
  id: string;
  to: PortRef;          // input port
  busId: BusId;
  enabled: boolean;

  // the cell content, effectively
  lensChain: LensChain;
}

interface DirectBinding {
  id: string;
  from: PortRef; // output
  to: PortRef;   // input
}

2) The Modulation Table is just a projection of Patch

The table itself should not be stored as a separate graph. Instead you store TableView state (filtering, grouping, column pinning) so it’s stable and fast.

interface TableViewState {
  id: string;
  name: string;

  // what the user is “looking at”
  focusedBlockId?: BlockId;
  focusedBusId?: BusId;

  // column behavior
  pinnedBusIds: BusId[];
  hiddenBusIds: BusId[];

  // row behavior
  collapsedGroups: Record<string, boolean>; // groupKey -> collapsed
  hiddenRowKeys: Record<string, boolean>;

  // filters
  rowFilter: RowFilter;
  colFilter: ColFilter;

  // sorting policy
  busSort: 'alpha'|'activity'|'type'|'custom';
  rowSort: 'rendererFirst'|'alpha'|'custom';

  // UX
  showOnlyBoundCells: boolean;
  showOnlyCompatibleColumnsForFocusedRow: boolean;
}

3) Row identity needs to be stable and addressable

Rows represent ports (usually input ports) exposed as “targets”.

type RowKey = string; // stable

interface TableRow {
  key: RowKey;
  label: string;          // "radius"
  groupKey: string;       // "Render: Dots"
  blockId: BlockId;       // owning block
  portId: PortId;         // input port
  type: TypeDesc;         // expected type
  semantics?: string;     // optional
  defaultValueSource: 'blockParam'|'silent'|'literal'; // for display
}

RowKey should be deterministic:
	•	rowKey = ${blockId}:${portId}``

GroupKey likewise deterministic:
	•	groupKey = ${groupKind}:${blockId}or${groupKind}:${blockTypeId}` depending how you want grouping.

4) Columns are buses, but with computed metadata

interface TableColumn {
  busId: BusId;
  name: string;
  type: TypeDesc;
  combineMode: CombineMode;
  enabled: boolean;

  // derived metadata
  publisherCount: number;
  listenerCount: number;
  activity: number; // computed (for sorting / UI indicator)
}

5) Cells are derived from listeners (1:1 mapping)

A cell exists if there is a Listener from that (row.port) to that bus.

interface TableCell {
  rowKey: RowKey;
  busId: BusId;

  // if bound
  listenerId?: string;
  enabled?: boolean;
  lensChain?: LensChain;

  // compatibility / suggestion
  status: 'empty'|'bound'|'incompatible';
  suggestedChain?: LensChain; // computed if convertible
  costClass?: 'cheap'|'moderate'|'heavy';
}

Important constraint that keeps UI sane:
	•	At most one listener per input port.
	•	So a row can only be bound to one bus at a time.
	•	If you want “multiple influences,” that happens through bus combine upstream, not multiple subscriptions per port.

(This is the key simplifier that makes the grid usable.)

6) LensChain is the cell’s “formula”

type LensChain = LensStep[];

interface LensStep {
  lensId: string; // references registry
  params: Record<string, unknown>;
  enabled: boolean;
}

Lens registry is how you keep this tight:
	•	Each lens declares (fromType, toType, costClass, uiSchema, compileFnId)
	•	Table never compiles; it just stores lens steps.

7) You need indexes for performance and simplicity

Don’t repeatedly scan arrays.

Build derived indices each patch load / each transaction:

interface PatchIndex {
  listenersByInputPort: Map<string /*PortRefKey*/, Listener>;
  publishersByBus: Map<BusId, Publisher[]>;
  listenersByBus: Map<BusId, Listener[]>;
  portsByBlock: Map<BlockId, { inputs: PortId[]; outputs: PortId[] }>;
}

PortRefKey:
	•	${blockId}:${portId}

These indices make table rendering and binding O(1).

⸻

Part 2 — How to transform your existing UI into this

You can keep most of the app shell:
	•	Preview panel stays
	•	Inspector stays (but changes content)
	•	Block library stays (but changes insertion UX)
	•	Patch store stays (but stops thinking in lanes/wires)

The big shift is: PatchBay becomes TableView.

Step A — Change the editor layout (structural UI)

Replace the current center “lane editor” area with a split:

Left: “Instrument Builder” (block list + domains + renderers)
Center: Modulation Table (the grid)
Right: Inspector (contextual)
Top: Transport (but redesigned around looping later)
Bottom: Console / diagnostics (optional)

The essential part: the table is now central and unavoidable.

Step B — Replace “add block on canvas” with “add block to system”

Block insertion becomes a non-spatial action:
	•	A “+ Add” button opens library
	•	Selecting a block adds it to patch
	•	The table updates immediately with new rows (inputs) and/or columns (if it publishes to a bus)

So instead of “place a node,” you “add an instrument component”.

Step C — Define “Row surfaces” for key block types

For every block type, you must decide which ports appear as rows.

Rules:
	•	Renderer blocks: all important visual attributes appear as rows
	•	Domain blocks: important spatial attributes appear as rows (jitter, spacing, origin, etc.)
	•	TimeRoot: not rows; it is global (top bar + time panel)
	•	Operators: never rows by default (they are internal logic); they appear only in “Sources Panel” if needed
	•	Signal sources: don’t create rows; they create publishers to buses (columns)

This is a registry concern:

interface BlockUiContract {
  showInLibrary: boolean;
  panelCategory: 'Domain'|'Renderer'|'Source'|'Operator'|'Utility';
  tableRows?: PortId[];        // which input ports become rows
  tableRowGroups?: { groupTitle: string; ports: PortId[] }[];
  autoPublish?: { outputPortId: PortId; busSuggestion: string }[];
}

That contract is what makes this UI consistent.

Step D — Binding flow: click cell, not port

The table becomes the binding surface:
	•	Clicking an empty cell (row, column intersection) does:
	1.	if types compatible: create/replace Listener
	2.	if convertible: propose lens chain and create Listener
	3.	if incompatible: show why + offer “create compatible bus” or “choose different bus”

This is your existing bus listener system, surfaced as a grid.

Step E — “Sources Panel” replaces visible operator graphs

You still need to create bus publishers. But you do it in a list, not a graph.

Create a panel called Sources with sections per bus:
	•	phaseA:
	•	PhaseClock (publisher)
	•	LFO (publisher)
	•	Noise (publisher)

Each publisher row has:
	•	enabled toggle
	•	sortKey / layer ordering (with drag ordering)
	•	“open details” (params)
	•	which port it publishes from

This means you never “see” PhaseClock as a node. It’s an instrument component.

This panel is the moral equivalent of your node graph for sources.

Step F — Handling what you currently do with direct wiring

You likely still have some places where wiring is “handy” (operators feeding operators).

In this paradigm, you have two choices:
	1.	Make operators publish to buses too (preferred)
	•	everything becomes bus-centric
	•	operator chains live inside “Sources”, possibly as small inline pipelines
	2.	Allow direct bindings only inside a “Source Stack editor”
	•	never in the main UI
	•	e.g., you click a publisher and edit its generation stack (mini pipeline UI)

If you truly hate edges, option 2 still works because the mini pipeline can be list-based:
	•	PhaseClock → Wavefold → Slew → Publish

No wires. Just an ordered list.

Step G — Mapping your current editor to this (migration strategy)

You’ll implement this as a new Editor mode and migrate old patches explicitly.

Mapping rules:
	•	Each old direct connection to an input port becomes:
	•	either a Listener to an auto-created bus, OR
	•	an inline literal if it was constant-ish
	•	Existing buses remain buses
	•	Existing blocks that were only for wiring can be collapsed into “source stacks”

I would not attempt perfect automatic conversion. You want the new UI to define the new truth.

Step H — Update Inspector semantics

Inspector becomes contextual:

If a row is selected:
	•	shows the port details
	•	shows current binding (bus + lens chain)
	•	offers “bind to bus”, “edit lenses”, “clear”

If a bus column is selected:
	•	shows bus settings (combine mode, silent value, publishers list)

If a block group is selected:
	•	shows block params
	•	highlights its rows in table
	•	highlights buses it publishes to and listens from

Step I — No-jank edits in this UI are much easier

Because bindings are declarative and there is no spatial topology, edits are naturally stable:
	•	Editing a lens chain updates a single Listener record
	•	Editing a publisher updates a single Publisher record
	•	Adding a block adds rows/cols; doesn’t reflow a graph

The only “jank” vector remaining is runtime (evaluation), not layout.

⸻

The key engineering win

This UI design is basically an editor for three tables:
	1.	Blocks (instances + params)
	2.	Publishers (output→bus contributions)
	3.	Listeners (input←bus subscriptions + lens chain)

Everything else is derived.

That’s why it’s fast to implement and hard to break.

⸻

If you want the next level of concreteness, tell me which set you want first and I’ll write it as a strict spec:
	1.	Exact component tree (React components + props + store access patterns)
	2.	Exact binding controller logic (how clicks translate to ops/transactions)
	3.	Registry UI contract (how you annotate block types so rows/columns are consistent)