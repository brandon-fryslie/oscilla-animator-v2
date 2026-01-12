Compiled Program IR Contract

This is the single canonical output of the compiler. The runtime/player consumes only this, and the debugger instruments only this. No closures, no hidden JS behavior.

⸻

0) Goals and invariants

Hard invariants
	•	No “ball of closures”: runtime evaluation is dispatch over dense IR arrays.
	•	Deterministic: every bus combine order, state update, and evaluation order is fixed by IR (not object iteration).
	•	Stable identities: every observable thing has a stable NodeId/SlotId/BusIndex.
	•	Portability: IR is representable 1:1 in Rust (enums + vectors + typed buffers).
	•	Debuggable: every value can be traced back to (block, port, bus, transform chain, state cell).

⸻

1) Top-level compiled artifact

export interface CompiledProgram {
  readonly formatVersion: 1;                // bump only with intentional migrations
  readonly patchId: string;
  readonly patchRevision: number;

  readonly timeModel: TimeModel;            // authoritative time topology
  readonly tables: ProgramTables;           // all dense tables
  readonly roots: ProgramRoots;             // named entry points
  readonly debug: DebugIndex;               // optional but recommended always-on (compact)
}


⸻

2) ProgramTables (the whole executable model)

export interface ProgramTables {
  readonly graph: GraphIR;          // blocks, ports, slot wiring, bus routing
  readonly sig: SignalIR;           // SignalExpr pool + transform chains + fns + state layout
  readonly field: FieldIR;          // FieldExpr pool + materialization plan + state layout
  readonly render: RenderIR;        // render ops / render tree builders
  readonly constants: ConstantIR;   // JSON + packed numeric pools
}


⸻

3) GraphIR: blocks, ports, slots, routing

The GraphIR exists for three purposes:
	1.	Resolve inputSlot → value fast
	2.	Provide a stable mapping for debugging and UI selections
	3.	Provide compile-time structure to enforce invariants (one-writer for wires, etc.)

3.1 IDs and indices

Everything performance-critical uses dense indices. Strings exist only in DebugIndex.

export type BlockIndex = number;    // 0..B-1
export type PortIndex  = number;    // 0..P-1 within a block
export type SlotKey    = number;    // global unique slot key (dense)
export type BusIndex   = number;    // 0..N-1
export type PubIndex   = number;    // 0..K-1 within a bus

3.2 Block table

export interface GraphIR {
  readonly blocks: BlockIR[];
  readonly slots: SlotIR[];                   // global slot table (dense)
  readonly slotWires: SlotWireIR;             // direct block-to-block wires (optional)
  readonly buses: BusIR[];                    // bus definitions (types, defaults, combine)
  readonly publishers: PublisherIR[];         // flattened publishers (dense)
  readonly listeners: ListenerIR[];           // flattened listeners (dense)

  readonly blockOutputRoots: BlockOutputRootIR; // mapping: (blockIdx, outPortIdx) -> ValueRef
  readonly blockInputRoots:  BlockInputRootIR;  // mapping: (blockIdx, inPortIdx)  -> ValueRef
}

BlockIR

export interface BlockIR {
  readonly blockIdx: BlockIndex;
  readonly typeId: number;                    // interned block type name
  readonly inputPorts: PortIR[];
  readonly outputPorts: PortIR[];
  readonly compilerTag?: number;              // optional: used for feature gating / versioning
}

PortIR

Ports are indexed arrays; no string lookup in runtime.

export interface PortIR {
  readonly portIdx: PortIndex;
  readonly slotKey: SlotKey;
  readonly type: TypeDesc;
  readonly direction: "in" | "out";
}

SlotIR

A slot is the stable identity used across UI/compile/runtime.

export interface SlotIR {
  readonly slotKey: SlotKey;
  readonly ownerBlock: BlockIndex;
  readonly ownerPort: PortIndex;
  readonly type: TypeDesc;
  readonly dir: "in" | "out";
}

3.3 ValueRef: unified “where a value comes from”

Every input resolves to a ValueRef. There are only a few kinds:

export type ValueRef =
  | { k: "sig"; id: SigId }
  | { k: "field"; id: FieldId }
  | { k: "scalarConst"; constId: number }      // used rarely; prefer sig const
  | { k: "busSig"; bus: BusIndex }             // shorthand for buses resolved to sig root
  | { k: "busField"; bus: BusIndex };          // shorthand for buses resolved to field root

3.4 Slot wires

This is the direct block-to-block wiring system. You can keep it, but it must compile into ValueRef mappings and not leak UI concepts into runtime.

