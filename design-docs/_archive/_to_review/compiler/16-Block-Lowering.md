B) Block compiler lowering contract (no-closures, Rust-portable)

This is the exact contract every block compiler must implement. It ensures:
	•	no “giant ball of closures”
	•	debuggable (every intermediate has identity + provenance)
	•	fast (dense indices, memoizable evaluation)
	•	portable (JS interpreter today, Rust/WASM later)

I’m specifying:
	1.	the compiler-facing types (TS)
	2.	the allowed emissions (what a block can create)
	3.	state + time semantics
	4.	field/signal output semantics
	5.	invariants and compile-time enforcement

⸻

1) Canonical block definition

export type BlockCapability = 'time' | 'identity' | 'state' | 'render' | 'io' | 'pure';

export interface BlockPortDecl {
  readonly portId: string;          // stable within block type
  readonly label: string;
  readonly dir: 'in' | 'out';
  readonly type: TypeDesc;          // canonical TypeDesc (no SlotType here)
  readonly optional?: boolean;      // if true, DefaultSource will attach automatically
}

export interface BlockTypeDecl {
  readonly type: string;            // e.g. "Add", "GridDomain", "RenderInstances2D"
  readonly capability: BlockCapability;
  readonly inputs: readonly BlockPortDecl[];
  readonly outputs: readonly BlockPortDecl[];

  /**
   * Static guarantees this block provides to the graph validator.
   * If false, this block is combinational and cannot break feedback cycles.
   */
  readonly breaksCombinationalCycle?: boolean;

  /**
   * Whether this block may allocate persistent state slots.
   * (Usually implied by capability === 'state', but explicit is better.)
   */
  readonly usesState?: boolean;

  /**
   * Lowering hook: compile an instance to IR fragments.
   */
  readonly lower: BlockLowerFn;
}


⸻

2) The lowering function signature

Key idea

A block compiler is a pure lowering function that:
	•	takes resolved inputs as ValueRefs
	•	emits node IDs into shared program tables
	•	never returns closures
	•	never reads runtime state
	•	never mutates global registries

export type BlockIndex = number;
export type PortIndex = number;

export type SigId = number;
export type FieldId = number;
export type RenderSinkId = number;

export type ValueRefPacked =
  | { k: 'sig', id: SigId }
  | { k: 'field', id: FieldId }
  | { k: 'scalarConst', constId: number }   // compile-time constants only
  | { k: 'special', tag: string, id: number }; // Domain, RenderTree, etc (explicit)

export interface LowerCtx {
  readonly blockIdx: BlockIndex;
  readonly blockType: string;

  /** For provenance/debug */
  readonly instanceId: string;  // the editor blockId (string) captured for DebugIndex only
  readonly label?: string;

  /** Canonical type info for each port index (fully resolved) */
  readonly inTypes: readonly TypeDesc[];
  readonly outTypes: readonly TypeDesc[];

  /** Constant pools and node tables are managed through the builder */
  readonly b: IRBuilder;

  /** Deterministic compile inputs */
  readonly seedConstId: number;  // reference into ConstantIR
}

export type BlockLowerFn = (args: {
  ctx: LowerCtx;

  /** Inputs resolved by the compiler (wire/bus/defaultsource already decided) */
  inputs: readonly ValueRefPacked[];

  /**
   * Instance config. If you’re killing “params”, this will be empty or minimal.
   * Anything user-adjustable must be provided via DefaultSource inputs instead.
   */
  config?: unknown;
}) => LowerResult;


⸻

3) What a block is allowed to emit

Rule: outputs are declared by port index

Lowering returns exactly one ValueRef per output port index, matching the block type declaration.

export interface LowerResult {
  /** Must have length === outputs.length */
  readonly outputs: readonly ValueRefPacked[];

  /**
   * Optional declarations for things that need graph-level validation.
   * (Primarily for time/identity/render blocks.)
   */
  readonly declares?: BlockDeclarations;
}

