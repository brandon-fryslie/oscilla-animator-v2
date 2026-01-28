Canonical Spec: Cardinality-Polymorphic Blocks, Units, and Dual-Kernel Lowering

Status: Canonical (authoritative)
Scope: Block definitions, normalization/type passes, lowering patterns, kernels, and unit/cardinality behavior.
Non-goals: Implementations, refactors, naming migrations, renderer details.

⸻

0. Problem Statement

We are migrating from a system where many “field” blocks were hard-coded to produce/accept fields only (many-cardinality) toward a system where blocks can be cardinality-polymorphic: a block can operate on a signal (one-cardinality) or a field (many-cardinality) with the same semantic intent, without duplicating blocks like SetZSignal vs SetZField.

This migration must coexist with:
•	Strict unit checking at connection boundaries (no implicit unit conversions).
•	Generic / polymorphic blocks whose output types (payload + unit + cardinality) are resolved by constraints and context.
•	A compiler pipeline where normalization and constraint solving produce a fully explicit graph and fully resolved types before lowering.

Failures so far cluster around:
•	Cardinality mismatches (field→signal) when blocks are incorrectly marked fieldOnly.
•	Unit mismatches because unit specialization became “real” for generic blocks, and inference is incomplete or directional.

This spec defines the correct architecture and what needs to change.

⸻

1. Core Concepts and Terms

1.1 Value Kinds

A value in lowering is always one of:
•	Signal value: scalar per frame (k: 'sig')
•	Field value: vectorized per instance element (k: 'field')

The kind is not guessed at runtime; it is determined by the resolved graph + constraint solution.

1.2 Cardinality Modes

A block declares how its output cardinality relates to inputs:
•	cardinalityMode: 'preserve'
Output cardinality tracks primary input cardinality (or declared driver input).
•	cardinalityMode: 'fieldOnly'
Block accepts/produces only fields (legacy behavior; should be used rarely going forward).

1.3 Broadcast Policy

A block declares whether it allows mixed signal/field inputs:
•	disallowSignalMix
Inputs must match kinds (all sig or all field). No mixed.
•	allowZipSig
Mixed sig/field is allowed by explicitly lifting signals to fields using Broadcast + a field zip kernel (or a dedicated ZipSig op).
•	requireBroadcastExpr
Mixed sig/field is only valid if the mixed path is represented explicitly as a broadcast/zip expression in IR (useful if the compiler needs to force a particular lowering shape).

1.4 Units

Units are part of type identity (e.g., float<scalar>, float<phase01>, float<deg>). The system enforces:
•	No implicit unit conversion at connection boundaries.
•	Unit adaptation happens only through explicit adapter blocks (conversion blocks).

⸻

2. Architectural Laws

LAW A — Normalization produces an explicit, compilable graph

After normalization, there are no “implicit” semantics required for compilation:
•	No implicit default sources.
•	No implicit broadcasts.
•	No implicit unit conversions.
•	No hidden type decisions left to runtime.

LAW B — Constraint solving is the only authority on resolved types

Payload, unit, and cardinality resolution must be fully decided before lowering. Lowering follows resolved types; it does not infer them.

LAW C — No block-level signal/field branching logic

Block lower() must not contain per-block “if sig do X else if field do Y” logic scattered across the codebase.

Instead:
•	Use centralized dual-emission helpers (see §5).
•	Mixed paths must be explicit (Broadcast + fieldZip or equivalent).

This is to prevent duplication and long-term divergence of semantics.

LAW D — “Field” vs “Signal” is a representation concern, not a semantic concern

Many blocks previously labeled “FieldX” are semantically “Apply kernel elementwise”. They should become cardinality-polymorphic.

⸻

3. Compiler Pipeline Responsibilities

3.1 pass0 — Graph normalization

Primary responsibility: turn UI/raw graph into a normalized graph that is structurally explicit.

Allowed responsibilities:
•	Materialize default sources as actual blocks/edges.
•	Insert explicit broadcast blocks/edges if the UI graph implies them (e.g., a signal plugged into a field-expecting input and broadcastPolicy allows it).

Not responsible for:
•	Solving global type constraints (payload/unit/cardinality). pass0 may emit constraints, but must not attempt to “guess” final answers in a directional way that can deadlock or misinfer.

3.2 pass1 — Constraint collection + unification

Primary responsibility: build and solve the global constraint set for:
•	payload types
•	units
•	cardinality

