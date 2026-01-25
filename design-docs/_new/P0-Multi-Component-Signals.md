Canonical Spec: Multi-Component Signal Support via Strided Value Slots

Status: Canonical (authoritative)
Goal: Support vec2, vec3, color (and any future multi-component payload) for signals without changing SignalEvaluator’s scalar contract, without array returns, and without side-effect “pack kernels”.
Non-goals: Field buffers, renderer formats, UI, adapters, or naming work.

⸻

1) Core Invariant

1.1 Signal evaluation stays scalar

SignalEvaluator.evaluateSignal(sigId) -> number remains unchanged and always returns one scalar.

No evaluateSignalMulti, no array caching, no “strideMap keyed by SigExprId”.

1.2 Multi-component signal values live in Value Slots, not in SigExprs

A multi-component signal value is represented as:
•	a base slot slotBase
•	a stride S (2 for vec2, 3 for vec3, 4 for color)

The value occupies contiguous storage:

values.f64[slotBase + 0 .. slotBase + (S-1)]

This matches how fields already treat stride in buffers.

⸻

2) Data Model: Output Values in Lowering

Every lowered output must carry:
•	slot: ValueSlot (base slot)
•	stride: number (from payload, e.g. vec2→2)
•	a kind-specific producer:

2.1 Signal outputs

Signal outputs are produced in exactly one of two ways:

(A) stride = 1
•	Provide id: SigExprId (a scalar expression)

(B) stride > 1
•	Provide components: SigExprId[] with components.length === stride
•	No single SigExprId represents the whole value

The runtime writes those component expressions into the output slot range.

2.2 Field outputs (unchanged)

Field outputs remain:
•	id: FieldExprId
•	stride already used for buffer shape

⸻

3) IR Requirements

3.1 Schedule step: strided signal write

Add a schedule op that writes one or more scalar signals into contiguous slots:

IR node (conceptual):
•	StepSlotWriteStrided { slotBase: ValueSlot, inputs: SigExprId[] }

Constraints:
•	inputs.length >= 1
•	inputs.length must equal the output stride for that value
•	Writes happen in the same phase you currently materialize signal outputs (the existing “slot write” phase)

3.2 Optional helper: slot component read as SigExpr

If downstream signal blocks need to read components from a previously written multi-component slot, you need a scalar expression node that reads a slot index:

You already have SigExpr.kind === 'slot' reading state.values.f64[expr.slot].

That is sufficient if lowering can reference slotBase + componentIndex deterministically.

No new SigExpr kinds are required.

⸻

4) IRBuilder API Changes

4.1 Strided slot allocation

Change:
•	allocSlot(): ValueSlot

to:
•	allocSlot(stride: number = 1): ValueSlot

Contract:
•	Returns a base slot index for a contiguous region of length stride
•	Slot allocator increments by stride

4.2 Emitting strided writes

Add an IRBuilder method:
•	stepSlotWriteStrided(slotBase: ValueSlot, inputs: SigExprId[]): void

Or, if you already have a “slot write step” abstraction, extend it to accept an array and write sequentially.

⸻

5) ScheduleExecutor Changes

5.1 Execute strided slot writes

When executing StepSlotWriteStrided:
•	For i in 0..inputs.length-1:
•	v = evaluateSignal(inputs[i])
•	state.values.f64[slotBase + i] = v

No caching changes are required beyond existing scalar caching.

⸻

6) Lowering Rules for Blocks (Signal Path)

6.1 Producing multi-component outputs

If a block’s output payload has stride S > 1:
•	Allocate slot = allocSlot(S)
•	Compute scalar component expressions c0..c(S-1) as SigExprIds
•	Emit stepSlotWriteStrided(slot, [c0..cS-1])
•	Return the output value as:
•	{ k: 'sig', slot, stride: S, type: outType, components: [c0..cS-1] }

Do not attempt to “pack” the value into one SigExprId.

6.2 Consuming multi-component inputs

If a block needs to read a vec2/vec3/color signal input:
•	The input value will have { slot, stride }
•	Read components by slot indexing using existing slot SigExpr:
•	x = sigSlotRead(slot + 0)
•	y = sigSlotRead(slot + 1)
•	etc.

You may implement a small helper in lowering context:
•	readSigComponent(inputValue, i) -> SigExprId
•	emits { kind:'slot', slot: input.slot + i }

This helper is part of lowering utilities, not runtime.

⸻

7) Type System and Stride

7.1 Stride is derived solely from payload

Use the canonical stride function already present (strideOf(payload)).

Rules:
•	float/int/bool -> stride 1
•	vec2 -> stride 2
•	vec3 -> stride 3
•	color -> stride 4

No dynamic stride. No runtime maps.

⸻

8) Required Refactors to Existing Code

8.1 Remove “pack” usage at signal level

Any block lowering that currently does:
•	sigZip([...], kernel('packVec2'), signalType('vec2'))
or similar must be rewritten to:
•	compute scalar component SigExprIds
•	strided slot write step
•	expose output as slot+stride

8.2 Keep field pack kernels as-is

Field kernels that write Float32Array/Uint8ClampedArray with stride remain correct.

⸻

9) Tests (Canonical)

9.1 Unit tests: strided slot write
•	Build a tiny program with a StepSlotWriteStrided(slotBase=K, inputs=[const1,const2])
•	After one frame:
•	values.f64[K] == 1
•	values.f64[K+1] == 2

9.2 Integration: Const
•	Lower Const vec2 so it writes (x,y) into contiguous slots.
•	Verify downstream consumer reads those components correctly via slot reads.

9.3 End-to-end: signal-only vec2/vec3/color pipeline
•	A signal graph that produces a vec3 position and color should compile and execute without any multi-evaluator changes.

⸻

10) Non-negotiable Prohibitions
    •	No array-returning signal evaluation APIs.
    •	No kernel side effects that write directly into slot storage.
    •	No “strideMap” keyed by SigExprId.
    •	No new semantics in SignalEvaluator beyond scalar evaluation.

This is the spec.