export interface BlockDeclarations {
  /**
   * For time blocks: declares which canonical time signals it provides.
   * TimeRoot must declare exactly the required set for its TimeModel kind.
   */
  readonly timeModel?: TimeModel;

  /**
   * For identity blocks: declares the Domain root they produce
   * (Domain is treated as a special typed root, not a Field).
   */
  readonly domainOut?: { outPortIndex: number; domainKind: 'domain' };

  /**
   * For render blocks: declares RenderSink nodes (see RenderIR pass).
   */
  readonly renderSink?: { sinkId: RenderSinkId };
}

A block can emit:
	•	SigId nodes into SignalIR
	•	FieldId nodes into FieldIR
	•	scalarConst references (compile-time constants only)
	•	special nodes for Domain, RenderTree, etc (explicitly tagged)

It cannot emit:
	•	arbitrary JS functions
	•	closures capturing block-local state
	•	implicit “evaluate me later” callbacks (all laziness must be represented as nodes)

⸻

4) IRBuilder: the only way to allocate nodes

Blocks do not “construct IR objects directly”. They call builder methods that:
	•	enforce types
	•	intern constants
	•	attach provenance
	•	keep tables dense
	•	prevent illegal cross-world mixes at compile time

export interface IRBuilder {
  // ----- constants -----
  constF64(v: number, prov?: Prov): number;
  constI32(v: number, prov?: Prov): number;
  constJSON(v: unknown, prov?: Prov): number;

  // ----- signal nodes -----
  sigConst(type: TypeDesc, constId: number, prov?: Prov): SigId;

  sigOp(op: SigOp, args: readonly SigId[], outType: TypeDesc, prov?: Prov): SigId;

  sigCombine(
    mode: BusCombineMode,
    terms: readonly SigId[],
    outType: TypeDesc,
    prov?: Prov
  ): SigId;

  sigStateful(
    op: SigStateOp,
    args: readonly SigId[],
    outType: TypeDesc,
    state: StateAlloc,
    prov?: Prov
  ): SigId;

  // ----- field nodes (lazy by construction) -----
  fieldConst(type: TypeDesc, constId: number, prov?: Prov): FieldId;

  fieldOp(op: FieldOp, args: readonly FieldId[], outType: TypeDesc, prov?: Prov): FieldId;

  fieldZip(
    op: FieldZipOp,
    a: FieldId,
    b: FieldId,
    outType: TypeDesc,
    prov?: Prov
  ): FieldId;

  fieldCombine(
    mode: BusCombineMode,
    terms: readonly FieldId[],
    outType: TypeDesc,
    prov?: Prov
  ): FieldId;

  /**
   * Bridge ops must be explicit (no implicit broadcast/reduce).
   * This makes world transitions visible and optimizable.
   */
  broadcastSigToField(sig: SigId, domainRef: ValueRefPacked, outType: TypeDesc, prov?: Prov): FieldId;
  reduceFieldToSig(field: FieldId, reducer: FieldReduceOp, outType: TypeDesc, prov?: Prov): SigId;

  // ----- special nodes -----
  domainFromN(nSig: SigId, prov?: Prov): number; // returns DomainId (stored in special table)
  domainPositions(domainId: number, positions: FieldId, prov?: Prov): number;

  renderSink(def: RenderSinkDef, prov?: Prov): RenderSinkId;

  // ----- transform chains (adapters/lenses) -----
  transformChain(steps: readonly TransformStepIR[], prov?: Prov): number;
  applyTransformToSig(sig: SigId, chainId: number, outType: TypeDesc, prov?: Prov): SigId;
  applyTransformToField(field: FieldId, chainId: number, outType: TypeDesc, prov?: Prov): FieldId;

  // ----- state allocation -----
  allocState(layout: StateLayout, prov?: Prov): StateAlloc;
}

export interface Prov {
  readonly blockIdx: number;
  readonly portIndex?: number;
  readonly label?: string;
  readonly kind?: 'block' | 'bus' | 'lens' | 'adapter' | 'defaultSource';
}

