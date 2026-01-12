Pick 1: Block lowering. Allocate a ValueSlot for every node output (including FieldExpr handles) when you lower nodes, not when you build the schedule.

Why (in your architecture’s terms)
•	Single source of truth: Your IR already says OutputPortIR.slot: ValueSlot and “every output port maps to exactly one ValueSlot.” If you defer slot creation to scheduling, you’ve broken that contract and created a second, implicit allocation phase.
•	Stable hot-swap + caching: Slots are part of identity. If a FieldExpr output sometimes gets a slot only when a particular sink references it, you’ll get slot churn across compiles and lose cache persistence / state transfer / diff friendliness.
•	Instrumentation + debug: Tracing wants “this node wrote slot X” regardless of who consumed it. If slots appear only because a sink asked for them, your causal graph becomes consumption-dependent.
•	Scheduling should be pure ordering: Schedule’s job is to order already-wired, already-addressable steps. Not to invent storage.

The canonical rule
•	Lowering allocates all output slots.
•	Inputs reference slots (or bus/const/defaultSource) and optional transforms.
•	Schedule builder never allocates slots for node outputs. It may allocate temporary slots only for:
•	materialization buffers (outRSlot/outGSlot/..., outCmdsSlot/outParamsSlot)
•	(optionally) transform results if you choose “materialize transform” as a step (but that’s still a step output, so it should have a slot too, and be represented as its own node/step).

What schedule builder can allocate
•	Buffer slots for StepMaterializeColor/Path
•	The RenderFrameIR output slot
•	Any explicit “scratch” slots only if they are part of a step output (i.e., named, stable step ids + stable slot assignment strategy). If it’s truly ephemeral, don’t store it in ValueStore at all—keep it on the stack within step execution.

Concrete implementation contract

Node lowering phase
•	For each node output port:
•	allocate ValueSlot
•	emit OutputPortIR { name, type, slot }
•	During execution of StepNodeEval, the node writes:
•	for scalars: scalar value
•	for signals: SignalPlan handle
•	for fields: { kind:"fieldExpr", exprId }

Schedule building phase
•	Read ValueSlots from NodeIR.outputs[] and InputPortIR.src.kind:"slot"
•	Add StepMaterialize* when a sink needs buffers
•	Allocate only buffer slots (and frame slot)

That keeps you deterministic, diffable, and Rust/WASM-ready.

If you want a one-liner: slots belong to value identity; scheduling belongs to time/order.