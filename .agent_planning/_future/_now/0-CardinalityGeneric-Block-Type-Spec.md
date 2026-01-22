Spec: Cardinality-Generic Blocks

0. Definition

A Cardinality-Generic Block is a block whose semantic function is defined per-lane and is valid for both:
	•	one cardinality (Signal): a single lane
	•	many(instance) cardinality (Field): N lanes aligned to a specific InstanceRef

Cardinality-generic blocks are not lane-coupled and do not perform reduction or aggregation across lanes.

⸻

1. Formal Contract

For a block B with input ports In[] and output ports Out[], B is cardinality-generic iff all of the following are true:
	1.	Lane-locality (no cross-lane dependence)
For every output port o ∈ Out, for every lane index i, the value o[i] depends only on:
	•	the corresponding input lane values in_k[i] for some subset of inputs in_k ∈ In, and
	•	any Signal (cardinality one) inputs, and
	•	the block’s own per-lane state at lane i (if stateful),
and must not depend on any in_k[j] where j ≠ i.
	2.	Cardinality preservation (no change in lane count)
For each output port o, cardinality(o) == cardinality(primaryDataInput) where “primaryDataInput” is the input port(s) designated by the block’s kind. (Blocks that map Field → Signal or Signal → Field are not cardinality-generic; they are cardinality-transform blocks.)
	3.	Instance alignment preservation
If cardinality is many(instance), then every many input and many output must carry the same InstanceRef (same instanceId and domainType) after type resolution. A mismatch is a type error.
	4.	Deterministic per-lane execution
Given identical inputs, identical state, and identical time inputs, the block must produce identical outputs per lane independent of physical ordering, threading, or batching.

⸻

2. Type System Rules

Cardinality genericity is realized via the existing 5-axis type system; no new runtime concept is introduced.

2.1 Unification rule for many(instance)
When a block is applied to many, the compiler must ensure:
	•	All many operands unify to many(instance=X) with the same InstanceRef.
	•	If any input is many(instance=A) and another is many(instance=B) where A ≠ B, compilation fails with a Type Error: Instance mismatch.

2.2 Mixing one and many
Cardinality-generic blocks may accept both:
	•	Signal<T> (one) inputs, and
	•	Field<T>(I) (many) inputs,

as long as:
	•	Any Signal input is interpreted as broadcast across lanes, i.e. signal is constant for all lanes within a frame.
	•	Broadcast is an explicit IR construct (FieldExprBroadcast) or an explicit specialization in the compiler (see §4).

⸻

3. Runtime Semantics

For any cardinality-generic block B, the runtime semantics are defined by a per-lane function:
	•	Pure block (stateless):
out[i] = F(in1[i], in2[i], ..., sigA, sigB, ...)
	•	Stateful block:
state'[i], out[i] = G(state[i], in1[i], in2[i], ..., sigA, sigB, ...)

Where:
	•	i is a lane index:
	•	If cardinality is one: only i=0 exists.
	•	If cardinality is many: i ∈ [0, N) where N is the instance count.

There is no semantic difference between one and many other than the lane set cardinality.

⸻

4. Compilation Requirements

The compiler is the only component that decides scalar vs field realization. Normalization does not clone or split blocks.

4.1 Specialization: “no runtime generics”
The compiler must emit a fully specialized schedule/IR such that the runtime never branches on cardinality.

That means: each cardinality-generic block becomes either:
	•	a scalar evaluation step (operating on one lane), or
	•	a field evaluation step (operating on N lanes)

and those are distinct step kinds or distinct operand encodings in the IR.

4.2 IR expression forms
Cardinality genericity must be expressible using your existing IR split:
	•	Signal path: SigExprMap, SigExprZip, SigExprStateRead
	•	Field path: FieldExprMap, FieldExprZip, FieldExprZipSig, FieldExprBroadcast

Required compiler behavior:
	•	If an input is Signal but the block is being instantiated as Field, the compiler must represent that as either:
	•	FieldExprZipSig (field + signals), or
	•	FieldExprBroadcast(signal) followed by FieldExprZip (field + field),
with the choice being deterministic and consistent. The IR must not rely on implicit broadcasting at runtime.

4.3 Slot allocation
For cardinality-generic block outputs:
	•	If resolved cardinality is one, allocate a ScalarSlot.
	•	If resolved cardinality is many(instance I), allocate a FieldSlot sized to the instance count and payload stride.

The slot allocator must not infer cardinality at runtime.

