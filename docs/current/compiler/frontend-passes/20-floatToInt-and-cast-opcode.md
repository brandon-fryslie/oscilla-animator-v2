MVP Float→Int adapter (unblocks patches, doesn’t paint you into a corner)

0) Goal and constraint
   •	Goal: let float connect to int without manual user edits.
   •	Constraint: make the semantic choice durable (parameterized) and visible in debug, even if UI hides it later.

⸻

1) Add a single adapter type: CastFloatToInt

BlockDef
•	type: "CastFloatToInt"
•	form: "primitive"
•	capability: "pure"
•	inputs
•	in: float (canonical/inference payload float, unit passthrough)
•	outputs
•	out: int (unit passthrough)
•	config/params
•	mode: "trunc" (string enum; MVP supports only "trunc" but keep the field)
•	cardinality
•	cardinalityMode: "preserve"
•	lane coupling preserve (whatever your standard is)

Invariants
•	unit: pass-through (same unit as input)
•	extent axes: preserve all except payload changes float→int

⸻

2) Implement lowering in IR with one opcode

Add one IR opcode if you don’t have it:
•	OpCode.F64_TO_I32_TRUNC (or similar)

Lowering:
•	input expr id x
•	output expr id y = opcode(F64_TO_I32_TRUNC, x)
•	If your signal evaluator is scalar-only, this is trivial.

If you already have generic “cast” opcode support, just map float->int + trunc.

⸻

3) Register adapter selection in findAdapter()

In src/blocks/adapter-spec.ts (or wherever):
•	Add rule:
•	from.payload == FLOAT and to.payload == INT
•	and unit compatible (for MVP: “same unit or unit-var compatible”; don’t invent unit conversion)
•	return adapter spec: { blockType: "CastFloatToInt", params: { mode: "trunc" } }

Also add the reverse later only if needed; for MVP, just float→int.

⸻

4) Add insertion via your derived obligation path

Where you create derived obligations (needsAdapter):
•	mismatch detection should already see payload mismatch float vs int once types are ok.

AdapterPolicy.planAdapter() for this case:
•	Create adapter block id deterministically from edge semantic id:
•	_adapter_cast_f2i_${fromBlockId}_${fromPort}_${toBlockId}_${toPort}
•	Replace edge:
•	remove original edge
•	add edge from source → adapter.in
•	add edge adapter.out → sink
•	Use role: "adapter" and edge role "implicitCoerce"

That’s enough to unblock, assuming your type facts and mismatch detection run.

⸻

5) Make it debuggable immediately

Even if UI hides adapters:
•	emit a diagnostic note when inserted:
•	Inserted adapter CastFloatToInt(mode=trunc) on edge A->B
•	in tests, assert the adapter exists in normalized graph by id pattern.

⸻

6) Minimal tests that prove it unblocks

Unit test: adapter selection
•	from: canonical float, to: canonical int
•	expect findAdapter() returns CastFloatToInt with mode trunc

Integration: fixpoint inserts it
•	Patch: FloatConst → IntConsumer (any block that requires int)
•	Run final normalization fixpoint
•	Assert:
•	no remaining needsAdapter obligations
•	adapter block exists
•	graph has two edges replacing the original
•	strict finalization succeeds

⸻

7) The one thing you must NOT do in MVP

Do not “just treat int ports as float” or “silently change the sink type” or add per-port overrides. That reintroduces the exact nondeterministic locking behavior you’re trying to remove.

That is the correct MVP.

---

CAST OPCODE

A “cast opcode” here just means “an IR opcode whose semantics are convert value of type A to type B”, the way you already have opcodes for add/mul/sin/etc. It’s not a special compiler concept—just another entry in your shared opcode table that both evaluators implement.

What it would look like in your shared opcode table

You have two implementation backends:
•	signal eval: scalar path (number / int)
•	field materialization: strided buffer path

So a cast opcode is ideal because it’s exactly the kind of thing that should be identical across both.

Minimal version:
•	F64_TO_I32_TRUNC
•	input: float
•	output: int
•	semantics: JS-style trunc toward 0 (or explicit Math.trunc)

If you represent “int” as i32 in buffers and “float” as f64, then:
•	field materializer: out[i] = trunc(in[i])
•	signal eval: return trunc(x)

That’s it.

Should you implement a generic cast opcode now?

Do not implement “generic cast” right now. Implement one concrete opcode (F64_TO_I32_TRUNC) and call it a day.

Why:
•	A generic CAST(fromType,toType,mode) opcode immediately forces you to:
•	define a type encoding at runtime
•	validate allowed conversions
•	define rounding modes, saturating vs wrapping, NaN behavior, etc
•	handle vector payload casts / per-component casts
•	keep the opcode table stable and deterministic across both eval paths
•	None of that is needed to unblock patches.

So: add one concrete opcode now. Later, if you end up with 6–12 casts and they’re repetitive, then you can refactor into a generic form if you still want it.

How to implement F64_TO_I32_TRUNC with your shared opcode table

Add an entry:
•	name: F64_TO_I32_TRUNC
•	arity: 1
•	inputPayload: FLOAT
•	outputPayload: INT
•	purity: pure
•	fieldImpl: writes i32 buffer from f64 source
•	signalImpl: returns int number (still JS number) but your “int” payload contract enforces integer-ness

Semantics:
•	trunc toward zero:
•	positive: floor
•	negative: ceil
•	Decide overflow behavior explicitly:
•	MVP recommendation: clamp to int32 range and treat NaN as 0
•	or: wrap via |0 (fast but surprising)
•	pick one and freeze it; don’t leave it implicit

If you want the least surprising for users: clamp + NaN→0.

Pseudo:
•	signal:
•	if (!Number.isFinite(x)) return 0
•	x = Math.trunc(x)
•	if (x > 2147483647) return 2147483647
•	if (x < -2147483648) return -2147483648
•	return x
•	field:
•	same per-element, write to Int32Array

Where it plugs in
•	The Cast block lowering emits the opcode:
•	out = ctx.b.opcode(OpCode.F64_TO_I32_TRUNC, in)
•	No other infrastructure needed.

Why this is the right time to add it

Because you already have the “one opcode table shared by both” design. Cast is exactly a shared primitive and it eliminates the temptation to implement conversion ad-hoc in one backend and forget the other.

That is the right way to do it.