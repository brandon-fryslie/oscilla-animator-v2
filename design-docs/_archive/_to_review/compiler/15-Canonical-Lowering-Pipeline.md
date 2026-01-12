
A) Compiler → IR: canonical lowering pipeline

This is the one true compilation path: any UI (lanes, table, navigator) produces a Patch; the compiler produces a CompiledProgram (the dense IR). The runtime consumes only IR.

I’m going to describe this as a sequence of deterministic passes with inputs/outputs, invariants, and failure modes, so an engineer can implement it without inventing “extra semantics”.

⸻

0) Inputs and compiler products

Compiler inputs
	•	Patch (editor model): blocks, connections, buses/publishers/listeners, default-sources, settings.
	•	BlockRegistry: for each block type:
	•	port declarations (types)
	•	compiler definition (lowering to IR operators)
	•	“capability” (time/identity/state/render/io/pure) and constraints
	•	Adapter/Lens registry: canonical transform steps + type conversion paths
	•	Reserved bus roles spec: phaseA/pulse/energy/palette etc. (constraints + auto bindings)

Compiler outputs
	•	CompiledProgram as specified in prior message:
	•	timeModel
	•	ProgramTables (GraphIR + SignalIR + FieldIR + RenderIR + Constants)
	•	ProgramRoots
	•	DebugIndex

⸻

1) Pass list (in order)

Pass 1 — Normalize Patch (structural sanitation)

Goal: make patch structurally well-formed before semantics.

Input: raw Patch
Output: NormalizedPatch

Actions:
	1.	Freeze ID maps
	•	Map blockId -> BlockIndex
	•	Map (blockId, slotId) -> SlotKey
	•	Map busId -> BusIndex
	•	Allocate dense indices now (everything after uses indices, not strings).
	2.	Ensure Default Sources exist
	•	For each input slot: if no wire AND no bus listener, attach a default source binding (your “Default Source” system).
	•	This turns “missing inputs” into explicit value sources, which is critical for determinism and avoiding half-compiled states.
	3.	Canonicalize publishers/listeners
	•	Drop disabled bindings from “active set” (but keep in DebugIndex for UI display).
	•	Validate no duplicate binding IDs, etc.

Errors produced here:
	•	InvalidId, DanglingSlotRef, DanglingBusRef, SchemaCorrupt

⸻

Pass 2 — Type Graph Construction (editor types → canonical TypeDesc)

Goal: establish types for every slot and bus in a unified, compiler-authoritative way.

Input: NormalizedPatch
Output: TypedPatch

Actions:
	1.	Convert every slot’s SlotType into TypeDesc using your mapping (or eliminate SlotType entirely long-term and store TypeDesc directly).
	2.	Validate bus type eligibility:
	•	bus.type.busEligible === true
	•	reserved bus roles enforce domain/world constraints
	3.	Precompute compatibility:
	•	direct assignable
	•	convertible via adapter/lens chain (using canonical registry)

Errors:
	•	PortTypeUnknown, BusIneligibleType, ReservedBusTypeViolation, NoConversionPath

⸻

Pass 3 — Time Topology Inference & Lock-in

Goal: produce the authoritative TimeModel and the canonical time signals that everything else uses.

Input: TypedPatch
Output: TimeResolvedPatch + TimePlan

Actions:
	1.	Find the single TimeRoot (by capability: time).
	2.	Validate TimeRoot constraints (exactly one, no illegal upstream deps if you enforce).
	3.	Generate canonical time outputs as Signal nodes:
	•	tAbsMs (input to runtime, treated as implicit signal)
	•	tModelMs (after time-model mapping, if any)
	•	phase01 (cyclic only)
	•	wrapEvent (cyclic only)
	4.	Produce the TimeModel record:
	•	finite: durationMs, cuePoints
	•	cyclic: periodMs, mode(loop/pingpong), etc.
	•	infinite: windowMs, etc.

Key rule: after this pass, there is no concept of “player loop mode” as logic; it is an interpretation of TimeModel. Runtime just feeds tAbsMs and uses the model mapping.

