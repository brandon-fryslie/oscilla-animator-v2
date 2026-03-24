Below is the strict, end-state specification for multi-component signal values (vec2/vec3/color/etc.) with stride-aware slots, generic evaluation, and zero “special cases” in executors.

⸻

Multi-Component Signal Values and Stride-Aware Slots

0. Scope and Non-Goals

In scope
•	Signal values whose payload encodes as 1–4 numeric components (stride ∈ {1,2,3,4}).
•	A single, generic evaluation mechanism that produces all components for any signal expression.
•	Slot allocation, schedule execution, debug plumbing, and rendering that treat stride as first-class.

Not in scope
•	“Object payload” runtime side channels (Map<ValueSlot, unknown>) — deleted.
•	Executor special-cases for palette/time/color/vec2 — forbidden.
•	History for stride>1 signals — not implemented; compile-time forbidden for HistoryService tracking.

⸻

1. Canonical Meanings

1.1 ValueSlot
•	A ValueSlot refers to a typed value storage region described by SlotMetaEntry.
•	The runtime storage for a ValueSlot is a contiguous block of scalar lanes in a numeric array:
•	Base offset slotMeta.offset
•	Component count slotMeta.stride
•	Component k lives at values[offset + k] for k ∈ [0, stride).

1.2 Stride
•	Stride is the number of numeric components required to represent a payload.
•	Stride is a closed set: 0 | 1 | 2 | 3 | 4.
•	Stride=0 is never stored in numeric slots and is never evaluated by numeric evaluators.

1.3 Sampleability
•	A payload is “sampleable” iff stride(payload) > 0.
•	Payloads with stride=0 are forbidden anywhere a numeric slot is required.

⸻

2. Payload → Stride Table

This table is authoritative and used by compiler, runtime, debug, and UI.

PayloadType	Stride	Component Names	Numeric Storage
float	1	['x']	yes
int	1	['x']	yes (stored as float, formatted as int)
bool	1	['x']	yes (0 or 1)
unit	1	['x']	yes
phase	1	['x']	yes
vec2	2	['x','y']	yes
vec3	3	['x','y','z']	yes
color	4	['r','g','b','a']	yes (all components in [0,1] by convention; enforcement is via units/blocks, not storage)
shape	0	[]	no (never in numeric slot)

Rule: payloadStride(payload) returns exactly the stride above.

⸻

3. SlotMeta: Compiler-Emitted Single Source of Truth

3.1 SlotMetaEntry

Each allocated slot has exactly one meta entry:

interface SlotMetaEntry {
readonly slot: ValueSlot;
readonly offset: number;      // base index into RuntimeState.values
readonly stride: 0|1|2|3|4;    // component count
readonly payload: PayloadType; // must match the stride table
}

Constraints (compiler MUST enforce):
•	stride === payloadStride(payload).
•	stride !== 0 for any slot allocated into the numeric store.
•	Offsets are assigned so that for any two different slots A and B, their storage ranges do not overlap:
•	[A.offset, A.offset + A.stride) ∩ [B.offset, B.offset + B.stride) = ∅

3.2 Slot allocator

allocTypedSlot(type: CanonicalType) -> ValueSlot MUST:
•	Compute stride = payloadStride(type.payload).
•	Reject stride=0.
•	Reserve stride consecutive positions in the numeric store.
•	Emit SlotMetaEntry with payload and stride.

⸻

4. Runtime Storage

4.1 Numeric store

RuntimeState contains:

values: Float64Array // or Float32Array if you standardize on f32; this spec assumes Float64Array if already used

Rule: All signal values are stored as scalar components in values. No other store exists for signals.

4.2 Slot read/write

Two primitives exist and all runtime execution uses them:

readSlot(slot: ValueSlot, out: Float64Array, outOffset: number): void
writeSlot(slot: ValueSlot, src: Float64Array, srcOffset: number): void