export interface SlotWireIR {
  // mapping input slotKey -> output slotKey
  readonly wireFromOutputSlot: Int32Array;  // index by inputSlotKey; value = outputSlotKey or -1
}

3.5 BusIR + flattened publishers/listeners

BusIR

export interface BusIR {
  readonly bus: BusIndex;
  readonly type: TypeDesc;
  readonly combine: CombineSpec;
  readonly defaultValueConstId: number;       // points into ConstantIR
  readonly reservedRole?: ReservedBusRole;    // e.g. "phaseA", "energy", "palette"
}

PublisherIR

Publishers are flattened with deterministic ordering baked in.

export interface PublisherIR {
  readonly pubIdx: number;
  readonly bus: BusIndex;

  // where it reads from (block output port)
  readonly fromBlock: BlockIndex;
  readonly fromPort: PortIndex;

  // how it transforms before contributing
  readonly transformChainId: number | null;

  // deterministic ordering
  readonly sortKey: number;
  readonly enabled: boolean;
}

ListenerIR

Listeners map a bus into a specific input port.

export interface ListenerIR {
  readonly listenerIdx: number;
  readonly bus: BusIndex;

  readonly toBlock: BlockIndex;
  readonly toPort: PortIndex;

  readonly transformChainId: number | null;
  readonly enabled: boolean;
}

3.6 Root mappings: block inputs/outputs

These are the core runtime contract: the compiler must resolve each block port to a ValueRef.

export interface BlockOutputRootIR {
  // packed: for each (blockIdx, outPortIdx) -> ValueRef
  readonly refs: ValueRefPacked[];            // dense table
  readonly indexOf: (blockIdx: BlockIndex, outPort: PortIndex) => number;
}

export interface BlockInputRootIR {
  readonly refs: ValueRefPacked[];
  readonly indexOf: (blockIdx: BlockIndex, inPort: PortIndex) => number;
}

ValueRefPacked is a compact tagged struct (good for Rust/WASM):

export type ValueRefPacked =
  | { k: 0; id: number }  // sig
  | { k: 1; id: number }  // field
  | { k: 2; id: number }  // const
  | { k: 3; id: number }  // busSig (bus index)
  | { k: 4; id: number }; // busField


⸻

4) SignalIR

This is the full SignalExpr pool and everything it needs.

export interface SignalIR {
  readonly nodes: SigNode[];                  // dense node array
  readonly types: TypeDesc[];                 // optional: parallel array for fast type checks
  readonly transformChains: TransformChain[]; // adapters/lenses compiled
  readonly pureFns: PureFnTable;              // deterministic function registry
  readonly state: StateLayout;                // explicit state buffers
}

PureFnTable

No closures. Functions are referenced by integer IDs.

export interface PureFnTable {
  readonly fns: PureFnIR[];
}

export type PureFnIR =
  | { k: "unary"; op: UnaryOp; domain: Domain }
  | { k: "binary"; op: BinaryOp; domain: Domain }
  | { k: "ternary"; op: TernaryOp; domain: Domain }
  | { k: "custom"; id: number; signature: FnSig }; // for curated builtins only

TransformChain

As previously: compact step lists, explicit state offsets if needed.

⸻

5) FieldIR

FieldExpr pool + materialization plan.

export interface FieldIR {
  readonly nodes: FieldNode[];                // dense
  readonly transformChains: TransformChain[]; // can share table with SignalIR if you want
  readonly pureFns: PureFnTable;              // same fn IDs as signal (recommended)
  readonly state: StateLayout;                // field-specific state if needed

  // materialization scheduling hints
  readonly materialization: FieldMaterializationPlan;
}

FieldMaterializationPlan

This is where you precompute the “what gets materialized, when, and why” for speed and for debugging.

export interface FieldMaterializationPlan {
  // list of materialization requests the renderer(s) require per frame
  readonly requests: FieldMaterializationRequest[];

  // optional: allow the runtime to coalesce requests
  readonly coalesceGroups: CoalesceGroup[];
}

export interface FieldMaterializationRequest {
  readonly requestId: number;
  readonly fieldId: FieldId;

  // which domain drives sizing/identity
  readonly domainSource: DomainRef;

  // desired packed format
  readonly format: PackedFieldFormat;         // e.g. f32x1, f32x2, u8x4, etc.

  // who needs it (for diagnostics)
  readonly consumer: FieldConsumerTag;        // e.g. "RenderInstances2D.radius"

  // materialization policy
  readonly policy: "perFrame" | "onDemand";   // “perFrame” for render sinks
}


⸻

6) RenderIR

This is the contract that builds RenderTree (or future command streams). Keep it structured so 3D is possible.