Errors:
	•	MissingTimeRoot, MultipleTimeRoots, TimeRootViolation

⸻

Pass 4 — Dependency Graph Build (blocks + buses unified)

Goal: build a single dependency graph that can be topologically scheduled and cycle-validated.

Input: TimeResolvedPatch
Output: DepGraph

Nodes:
	•	BlockEval(blockIdx) — evaluates the block’s outputs as expressions
	•	BusValue(busIdx) — represents the combined bus value (root expressions)

Edges:
	•	Wire: fromBlock -> toBlock
	•	Publisher: fromBlock -> busValue
	•	Listener: busValue -> toBlock
	•	Time: TimeRoot -> everyone who reads time (can be implicit)

Important: this graph is for scheduling & cycle validation, not necessarily how evaluation happens at runtime (runtime is demand-driven + memo). But you need a stable compile order to allocate IR nodes deterministically.

Errors:
	•	DanglingConnection, DanglingBindingEndpoint

⸻

Pass 5 — SCC / Cycle Validation (with state boundary rules)

Goal: ensure feedback is legal under your memory semantics.

Input: DepGraph
Output: AcyclicOrLegalGraph

Actions:
	1.	Run SCC detection on DepGraph.
	2.	For each SCC:
	•	If size==1 and no self-loop edge → ok
	•	Else require at least one “state boundary” edge in the cycle:
	•	edge passes through a block with capability state and a declared “breaks combinational cycle” property.

This pass should not guess. The block registry declares whether it breaks cycles.

Errors:
	•	IllegalCycle, CycleWithoutStateBoundary

⸻

Pass 6 — Lowering: Block compilers emit Expr fragments (no closures)

Goal: turn each block into typed expression nodes (SignalExpr / FieldExpr / RenderIR fragments), referencing inputs via ValueRefs.

Input: AcyclicOrLegalGraph
Output: UnlinkedIRFragments

Mechanics:
	•	Iterate blocks in a deterministic schedule:
	•	Topological order of DepGraph nodes (with stable tie-breaks)
	•	For each blockIdx:
	1.	Resolve each input port to a ValueRef:
	•	If wired: ValueRef of upstream output
	•	Else if bus listener exists: ValueRef of busSig(busIdx) or busField(busIdx)
	•	Else: default source output ValueRef
	2.	Call the block’s compiler definition with indices, not IDs, and it returns:
	•	A set of output definitions expressed as SigId / FieldId / RenderSinkIR additions
	•	Optional state allocations (declared)
	•	Optional constant allocations

Block compiler contract (important):
	•	It must be pure with respect to compilation:
	•	may allocate nodes and constants
	•	may not capture JS closures
	•	may not consult global mutable state
	•	Any time randomness/seed is required, it is expressed as:
	•	a seed constant and deterministic PRNG op in IR, or
	•	a deterministic hash op that uses (seed, elementId, time).

Errors:
	•	BlockCompilerMissing, BlockCompilerInvariantViolation, BadStateDeclaration

⸻

Pass 7 — Lowering: Buses become explicit combine nodes

Goal: compile each BusValue(busIdx) into a root expression (SigId or FieldId) with deterministic publisher ordering + transform chains.

Input: UnlinkedIRFragments + publishers/listeners
Output: IRWithBusRoots

For each bus:
	1.	Collect active publishers targeting the bus.
	2.	Sort publishers by:
	•	pub.sortKey
	•	tie-break: (fromBlockIdx, fromPortIdx)
	•	tie-break: pubIdx
	3.	For each publisher:
	•	Get its upstream ValueRef (must resolve to correct world/domain or convertible).
	•	Apply its transformChainId (compiled as TransformChain[] entries referenced by id).
	4.	Combine:
	•	If no publishers → use bus.defaultValue (as const Signal/Field)
	•	Else build a Combine node:
	•	Signal combine: SigNode = {k:"combine", mode, terms:[SigId...] }
	•	Field combine: FieldNode = {k:"combine", mode, terms:[FieldId...] }