Compile-time enforcement mechanism: make IRBuilder generic on TypeDesc world/domain so illegal mixes simply don’t type-check (or throw during compilation if you don’t want complex TS types). The builder is the choke point.

⸻

5) Signal vs Field: hard rules

5.1 No implicit world switching

A signal cannot be used where a field is required, and vice versa, except through explicit bridge ops:
	•	broadcastSigToField
	•	reduceFieldToSig

This is what makes:
	•	evaluation order predictable
	•	performance tunable
	•	debug traces meaningful

5.2 Lazy Field is automatic

A FieldId is always a node in FieldIR. It does not “materialize” unless a render sink (or explicit export) requests it.

So “go full lazy immediately” is achieved by design: fields are graphs, not arrays.

⸻

6) State blocks: explicit state layout

A “stateful” node must allocate state via the builder, so:
	•	the runtime can place it in a typed state buffer
	•	hot swap can preserve it (by stable state slot identity)
	•	Rust port is straightforward

export interface StateLayout {
  readonly slots: readonly {
    readonly name: string;
    readonly type: 'f32' | 'f64' | 'i32' | 'u32' | 'vec2f32' | 'vec4f32' | 'bytes';
    readonly count: number;  // fixed; no dynamic allocation inside state
  }[];
}

export interface StateAlloc {
  readonly stateId: number;       // stable within compiled program
  readonly layoutHash: string;    // for swap compatibility checks
}

export type SigStateOp =
  | 'integrate'
  | 'delayMs'
  | 'sampleHold'
  | 'slew'
  | 'envelopeAD'
  | 'pulseDivider'
  | 'triggerOnWrap';

No closures with hidden memory. If it has memory, it declares state.

⸻

7) Pure/operator blocks: normalization contract

“Add”, “mul”, “sin”, “clamp”, “mix”, “phaseMath”, etc. are capability: ‘pure’ and must satisfy:
	•	emits only sigOp, fieldOp, fieldZip, sigConst, fieldConst, and explicit bridge ops
	•	may not allocate state
	•	may not create domain
	•	may not create render sinks
	•	may not do IO

This is enforceable at compile time by restricting what builder methods are available when capability==='pure' (builder sub-interface).

⸻

8) Render blocks: materialization is declared, not implied

Render blocks must produce renderSink(def) and wire in references to:
	•	DomainId
	•	required fields/signals
	•	packing formats

They do not “pull arrays” inside block compilers.

That keeps materialization centralized and optimizable.

⸻

9) Default Sources are just blocks (but compiled specially)

A Default Source is a block type whose lowering:
	•	emits a sigConst or fieldConst
	•	attaches provenance kind 'defaultSource'
	•	uses constId that can be edited through UI (knob, slider, etc.)

Because Default Sources are blocks, they naturally:
	•	participate in undo/redo ops
	•	appear in DebugIndex even if invisible in main UI
	•	can be swapped out by wiring a real source

⸻

10) Hard invariants the compiler asserts

These are “panic-level” invariants during compilation:
	1.	outputs.length === declaredOutputs.length
	2.	every ValueRefPacked returned matches the declared TypeDesc for that output
	3.	no block uses builder methods disallowed for its capability
	4.	no node references unknown ids
	5.	all bridge ops require explicit domain refs (broadcast needs a domain)
	6.	any state allocation must be declared compatible with the block’s capability and registry

If any of these fail: it’s a compiler bug, not a user error.

⸻

11) Why this beats closures (and makes Rust easy)

With this contract:
	•	JS runtime is a fast interpreter over Vec<Node>
	•	Debugger instruments node eval boundaries
	•	Snapshots are “values of node ids”, not ad-hoc captures
	•	Rust port is just rewriting the interpreter, not the compiler semantics

No hand-waving: the compiler emits a data structure, not executable JS.

⸻

If you say Next, I’ll give you C) runtime scheduling semantics: the exact per-frame evaluation algorithm (signals, lazy fields, caches, materialization plan, and how “no-jank hot swap” preserves state + caches safely).