Semantics:
•	Both use slotMeta[slot].offset and .stride.
•	Copy exactly stride components, in order, with no allocation.

⸻

5. IR Semantics: Expressions Produce Vectors, Not Scalars

5.1 Replace scalar-only evaluator assumption

The system MUST NOT assume that a SigExpr evaluates to a single number.

5.2 Evaluation signature

The runtime evaluator interface is:

evaluateSigExprInto(exprId: SigExprId, out: Float64Array, outOffset: number): void

Rules:
•	The evaluator writes exactly payloadStride(expr.type.payload) components to out[outOffset + k].
•	The evaluator MUST NOT allocate.
•	The evaluator MUST NOT return a number.
•	Scalar signals are stride=1 and write only out[outOffset].

5.3 Schedule step semantics

The schedule’s signal evaluation step is:

StepEvalSig { kind:'evalSig', expr: SigExprId, target: ValueSlot }

Execution semantics:
•	Compute targetStride = slotMeta[target].stride.
•	Compute exprStride = payloadStride(expr.type.payload).
•	MUST assert targetStride === exprStride.
•	Execute:

evaluateSigExprInto(expr, values, slotMeta[target].offset)

That’s the only mechanism; no special casing.

⸻

6. Expression Evaluation Rules (Signals)

This section is intentionally strict: every expression kind defines exactly how it writes components.

6.1 Constants (SigExprConst)
•	SigExprConst.value becomes a component vector:
•	If payload stride is 1: value is a number or boolean.
•	If payload stride is >1: value is stored as a fixed-length tuple at IR level.
•	IR must not represent multi-component constants as number | string | boolean.

Strict IR representation:

type ConstValue =
| { stride:1, c0:number }
| { stride:2, c0:number, c1:number }
| { stride:3, c0:number, c1:number, c2:number }
| { stride:4, c0:number, c1:number, c2:number, c3:number };

Evaluator writes c0..c{stride-1}.

6.2 Slot read (SigExprSlot)
•	Reads stride components from the referenced slot into out.

6.3 Time and externals (SigExprTime, SigExprExternal)
•	Each which has a declared payload/stride in the IR type.
•	The evaluator writes the component vector for that which.

Example: if palette is color, evaluator writes 4 components to out.

6.4 Map (SigExprMap)

SigExprMap applies a pure function to each lane of its input.

Strict rule:
•	inputStride = stride(input.type.payload)
•	outputStride = stride(map.type.payload)
•	The map function MUST have a declared signature mapping inputStride -> outputStride.

Execution:
•	Read input into a local fixed scratch buffer of max 4 comps (reused).
•	Apply the function to produce output comps.
•	Write output comps to out.

No allocations: scratch buffers are pre-allocated per evaluator instance.

6.5 Zip (SigExprZip)
•	Zips N inputs and applies a pure function to produce output components.
•	The function signature is declared in IR: (s1, s2, ..., sN) -> out, with each si having known stride.

Execution:
•	Read all inputs into scratch buffers.
•	Apply function.
•	Write output.

⸻

7. Pure Functions: Stride-Aware by Construction

7.1 Replace “opcode returns number” contract

Every pure function is evaluated as:

applyPureFnInto(fn: PureFn, inputs: Float64Array[], inputStrides: Stride[], out: Float64Array, outStride: Stride): void

Rules:
•	outStride is fixed by the consumer (expression’s declared output payload).
•	Functions are required to be total for the declared stride signature.
•	A function that is only defined for stride=1 MUST be rejected at compile time if used with non-1 stride.

7.2 Opcode rules

Primitive opcodes are classified as:
•	Scalar-only: Sin, Cos, Tan, Pow, Log, etc. (defined only for stride=1)
•	Component-wise: Add, Sub, Mul, Div, Min, Max, Clamp (defined for any stride where all operands share the same stride)
•	Special typed: Lerp (requires consistent stride among a,b and scalar t)