export interface RenderIR {
  readonly sinks: RenderSinkIR[];             // e.g. instances2d, strokes2d, meshes3d
  readonly root: RenderRootIR;                // what final output is
}

Render sinks

Example: Instances2D sink is a pure consumer of Domain + Fields + Signals.

export interface RenderSinkIR {
  readonly k: "instances2d" | "strokes2d" | "meshes3d" | "postfx";
  readonly id: number;

  readonly domain: DomainRef;
  readonly inputs: RenderInputRef[];          // refs to fields/signals
  readonly params: number;                    // constId into ConstantIR for static config
}

RenderInputRef is a typed ref to a root ValueRef plus packing requirements:

export type RenderInputRef =
  | { k: "field"; id: FieldId; format: PackedFieldFormat; consumerTag: number }
  | { k: "sig"; id: SigId; consumerTag: number };


⸻

7) ConstantIR

Single place for JSON and packed numeric constants.

export interface ConstantIR {
  readonly json: unknown[];                   // stable indices
  readonly f64: Float64Array;                 // optional pools for speed
  readonly f32: Float32Array;
  readonly i32: Int32Array;

  // mapping constId -> where to read from
  readonly constIndex: ConstIndexEntry[];
}

export type ConstIndexEntry =
  | { k: "json"; idx: number }
  | { k: "f64";  idx: number }
  | { k: "f32";  idx: number }
  | { k: "i32";  idx: number };


⸻

8) ProgramRoots (what runtime evaluates)

export interface ProgramRoots {
  // canonical outputs
  readonly renderTree: RenderRootRef;         // produced by render system

  // canonical time roots (debuggable)
  readonly time: {
    readonly absMsSig: SigId;                 // tAbsMs
    readonly modelMsSig: SigId;               // tModelMs
    readonly phase01Sig?: SigId;              // for cyclic models
    readonly wrapEventSig?: SigId;            // for cyclic models
  };

  // canonical bus roots: bus index -> SigId/FieldId for final bus value
  readonly busSigRoots: Int32Array;           // size = busCount, -1 if not signal bus
  readonly busFieldRoots: Int32Array;         // size = busCount, -1 if not field bus
}

Important: bus roots are already compiled into SigExpr/FieldExpr nodes. Runtime does not “compute buses separately”; it samples roots like any other expression.

⸻

9) DebugIndex (always available, compact)

This is the bridge from dense IR to user-facing identifiers.

export interface DebugIndex {
  readonly strings: string[];                 // intern pool

  // mapping tables
  readonly block: DebugBlockIndex[];
  readonly bus: DebugBusIndex[];
  readonly slot: DebugSlotIndex[];

  // mapping node ids -> provenance
  readonly sigNodeProvenance: DebugNodeProv[];    // parallel to SigNode[]
  readonly fieldNodeProvenance: DebugNodeProv[];  // parallel to FieldNode[]
  readonly transformProv: DebugTransformProv[];   // parallel to transformChains[]
}

Provenance provides:
	•	originating blockId/portId (string via intern)
	•	whether it came from a bus combine, transform step, stateful op
	•	stable “source path” for composites (if you keep composites opaque)

This index is what makes the power-user debugger plausible without reflection hacks.

⸻

10) Schedule semantics (when things happen)

This is the runtime contract for evaluation order. It must be deterministic and instrumentable.

Per frame evaluation order
	1.	Build SigEnv (time mapping + wrap detection)
	2.	Evaluate render sinks in deterministic sink order
	•	Each sink requests its required signals/fields
	3.	Field materialization occurs only via FieldMaterializationPlan.requests
	4.	RenderTree produced
	5.	Emit health snapshot + trace buffers (optional)

Deterministic evaluation
	•	Node-level: depends on data deps, memo-cached; order of “first touch” is determined by sink traversal order.
	•	Bus combine: publisher order is baked into terms[] at compile time using sortKey and tie-breaks.
	•	Stateful nodes: updated exactly once per frame when first evaluated; memo prevents double-advance.

Tie-break rules (required)

For any ordering that could otherwise be unstable:
	•	Primary: explicit sortKey
	•	Secondary: (fromBlockIdx, fromPortIdx) numeric
	•	Tertiary: publisher/listener stable index (pubIdx/listenerIdx)

⸻

11) The only allowed boundary: player/runtime API

The player should only need:

export interface RuntimeEngine {
  setProgram(p: CompiledProgram): void;
  renderFrame(tAbsMs: number, ctx: RuntimeCtx): RenderTree;
}

Everything else is internal.

⸻

If you want the next piece, say what you want: (A) how the compiler produces this IR (lowering passes), or (B) the exact power-user debugger instrumentation points inside this IR (ring buffers, event schemas, causal links).