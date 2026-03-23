Yes: treat block lowering as a pure IR macro library and run it under a synthetic lowering context that never constructs real graph nodes, only ValueExprs. You get the speed/simplicity of “emit IR directly” while reusing the canonical semantics already encoded in block lower() implementations.

The pattern

1) Define a tiny “IR builder” API that block lowerers target

Right now your lower(args) takes inputsById and returns a LowerResult. Make sure a LowerResult can be expressed purely as ValueExprIds plus (optional) scheduling/state write intents that already exist in your compiler.

You then implement a reusable helper:
•	lowerBlockToIR(blockKind, inputs, params) -> outputs(ValueExprId...)

…but without a real BlockId, edges, etc.

2) Create a LowerSandbox that can call any BlockDef.lower() deterministically

The sandbox provides exactly what lowerers need:
•	ctx.emitConst(type, value) -> ValueExprId
•	ctx.emitIntrinsic(name, inputs...) -> ValueExprId
•	ctx.emitKernel(name, abi, stride, inputs...) -> ValueExprId
•	ctx.readRail(railId) -> ValueExprId
•	ctx.emitConstruct(payload, components...) -> ValueExprId
•	ctx.emitExtract(vecExpr, swizzle) -> ValueExprId
•	ctx.requireStateSlot(stateKey, type) -> { readExpr, writePlan } (if you want stateful defaults)

…and returns a bundle of outputs as ValueExprIds.

Crucially: the sandbox enforces your invariants:
•	no graph mutation
•	deterministic hash-consing for expr ids
•	type-correct construction (each expr carries CanonicalType)

3) Use “macro lowering” for defaults

Your DefaultSource lowering becomes:
1.	Resolve target port type (already in your pipeline).
2.	Pick a default template keyed by type/profile.
3.	Produce ValueExprId by invoking existing blocks’ lower() through the sandbox.

Example: default color
•	Instead of hardcoding “HueRainbow(phaseA)” inside DefaultSource,
•	you invoke the actual HueRainbow block lowerer:

const phase = sandbox.readRail("phaseA");               // ValueExprId
const out = sandbox.lowerBlock("HueRainbow", { t: phase }, { /* params */ }).out;
return out; // ValueExprId typed as color

This gives you the “different block per type” property while still producing direct IR.

Why this gives you both sets of benefits

Benefits you keep from direct IR emission
•	No extra derived nodes cluttering NormalizedGraph or DebugIndex.
•	No “internal block IDs” to manage, anchor, index, or migrate.
•	No runtime conditional logic; specialization happens at compile time.
•	Performance stays ideal: you emit only the ValueExpr DAG you need.

Benefits you keep from “use real blocks”
•	Semantics remain single-source-of-truth: if HueRainbow changes, the default changes automatically.
•	Your default behavior is literally composed of existing block semantics (fewer duplicated formulas).
•	You can reuse block-specific type constraints, unit behavior, stride logic, kernels, etc.

What you need to standardize to make this safe

A) Lowerers must be “referentially transparent” with respect to their inputs

If a block lowerer depends on:
•	blockId string formatting
•	global registries with mutable state
•	incidental graph order
…then invoking it as a macro can become nondeterministic or context-dependent.

Fix: define a hard contract:
•	BlockDef.lower() is a pure function of (resolved types, params, inputs, ctx intrinsics) and may request stable state keys via an explicit API.

B) Provide stable identity when lowerers want it

Some lowerers might generate state keys or debug tags based on block identity.

In sandbox mode, you supply a deterministic synthetic identity, e.g.:
•	macro:<defaultSourceAnchor>:<templateName>:<subnodeName>

This gives stable StateIds/diagnostics without actual graph nodes.

C) Preserve attribution

Even if you don’t create internal nodes, you still want “why is this 0?” to land on the target port and ideally mention the template (“default from HueRainbow(phaseA)”).

Do that by:
•	attaching TargetRef = the target input port
•	attaching a debug “macro trace” record: { producer: DefaultSource(anchor), expandedUsing: HueRainbow }

This is cheap and keeps your diagnostic story coherent.

The opposing view (and the real risk)

Risk: calling arbitrary block lowerers as macros can accidentally let block lowerers become a “public API surface” with hidden dependencies and side-effects, making compilation harder to reason about and test.

Mitigation: formally split block definitions into two layers:
•	IR intrinsics/kernels library (pure, context-free)
•	BlockDef.lower is a thin wrapper over that library

Then your DefaultSource macros call the library helpers directly, or call lower() but only for blocks that declare themselves macro-safe.

This gives you the composition benefit without turning compilation into “execute a bunch of semi-random lowerers and hope they behave.”

If you do it this way, you get both benefits without inheriting the worst failure mode of each.