Compiler must enforce:
•	Stride compatibility and output stride per opcode signature.
•	Unit constraints remain separate and must be validated by unit typing, not runtime code.

⸻

8. Debug Plumbing: Current Sample Supports Stride, History Is Stride=1 Only

8.1 DebugService stores current values without cloning

DebugService MUST read current samples directly from RuntimeState numeric store using slot meta and stride.

It exposes a stable “read into out array” API:

readSignalSampleInto(slot: ValueSlot, out: Float32Array /*len 4*/): { stride:Stride, payload:PayloadType, type:CanonicalType }

Rules:
•	Reads stride components into out[0..stride-1].
•	Sets remaining out entries to 0.

8.2 HistoryService tracking guard

HistoryService MUST accept only:
•	resolvedExtent.cardinality.kind === 'one'
•	resolvedExtent.temporality.kind === 'continuous'
•	payloadStride(payload) === 1

If any guard fails, track() is a no-op that does not allocate and does not record.

History ring buffer writes:
•	entry.buffer[writeIndex % capacity] = valueComponent0.

This is strict and permanent for v1.

⸻

9. Renderer / Mini-View: Uses Stride for Current Value, Not History

9.1 RendererSample for scalar current value

Scalar renderer samples are:

{ mode:'scalar', components: Float32Array /*len 4*/, stride:Stride, type:CanonicalType }

Rules:
•	ValueRenderer formats based on type.payload and type.unit, and may use all components up to stride.
•	Sparkline uses HistoryService only and therefore only appears when stride===1.

⸻

10. Compiler Validations (Must-Have Guards)

The compiler MUST reject programs that violate any of the following:
1.	Any ValueSlot allocated with payloadStride=0.
2.	Any StepEvalSig where exprStride !== targetSlotStride.
3.	Any use of a scalar-only opcode in a context where any input stride != 1.
4.	Any SigExprConst whose representation does not match the payload stride.
5.	Any SigExprMap/Zip where the function signature is not compatible with input/output strides.

This ensures “can’t silently write component0 only” is structurally impossible.

⸻

11. Removal Criteria for the Old System

You are “done” only when all are true:
•	There is no Map<ValueSlot, unknown> (or equivalent object-side storage) used for signal payloads.
•	There are no executor special cases for palette/time/color/vec2 in schedule execution.
•	All signal evaluation flows through one path: evaluateSigExprInto(expr, values, offset).
•	SlotMeta contains stride and payload, and every signal slot write uses them.
•	A multi-component signal (e.g., color) can be produced and consumed through normal IR without any code path that assumes number return.

⸻

12. Concrete Example: time.palette as a color Signal

Type:
•	SigExprTime(which='palette') has payload color, stride 4.

Compilation:
•	A consumer requests a slot for it: allocTypedSlot(color) yields slot S with meta {offset, stride:4, payload:'color'}.
•	Step: evalSig expr=time.palette -> target=S.

Runtime:
•	Executor calls evaluateSigExprInto(expr, values, offsetS).
•	The evaluator writes rgba into values[offsetS + 0..3].
•	Debug reads it as stride=4 and displays a swatch; sparkline does not appear because HistoryService rejects stride>1.

⸻

13. Implementation Checklist (No Detours)
    1.	Add payloadStride(payload) and the full stride table.
    2.	Add stride + payload to SlotMetaEntry; enforce stride === payloadStride(payload) in allocator.
    3.	Replace any scalar-returning signal evaluator with evaluateSigExprInto.
    4.	Make StepEvalSig execution call evaluateSigExprInto and delete all palette/color special handling.
    5.	Refactor PureFn application to applyPureFnInto and enforce opcode stride signatures at compile time.
    6.	Update DebugService to read current samples using slot meta stride; delete any object side channels.
    7.	Keep HistoryService strictly stride=1 with compile-time guard semantics.

This is a single coherent system with one evaluation mechanism and no escape hatches.