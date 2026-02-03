Make it structurally hard for a lower fn to misbehave, then backstop it with a small set of invariants + tests that fail loudly. In practice that means: constrain the API, separate phases, and add “purity assertions” that you can run automatically.

1) Constrain the lowering API so “bad behavior” is unrepresentable

A. Don’t pass BlockId, graph objects, registries, or mutable compiler state

A lowerer that can see the whole world will eventually start depending on it.

Instead pass only:
•	resolved port types (or resolved CanonicalType of each input)
•	params (frozen object)
•	input ValueExprIds
•	a narrow IR builder object (see below)

B. Make the builder capability-based

Give ctx only the operations you want to allow. If it can’t do string lookups or mutate global arrays, it can’t.

Good ctx surface (pure construction only):
•	emitConst(type, values)
•	emitOp(opcode, inputs, outType)
•	emitKernel(kernelId, abi, inputs, outType)
•	emitExtract(vecExpr, swizzle, outType)
•	emitConstruct(outType, components)
•	readRail(railId, outType) (still pure if rail expr is a leaf)
•	requireState(spec) (only if you explicitly allow stateful lowerers)

Not allowed in ctx:
•	allocate slots
•	register schedule steps
•	read other blocks/edges
•	consult “current compilation pass index”
•	access random, time, or IO

If you need schedule/state effects, split it: lower returns a plan that the scheduler consumes, but the lowerer cannot schedule.

C. Make inputs opaque IDs, not raw buffers

Lowerers should never see runtime arrays. They should produce DAG nodes only.

2) Split “pure lowering” from “effect wiring” (two-result model)

Have lowerers return:
•	exprOutputs: Record<PortId, ValueExprId>
•	effects?: LowerEffects (optional)

Where LowerEffects is also data, not “do it now” callbacks:
•	“needs state cell X with layout Y”
•	“requests kernel K”
•	“declares intrinsic dependency D”

Then a separate compiler stage turns effects into actual slot allocations and schedule steps.

This prevents the most common impurity: “lowerer secretly schedules things.”

3) Make purity mechanically testable (the practical checks)

A. Determinism check (golden hash)

Run the same lowering twice with the same inputs and ensure the result is bit-identical at the IR level.

Concretely:
•	same ValueExpr DAG structure (ExprIds can differ if they’re hash-consed by address; so compare canonical serialized DAG)
•	same set of effect requests, in stable order

This catches accidental dependence on:
•	object iteration order
•	Map insertion order
•	random seeds
•	global counters

B. No-global-mutation check (freeze + proxy)

In test mode:
•	deepFreeze the BlockDef, params, and inputs
•	wrap ctx in a proxy that records every call
•	wrap any “compiler context” object in a proxy that throws on property writes

Then your contract is enforceable: any attempted mutation throws.

C. Forbidden API check (lint-time)

Add an ESLint rule (or TS rule) that forbids lowerers from importing modules known to be “impure surfaces”:
•	graph model types
•	registry lookups outside the builder
•	runtime/state containers
•	Date/Math.random

This is cheap and stops most drift early.

D. “Macro-safe” type-level tagging

Make blocks opt into being callable as macros:

interface BlockDef {
// ...
loweringPurity: "pure" | "stateful" | "impure";
}

Then:
•	DefaultSource macro expansion may only call "pure" blocks
•	(optionally) "stateful" if you explicitly allow state dependencies
•	never "impure"

This avoids one bad block contaminating the system.

4) Enforce the invariant you actually care about

Write down the contract as a short checklist that’s implementable:

Pure lower fn contract

Given:
•	resolved input types and param values
•	input expr IDs
•	a builder that is referentially transparent

It must:
1.	Return the same outputs for the same inputs (deterministic)
2.	Not read global mutable state
3.	Not mutate any input objects
4.	Only construct IR nodes via builder
5.	Not allocate slots / schedule steps directly
6.	Not depend on BlockId strings (unless passed in as an explicit stable “macro identity” token)

Then encode 1–5 as tests and API constraints. #6 is social/discipline but you can catch most of it via “don’t pass BlockId.”

5) Add a compiler-time “purity mode” run

In debug/dev builds:
•	run lowering once in “record mode” where builder logs calls
•	run it again and diff the log
•	if mismatch, emit a diagnostic pointing at the block kind and lowerer

This turns purity into something you discover immediately during development, not after user reports.

6) The opposing view: don’t over-engineer purity

You can also choose a lighter approach:
•	rely on code review + a few tests
•	accept that lowerers may consult small registries

That works until you start using lowerers as macros from other places (like DefaultSource). The moment you do that, impurities become systemic bugs, not local ones. So if you want “call block lowerers to build defaults,” the stricter approach pays off quickly.

The practical answer is: capability-based builder + effect-as-data + determinism test harness is the combination that actually keeps lower fns well-behaved over time.