The combine node is what the debugger will instrument later.

Errors:
	•	PublisherTypeMismatch, PublisherConversionMissing, BusCombineModeInvalidForType

⸻

Pass 8 — Link: resolve all ValueRefs to concrete node IDs

Goal: finalize BlockInputRootIR and BlockOutputRootIR tables and ensure every port has a concrete value.

Input: IRWithBusRoots
Output: LinkedGraphIR

Actions:
	•	For every block input port: set BlockInputRootIR entry to the resolved ValueRefPacked.
	•	For every block output port: set BlockOutputRootIR entry to the produced node id.
	•	Validate “no missing roots”.

This is the pass where editor/compiler type divergence dies: the runtime contract is entirely indices + ValueRefPacked.

Errors:
	•	UnresolvedPort, InternalLinkError

⸻

Pass 9 — Render lowering & sink planning

Goal: define render sinks and compute the field materialization plan.

Input: LinkedGraphIR + FieldIR/SignalIR
Output: RenderIR + FieldMaterializationPlan

Actions:
	1.	Identify render sink blocks (capability render) and compile them into RenderSinkIR entries.
	2.	Each sink declares what it needs per frame:
	•	which fields (and packing formats)
	•	which signals
	•	which domain drives element count
	3.	Build FieldMaterializationPlan.requests:
	•	One request per (sink input field) plus any intermediate packing needed.
	4.	Optional coalescing:
	•	Group requests that can share a single materialization pass (same domain + same field)
	•	Precompute coalesceGroups

Errors:
	•	MissingRenderRoot, MultipleRenderRoots, RenderInputTypeViolation

⸻

Pass 10 — Constants packing

Goal: pack constants into ConstantIR pools for stable indices and Rust/WASM friendliness.

Input: constants gathered during lowering
Output: ConstantIR

Rules:
	•	Use numeric pools wherever possible (f32/f64/i32).
	•	JSON constants reserved for structured values (e.g. complex configs, enumerations).
	•	All constants referenced by stable constId.

⸻

Pass 11 — DebugIndex generation (always-on, compact)

Goal: map dense indices back to human-meaningful “who/where” without reflection.

Output: DebugIndex

Actions:
	•	Intern all strings (blockId, block type names, port labels, bus names, etc.)
	•	Create provenance arrays:
	•	sigNodeProvenance[sigId]
	•	fieldNodeProvenance[fieldId]
	•	transformProv[chainId]
	•	Include composite expansion path info if you keep composites opaque:
	•	“this node is inside composite X at port Y”.

This will become the backbone of the power-user debugger and also non-tech “why is it broken” UI.

⸻

2) Determinism rules the compiler must enforce

These are non-negotiable if you want stable debugging, stable exports, and Rust portability.
	1.	Stable ordering everywhere
	•	topo order uses fixed tie-breaks (blockIdx)
	•	publishers sorted with explicit tie-break chain
	•	listeners likewise if needed for resolution
	2.	No implicit randomness
	•	all randomness is IR ops seeded by explicit constants and stable ids
	3.	No hidden parameter state
	•	if “parameters are removed”, every configurable value is expressed as a Default Source block or a constant node referenced by it
	4.	All evaluation is driven by roots
	•	runtime does not “scan blocks”; it evaluates render sinks which pull nodes

⸻

3) What changes if you later port to Rust?

Nothing in semantics—only execution.
	•	Each IR table becomes Vec<EnumNode> + typed buffers.
	•	Transform chains become Vec<Step>; steps are opcodes + const references.
	•	Evaluation becomes a memoized interpreter (or a JIT later), but the program representation stays identical.

This is why you want this pipeline now: it makes JS runtime just one backend.

⸻

If you say “Next”, I’ll give you the exact lowering contract for block compilers (the interfaces and what a block is allowed to emit, including state layout and transform-chain emission) — that’s the piece engineers usually screw up and accidentally reintroduce closures.