Outputs:
•	Resolved per-port types (payload + unit + extent).
•	Any required “adapter” insertions that are semantic (unit conversions, domain conversions, etc.) if adapters are a first-class part of the language.

3.3 pass2 — Type finalization / port specialization

Primary responsibility: expose a definitive getPortType() view that returns fully specialized port types for all blocks.

Rule: getPortType() must never silently “default” a polymorphic unit/cardinality if that value is semantically required and was not resolved. That is a hard compile error (the solver is authoritative; missing resolution is a bug).

Implication: The “fallback to defaultUnitForPayload(‘float’) → scalar” behavior is non-canonical for polymorphic outputs unless the block explicitly declares a default unit in its definition that is not variable.

⸻

4. Canonical Rules for Units in Polymorphic Blocks

4.1 Unit inference is constraint solving, not local inference

Any design that tries to infer units in pass0 “from connected port directionally” is brittle and can introduce chicken-and-egg failures.

Canonical approach:
•	Polymorphic unit variables are created in block definitions (e.g., unitVar('const_out')).
•	Constraints bind them based on connections and block contracts.
•	The solver resolves them globally.

4.2 Missing unit resolution is a compiler bug, not user error

If a polymorphic output’s unit is not resolved by pass1, compilation must fail with a diagnostic that points to:
•	the unresolved unit variable
•	the involved constraints / edges
•	the block/port that remained underconstrained

Do not “default” the unit in getPortType() for polymorphic ports.

4.3 Camera and other strongly typed ports

Ports like Camera.tiltDeg that require specific units are just ordinary constraints:
•	The consumer port’s unit kind constrains the producer’s unit var through the connection.
•	If multiple constraints conflict, compilation fails and requires an explicit adapter.

⸻

5. Canonical Dual-Kernel Lowering

5.1 The goal

One block definition, one semantic intent; lowering uses a shared dispatch surface.

5.2 KernelRegistryDual (conceptual spec)

Define a small module that provides:
•	ValueRef = {k:'sig', id} | {k:'field', id}
•	emitUnary(ctx, input, { opcode, fieldKernel, outSigType, outFieldType })
•	emitBinary(ctx, a, b, { opcode, fieldKernel, broadcastPolicy, inFieldType, outSigType, outFieldType })

Canonical behavior:
•	If all inputs are signals → emit sig opcode path.
•	If any input is field → emit field kernel path.
•	If mixing is allowed (policy) → explicit broadcast of signal(s) to field(s) then fieldZip.
•	If mixing is disallowed → error during lowering (but ideally prevented earlier by pass1).

5.3 Where the branching is allowed

Branching on kind (sig vs field) is allowed only inside the dual-kernel module (or equivalent single dispatch layer). Blocks call it; blocks do not reimplement it.

5.4 Required IR surface

The IR builder must expose (or have equivalents):
•	sigMap, sigZip, sigConst
•	fieldMap, fieldZip
•	Broadcast(sig → field) as an explicit op
•	kernel lookup (kernel(name)) and opcode lookup (opcode(name))

⸻

6. Block Definition Migration Rules (Field → Cardinality-Generic)

6.1 When a block should become cardinality-polymorphic

A block should be cardinalityMode: 'preserve' if:
•	Its semantics are “apply elementwise” or “compute per lane” and make sense for a single element.
•	It does not inherently depend on per-instance indexing/instance context.

Examples from your set that are semantically not field-only:
•	RadiusSqrt (computes radius * sqrt(id01) — if id01 is scalar, it still makes sense)
•	SetZ (sets a z component — scalar makes sense)
•	AngularOffset (computes angle offset from phase/spin — scalar makes sense)
•	Pulse (computes a pulse value — scalar makes sense)
•	HueFromPhase (scalar makes sense)
•	Jitter2D (scalar makes sense)

6.2 When a block is legitimately field-only

A block may remain field-only if:
•	It requires an instance domain and depends intrinsically on per-element indexing (e.g., uses normalizedIndex intrinsic).
•	Its output is defined only as a field aligned to an instance domain.

Example:
•	FromDomainId is inherently field-producing because it derives per-element IDs.

6.3 Port typing changes (canonical)

For blocks transitioning from field-only to preserve:
•	Main I/O ports (the “field data” ports) must use canonicalType(...) rather than signalTypeField(...).
•	Control/parameter ports that are naturally signals (phase, time root, slider constants) remain signal-typed and may be broadcast explicitly in lowering when operating on fields.
•	Default sources remain signal-y, not field-y.