⸻

5. Stateful Cardinality-Generic Blocks

A stateful cardinality-generic block (e.g. Slew/Lag/UnitDelay-like) requires per-lane state.

5.1 Stable State Identity
Each stateful block must have a stable StateId that survives recompilation and is derived from a stable anchor (e.g., blockId + stateful primitive identity + port/state key + instance context as needed).

The StateId identifies the conceptual state, not a storage offset.

5.2 State layout by cardinality
Given a stateful block with state payload stride S (floats per lane):
	•	If cardinality is one: state storage is a dense buffer of length S.
	•	If cardinality is many(instance I) with count N: state storage is a dense buffer of length S * N.

No sparse maps. No per-element objects.

5.3 Migration rules
On hot-swap, state migration is performed by:
	•	Matching old/new state buffers by StateId.
	•	If both sides are one, copy S.
	•	If both sides are many(instance) and the instance identity matches:
	•	Apply continuity element mapping if identity is stable.
	•	Copy/migrate per lane accordingly.
	•	If incompatible, reset and emit a diagnostic attributed to the stateful block target.

This is required to preserve edit-safety invariants.

⸻

6. What Is Not Allowed (Hard Constraints)

A block must not be declared cardinality-generic if it does any of the following:
	1.	Cross-lane coupling
Examples: blur/neighbor ops, boids/flocking, collisions, sorting, percentile, kNN, any computation where out[i] depends on in[j≠i].
	2.	Cardinality transforms
Any block that maps Signal → Field, Field → Signal, Field(I) → Field(J) (instance relabeling), or changes lane count.
	3.	Instance synthesis or mutation
Any block that creates, destroys, reorders, compacts, filters, or permutes lanes as part of its semantics (unless it is explicitly a cardinality/instance transform block with dedicated semantics and diagnostics).

⸻

7. Diagnostics (Required)

The compiler must produce explicit errors when cardinality-generic requirements are violated, including:
	•	CARDINALITY_MISMATCH
Block output cardinality does not match required preserved cardinality.
	•	INSTANCE_MISMATCH
Two many inputs unify to different InstanceRefs.
	•	LANE_COUPLED_BLOCK_DISALLOWED
Block kind is declared generic but marked as lane-coupled in its registry metadata (see §8).
	•	IMPLICIT_BROADCAST_DISALLOWED
A Signal was consumed in a Field context without an explicit IR broadcast/zipSig form.

Diagnostics must include TargetRef attribution to the block and the specific ports involved.

⸻

8. Registry Metadata (Required for Crispness)

Each block kind must declare, in a table-driven registry used by the compiler:
	•	cardinalityMode:
	•	'preserve' (cardinality-generic)
	•	'transform' (explicitly changes cardinality)
	•	'signalOnly'
	•	'fieldOnly'
	•	laneCoupling:
	•	'laneLocal' (eligible for cardinality-generic)
	•	'laneCoupled' (ineligible)
	•	broadcastPolicy:
	•	'allowZipSig' (signals may be consumed alongside fields via zipSig)
	•	'requireBroadcastExpr' (compiler must materialize broadcasts explicitly)
	•	'disallowSignalMix' (only all-field or all-signal instantiations)

This metadata is compile-time only and does not exist at runtime.

⸻

9. Performance Requirements

For a cardinality-generic block instantiated as many(instance I):
	•	Execution must compile to a tight loop over lanes with stride determined solely by payload and state layout.
	•	No per-lane dynamic dispatch, no string lookups, no per-lane allocations.
	•	State and outputs must be dense typed arrays.

⸻

10. Minimal Examples

10.1 Stateless: Add
	•	Add: (T, T) -> T lane-local.
	•	Valid instantiations:
	•	Signal<float> + Signal<float> -> Signal<float>
	•	Field<float>(I) + Field<float>(I) -> Field<float>(I)
	•	Field<float>(I) + Signal<float> -> Field<float>(I) (via zipSig or broadcast)

10.2 Stateful: Slew
	•	Slew: (x, tauMs) -> y with internal state y_prev.
	•	Valid instantiations:
	•	Signal<float> -> Signal<float> state size 1
	•	Field<float>(I) -> Field<float>(I) state size N(I)

No separate “FieldSlew” block exists.

⸻

This is the complete nuts-and-bolts contract: cardinality-generic is a compile-time specialization + lane-local semantics + instance alignment + dense state, with explicit registry metadata to prevent drift.