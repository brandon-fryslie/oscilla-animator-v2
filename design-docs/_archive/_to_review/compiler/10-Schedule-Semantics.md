
12) Schedule semantics (the most important part)

12.1 Schedule IR

export interface ScheduleIR {
  steps: StepIR[];
  stepIdToIndex: Record<StepId, number>;

  // Dependency info for hot-swap and invalidation
  deps: DependencyIndexIR;

  // Determinism contract
  determinism: DeterminismIR;

  // Caching policies
  caching: CachingIR;
}

export type StepIR =
  | StepTimeDerive
  | StepNodeEval
  | StepBusEval
  | StepMaterialize
  | StepRenderAssemble
  | StepDebugProbe; // optional, enabled via UI

export interface StepBase {
  id: StepId;
  kind: string;
  label?: string; // for debug UI
}

12.2 Step kinds and rules

Step 1: Time derivation

export interface StepTimeDerive extends StepBase {
  kind: "timeDerive";

  // Inputs
  tAbsMsSlot: ValueSlot;    // provided by runtime driver
  timeModel: TimeModelIR;

  // Outputs: derived signals placed in well-known slots
  out: {
    tModelMs: ValueSlot;    // time seen by patch model
    phase01?: ValueSlot;
    wrapEvent?: ValueSlot;
    progress01?: ValueSlot;
  };
}

Semantics
	•	Runtime sets tAbsMsSlot each frame.
	•	Step computes derived time signals.
	•	No other step may write these slots.

⸻

Step 2: Node evaluation

export interface StepNodeEval extends StepBase {
  kind: "nodeEval";
  nodeIndex: NodeIndex;

  // To keep runtime hot: inputs already reference slots/buses/defaults.
  inputSlots: ValueSlot[];      // resolved in compile
  outputSlots: ValueSlot[];     // resolved in compile

  // State access (optional)
  stateReads?: StateId[];
  stateWrites?: StateId[];

  // Scheduling constraints
  phase: "preBus" | "postBus" | "render"; // determines order relative to bus eval
}

Semantics
	•	NodeEval reads required input slots (including bus slots) and writes outputs.
	•	Nodes never directly read other nodes by id—only by slots.

⸻

Step 3: Bus evaluation

export interface StepBusEval extends StepBase {
  kind: "busEval";
  busIndex: BusIndex;

  // Bus combine writes exactly one slot (the bus slot).
  outSlot: ValueSlot;

  // Publisher sources are value slots, with transform chain refs
  publishers: Array<{
    enabled: boolean;
    sortKey: number;
    srcSlot: ValueSlot;
    transform?: TransformChainRef;
    publisherId: string;
  }>;

  combine: CombineSpec;
  silent: SilentValueSpec;

  // Bus world determines evaluation mode
  busType: TypeDesc;  // world: signal|field etc
}

Semantics
	•	Publishers are processed in deterministic order:
	1.	sortKey ascending
	2.	tie-break publisherId lexicographically
	•	For each enabled publisher:
	•	read srcSlot value
	•	apply transform chain (adapters/lenses)
	•	produce a term
	•	Combine terms:
	•	signal buses: combine to a signal plan/value
	•	field buses: combine to a FieldExpr (busCombine)
	•	If zero enabled publishers: write silent value.
	•	Write result to outSlot.

⸻

Step 4: Field materialization

export interface StepMaterialize extends StepBase {
  kind: "materialize";
  materialization: MaterializationIR;
}

Semantics
	•	Evaluates FieldExpr for a specific Domain.
	•	Produces a buffer handle into outBufferSlot.
	•	Must respect cache policy.

⸻

Step 5: Render assembly

export interface StepRenderAssemble extends StepBase {
  kind: "renderAssemble";
  rootNodeIndex: NodeIndex;
  outSlot: ValueSlot;
}

Semantics
	•	Typically trivial: the render node already wrote a RenderTree/RenderCmds to its output slot.
	•	This step exists so you have a single stable “finalization” boundary for hot-swap + tracing.

⸻

Step 6: Debug probes (optional)

These steps are inserted/removed without recompiling semantic nodes, or compiled in but disabled via flags.

export interface StepDebugProbe extends StepBase {
  kind: "debugProbe";
  probe: DebugProbeIR;
}


⸻

12.3 Global scheduling rules (non-negotiable)
	1.	Exactly one timeDerive step per frame, first.
	2.	Nodes and buses are scheduled in phases:
	•	preBus: nodes that publish to buses (or produce values for them)
	•	busEval: all buses that are read later
	•	postBus: nodes that consume bus values
	•	render: render nodes (may cause materializations)
	3.	A node that depends on a bus must be scheduled after that bus’ StepBusEval.
	4.	A bus’ StepBusEval must be scheduled after all publisher source slots are produced.
	5.	Materialize steps occur only when needed, and always before the render op that consumes the buffer.
	6.	State ops define frame-to-frame dependencies. The scheduler must:
	•	keep state reads/writes coherent
	•	prevent illegal cycles unless crossing an allowed state boundary (your TimeRoot/state rules)

⸻

13) Dependency index (for hot swap, caching, and debugger)

export interface DependencyIndexIR {
  // Slot producers
  slotProducerStep: Record<ValueSlot, StepId>;

  // Slot consumers
  slotConsumers: Record<ValueSlot, StepId[]>;

  // Bus dependencies
  busDependsOnSlots: Record<BusIndex, ValueSlot[]>;
  busProvidesSlot: Record<BusIndex, ValueSlot>;

  // Field expression dependencies (optional; can be derived)
  exprDependsOnExpr?: Record<ExprId, ExprId[]>;
  exprDependsOnSlots?: Record<ExprId, ValueSlot[]>;
}


⸻

14) Determinism contract

export interface DeterminismIR {
  // Specifies what is allowed to affect ordering and results.
  allowedOrderingInputs: Array<
    | { kind: "busPublisherSortKey" }
    | { kind: "publisherIdTieBreak" }
    | { kind: "topoStableNodeIdTieBreak" }
  >;

  // Defines stable tie-breakers for any topological sort
  topoTieBreak: "nodeIdLex" | "nodeIndex";
}

Required rule: topo sorts must be stable and explicitly tie-broken. No incidental array order.

⸻