This means:
•	Do not force id01 to be field in type; allow it to be signal or field.
•	If the block needs id01 in a field path, and id01 is signal, the allowed mixed policy will broadcast it.

6.4 Lowering guards must not enforce legacy field-only semantics

Any lower() guard like:

if (id01.k !== 'field') throw ...

is non-canonical for preserve blocks.

Canonical replacements:
•	Either remove the guard and rely on dual-kernel dispatch + broadcast policy, or
•	Assert only what is semantically required (payload/unit, not kind), and allow both kinds.

⸻

7. Multi-Component Signals (vec2, vec3, color)

7.1 Canonical representation

Multi-component payloads are not “special blocks”; they are payload specializations.

A cardinality-polymorphic block operating on vec2 or color should:
•	Use componentwise semantics (declared in payload metadata).
•	Emit either scalar opcodes (if supported) or use packing/unpacking kernels.

7.2 Kernel location rule
•	Scalar numeric operations live in OpcodeInterpreter.
•	Phase-domain oscillators / easing live in SignalEvaluator kernels.
•	Buffer/field kernels live in FieldKernels.
•	Dual dispatch lives in KernelRegistryDual.
Blocks wire these layers together; they do not replicate math.

⸻

8. Canonical Error Conditions

8.1 Unit mismatch

If units differ and no adapter exists on the edge:
•	Reject connection with a “NoConversionPath” style diagnostic.

8.2 Cardinality mismatch

If cardinality differs and block policy disallows mixing:
•	Reject during constraint checking / type validation.

If policy allows mixing:
•	Normalize to an explicit Broadcast/ZipSig form, or enforce lowering to do explicit broadcast.

8.3 Unresolved polymorphism

If after pass1 any of these remain unresolved:
•	payload type variable
•	unit variable
•	cardinality variable
Compilation fails with a diagnostic that points to the variable and constraints.

No fallback defaults in getPortType() for polymorphic ports.

⸻

9. Required Changes (Concrete Checklist)

9.1 Compiler / passes
1.	Move unit inference out of pass0 if it is directional guesswork. Replace with:
•	unit variables in types
•	global constraints in pass1
2.	Make getPortType() strict for polymorphic values:
•	If resolvedUnit (or equivalent) is required but missing → error.
•	Do not default to scalar for a unit-var output.
3.	Ensure pass1 solves payload+unit+cardinality as a single unified constraint system.

9.2 Blocks (migration)
1.	For all blocks currently fieldOnly but semantically elementwise:
•	set cardinalityMode: 'preserve'
•	set broadcastPolicy appropriately (allowZipSig if it’s okay to mix)
•	change main field I/O ports from signalTypeField → canonicalType
2.	Remove lowering guards that require k === 'field' unless the block is truly domain-bound.
3.	Prefer dual-kernel emission for unary/binary/componentwise blocks:
•	blocks should call dispatch helpers, not implement branching.

9.3 Kernels / dispatch
1.	Implement/standardize a KernelRegistryDual dispatch surface (single place for kind branching).
2.	Ensure explicit Broadcast exists and is used for mixed inputs under allowZipSig policy.
3.	Ensure FieldKernels contains the field versions (fieldSin, fieldCos, etc.) used by dispatch.

⸻

10. Notes on Naming (“Field” prefix removal)

The “FieldX” prefix is legacy UI taxonomy, not semantic truth. Once a block is cardinality-polymorphic, its canonical name should not encode representation.

Canonical naming rule:
•	If a block is semantically elementwise and preserve-cardinality → no “Field” prefix.
•	If a block is truly domain/instance intrinsic and field-only → “FromDomainId” style naming is fine (it encodes meaning, not representation).

This is a naming/UX pass; it should not block correctness work.

⸻

11. Design Decision: Where unification belongs

Constraint unification must happen after normalization and before port typing/lowering.
•	Normalization produces explicit graph structure and IR-shape.
•	Unification solves semantic types on that structure.
•	Lowering emits IR based on resolved semantics.

Do not embed unification “at the end of normalization” if that implies pass0 needs global knowledge to guess its way through. Keep normalization structural; keep unification semantic.

⸻

12. Canonical Examples (behavioral)

Example A — GoldenAngle.angle → Add.a
•	GoldenAngle is preserve-cardinality. Its angle output is canonicalType('float').
•	If upstream is a field (id01 field), angle is field.
•	Add is preserve-cardinality with allowZipSig.
•	Connecting field→signal should not happen; it becomes field→field due to preserve tracking, or errors if the graph is inconsistent.
•	If a signal is used where a field is needed, Broadcast is inserted/used explicitly.

Example B — Const → FieldHueFromPhase.phase (unit phase01)
•	Const output is float<unitVar>.
•	Constraint from consumer binds unitVar to phase01.
•	Solver resolves unit to phase01.
•	getPortType(Const.out) returns float with no fallback.

⸻

13. What This Spec Forbids
    •	Special-casing a particular block (like Const) as “magic” in validation or lowering.
    •	Silent unit defaults for unresolved polymorphic units.
    •	Per-block signal/field branching logic duplicated across block files.
    •	Implicit unit conversion at edges.
    •	Leaving polymorphism unresolved and relying on runtime interpretation.

⸻

This document is the authoritative reference for implementing the migration to cardinality-polymorphic blocks with strict units, using centralized dual-kernel dispatch and global constraint solving.


================================================

Exmaple blocks

Here are concrete “gold standard” examples of block configs that are actually cardinality-polymorphic in your codebase, so nobody has to guess what “correct” means.

⸻

Example 1: Unary numeric op (Sin) — preserve + dual lowering

This is the simplest “works for both sig and field” pattern: ports typed with canonicalType(...), cardinalityMode: 'preserve', and lower() branches only because you haven’t centralized dispatch yet.

registerBlock({
type: 'Sin',
label: 'Sin',
category: 'math',
description: 'Per-element sine (works with both signals and fields)',
form: 'primitive',
capability: 'pure',
cardinality: {
cardinalityMode: 'preserve',
laneCoupling: 'laneLocal',
broadcastPolicy: 'disallowSignalMix', // unary: no mixing issues
},
payload: {
allowedPayloads: {
input: STANDARD_NUMERIC_PAYLOADS,
result: STANDARD_NUMERIC_PAYLOADS,
},
semantics: 'componentwise',
},
inputs: {
input: { label: 'Input', type: canonicalType('float') },   // IMPORTANT: NOT signalTypeField
},
outputs: {
result: { label: 'Result', type: canonicalType('float') }, // IMPORTANT: NOT signalTypeField
},
lower: ({ ctx, inputsById }) => {
const input = inputsById.input;
if (!input) throw new Error('Sin input required');

    if (input.k === 'sig') {
      const fn = ctx.b.opcode(OpCode.Sin);
      const id = ctx.b.sigMap(input.id, fn, canonicalType('float'));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return { outputsById: { result: { k: 'sig', id, slot, type: outType, stride: strideOf(outType.payload) } } };
    }

    if (input.k === 'field') {
      const fn = ctx.b.kernel('fieldSin');
      const id = ctx.b.fieldMap(input.id, fn, signalTypeField('float', 'default'));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: { result: { k: 'field', id, slot, type: outType, stride: strideOf(outType.payload) } },
        instanceContext: ctx.inferredInstance,
      };
    }

    throw new Error('Sin input must be signal or field');
},
});

Takeaway for the “hardcode signalTypeField” crowd: the ports are canonicalType, and polymorphism is controlled by cardinalityMode: 'preserve' + lowering/dispatch, not by choosing signalTypeField up front.

⸻

Example 2: Binary op that allows signal/field mixing (Mod) — preserve + allowZipSig

This shows the “cardinality generic but mixing permitted” metadata, even though the current lower() still rejects mixed kinds (the metadata is the canonical intent and the future dispatch layer should honor it).

registerBlock({
type: 'Mod',
label: 'Mod',
category: 'math',
description: 'Per-element modulo (works with both signals and fields)',
form: 'primitive',
capability: 'pure',
cardinality: {
cardinalityMode: 'preserve',
laneCoupling: 'laneLocal',
broadcastPolicy: 'allowZipSig', // IMPORTANT: declares mixed sig/field allowed
},
payload: {
allowedPayloads: {
a: STANDARD_NUMERIC_PAYLOADS,
b: STANDARD_NUMERIC_PAYLOADS,
result: STANDARD_NUMERIC_PAYLOADS,
},
semantics: 'componentwise',
},
inputs: {
a: { label: 'A', type: canonicalType('float') }, // NOT signalTypeField
b: { label: 'B', type: canonicalType('float') }, // NOT signalTypeField
},
outputs: {
result: { label: 'Result', type: canonicalType('float') },
},
lower: ({ ctx, inputsById }) => {
const a = inputsById.a;
const b = inputsById.b;
if (!a || !b) throw new Error('Mod inputs required');

    if (a.k === 'sig' && b.k === 'sig') {
      const fn = ctx.b.opcode(OpCode.Mod);
      const id = ctx.b.sigZip([a.id, b.id], fn, canonicalType('float'));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return { outputsById: { result: { k: 'sig', id, slot, type: outType, stride: strideOf(outType.payload) } } };
    }

    if (a.k === 'field' && b.k === 'field') {
      const fn = ctx.b.kernel('fieldMod');
      const id = ctx.b.fieldZip([a.id, b.id], fn, signalTypeField('float', 'default'));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: { result: { k: 'field', id, slot, type: outType, stride: strideOf(outType.payload) } },
        instanceContext: ctx.inferredInstance,
      };
    }

    // CURRENT impl rejects mixing; canonical design is that allowZipSig enables Broadcast+fieldZip.
    throw new Error('Mod inputs must both be signals or both be fields');
},
});

Takeaway: cardinality polymorphism is primarily metadata + solver behavior; mixing requires Broadcast/ZipSig lowering, not changing ports to signalTypeField.

⸻

Example 3: Source block that is still preserve-cardinality (FromDomainId) — correctly outputs a field in lowering

This is a good example to stop people from using port typing as a proxy for “it’s a field.” The port is typed canonicalType('float'), yet lowering returns a field value because the instance context exists.

registerBlock({
type: 'FromDomainId',
label: 'From Domain ID',
category: 'field',
description: 'Generates normalized (0..1) ID for each element in a domain',
form: 'primitive',
capability: 'identity',
cardinality: {
cardinalityMode: 'preserve',
laneCoupling: 'laneLocal',
broadcastPolicy: 'allowZipSig',
},
inputs: {
domain: { label: 'Domain', type: canonicalType('int') }, // signal input
},
outputs: {
id01: { label: 'ID (0..1)', type: canonicalType('float') }, // IMPORTANT: not signalTypeField
},
lower: ({ ctx }) => {
const instance = ctx.inferredInstance ?? ctx.instance;
if (!instance) throw new Error('FromDomainId requires instance context');

    const id01Field = ctx.b.fieldIntrinsic(instance, 'normalizedIndex', signalTypeField('float', 'default'));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        id01: { k: 'field', id: id01Field, slot, type: outType, stride: strideOf(outType.payload) },
      },
      instanceContext: instance,
    };
},
});

Takeaway: “Field-ness” is not expressed by forcing signalTypeField at the boundary. It is expressed by cardinality rules + lowering kind + instance context.

⸻

Example 4: Payload-generic source with unit-var (Const) — preserve + unit polymorphism on the output type

This is the clean pattern for “generic output type resolved by constraints,” and it does not require hardcoding unit/cardinality into signalTypeField.

registerBlock({
type: 'Const',
label: 'Constant',
category: 'signal',
description: 'Outputs a constant value (type inferred from target)',
form: 'primitive',
capability: 'pure',
cardinality: {
cardinalityMode: 'preserve',
laneCoupling: 'laneLocal',
broadcastPolicy: 'allowZipSig',
},
payload: {
allowedPayloads: { out: ALL_CONCRETE_PAYLOADS },
combinations: ALL_CONCRETE_PAYLOADS.map(p => ({ inputs: [] as PayloadType[], output: p })),
semantics: 'typeSpecific',
},
inputs: {
value: { type: canonicalType('float'), value: 0, exposedAsPort: false },
payloadType: { type: canonicalType('float'), value: undefined, hidden: true, exposedAsPort: false },
},
outputs: {
out: { label: 'Output', type: canonicalType('float', unitVar('const_out')) }, // unit resolved by constraints
},
});

Takeaway: even a generic block does not express polymorphism by choosing signalTypeField; it expresses it with unitVar + solver + preserve.

⸻

The “If you do only one thing” rule for the team

If a block is intended to be cardinality-polymorphic, its primary data ports should be typed with:
•	canonicalType(...) on inputs/outputs
•	cardinalityMode: 'preserve'
•	broadcastPolicy set based on whether mixed sig/field should be allowed

signalTypeField(...) is for hard forcing many at the type boundary, and that should be rare and intentional.

That is the statement.