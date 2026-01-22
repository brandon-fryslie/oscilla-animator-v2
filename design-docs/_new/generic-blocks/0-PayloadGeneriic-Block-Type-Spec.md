Spec: Payload-Generic Blocks

0. Definition

A Payload-Generic Block is a block whose semantics are defined over a closed set of payload types (e.g. float, vec2, vec3, color, int, bool, unit, phase) such that:
•	The block’s behavior is well-defined for each allowed payload.
•	The compiler selects the correct concrete implementation per payload at compile time.
•	Any disallowed payload is a compile-time type error (never a runtime fallback).

Payload-generic is orthogonal to cardinality-generic: a block may be one, the other, both, or neither.

⸻

1. Formal Contract

A block kind B is payload-generic iff all are true:
1.	Closed admissible payload set
For each input and output port, B declares an explicit set AllowedPayloads(port).
2.	Per-payload specialization is total
For every payload P ∈ AllowedPayloads(port) that can appear after unification, there exists a concrete implementation path for B under P.
3.	No implicit coercions
Payload changes require explicit blocks/kinds (e.g., FloatToVec2, PackVec3, ToColor). Payload-generic blocks must not silently reinterpret or coerce representations.
4.	Deterministic resolution
Given resolved payload types, the compiler’s choice of specialization is deterministic and emits fully specialized IR.

⸻

2. Type System Rules

Payload-generic behavior is entirely compile-time; runtime sees only erased slots.

2.1 Payload unification
•	Ports unify payload by normal propagation/unification rules.
•	If unification yields a payload not in AllowedPayloads for a required port, compilation fails.

2.2 Units are part of the validity check (when present)
If your SignalType includes unit?: NumericUnit:
•	Blocks may declare unit constraints per payload, e.g.:
•	Sin allows float(unit=radians) and phase(unit=phase) but not float(unit=ms).
•	If either side lacks a unit annotation, unit checking is not performed for that value (absence means “no unit validation”), but payload validity is still enforced.

⸻

3. Runtime Semantics

Payload-generic blocks define semantics either:
•	Componentwise: apply the same scalar operator per component
Example: Add(vec3, vec3) = vec3(x1+x2, y1+y2, z1+z2)
•	Type-specific: defined explicitly per payload
Example: Mul(color, float) might be defined as brightness scale; Mul(color, color) might be disallowed.

A payload-generic block must specify which of these it is for each allowed payload combination (see §8 registry metadata).

⸻

4. Compilation Requirements

The compiler must emit fully specialized IR. No runtime dispatch on payload.

4.1 Specialization targets
Each payload specialization must map to exactly one of:
•	An OpCode variant that is payload-aware in its interpreter/kernel (preferred when the op is truly primitive and uniform).
•	A named kernel implementation selected by payload (e.g., kernel: 'normalize_vec3' vs kernel: 'normalize_vec2'), still chosen at compile time.
•	A composed op sequence (PureFn.composed) if and only if it is declared canonical and stable.

4.2 Slot formatting
Slot allocation is determined by the resolved payload:
•	float/int/phase/unit → 1 lane component
•	vec2 → 2 components
•	vec3 → 3 components
•	color → 4 components (RGBA floats unless otherwise specified by your runtime format)

The compiler must know the stride and allocate buffers accordingly. Runtime must not infer stride from payload names.

⸻

5. Validity Shapes (Port Signatures)

Payload-generic validity is defined by signature families, not ad-hoc checks.

A block kind must declare one of these signature forms:
1.	Homogeneous unary: T -> T for T ∈ S
2.	Homogeneous binary: T × T -> T for T ∈ S
3.	Mixed binary (scalar + vector): T × float -> T for T ∈ {vec2, vec3, color} (explicitly declared)
4.	Predicate: T × T -> bool for T ∈ S
5.	Reduction-like (not payload-generic by default): T -> float etc. must be explicit and typically not generic unless the meaning is crisp.

If a block does not match one of these declared forms, it is not payload-generic; it is a family of explicit blocks.

⸻

6. What Is Not Allowed (Hard Constraints)

A block must not be declared payload-generic if it does any of:
1.	Implicit representation reinterpretation
•	Treating vec3 as three unrelated lanes.
•	Treating color as vec4 without specifying color semantics.
•	Treating int as float via implicit cast.
2.	Semantic ambiguity across payloads
Example: “Normalize” is fine for vec2/vec3, but for float it’s ambiguous unless defined as clamp-to-[0,1] with unit rules, which is a different operation.
3.	Partial coverage
“Works for float and vec2, but vec3 ‘later’” is forbidden. Either include vec3 now with an implementation or exclude it now.

⸻

7. Diagnostics (Required)

Compiler must produce explicit errors for payload failures:
•	PAYLOAD_NOT_ALLOWED
•	Payload resolved to a value not supported by block kind at a port.
•	PAYLOAD_COMBINATION_NOT_ALLOWED
•	For multi-input blocks, the pair/tuple is not in the allowed combination table.
•	UNIT_MISMATCH
•	Units present on both sides but disallowed by block’s unit contract.
•	IMPLICIT_CAST_DISALLOWED
•	Any attempt to coerce payload to satisfy a block without an explicit cast block.

Diagnostics must be attributed to the block and the exact ports (TargetRef).

⸻

8. Registry Metadata (Required for Crispness)

Each block kind must declare (table-driven):

8.1 Payload support table
For each port:
•	allowedPayloads: PayloadType[] (explicit, closed)

8.2 Combination rules (for multi-input blocks)
For each admissible input payload tuple:
•	output payload
•	selected implementation (opcode, kernel(name), or composed(opcodes))

Example schema (conceptual):
•	combos: Array<{ in: [P1, P2]; out: Pout; impl: ImplRef }>
•	For unary: in: [P]

8.3 Semantics category
•	semantics: 'componentwise' | 'typeSpecific'
•	If componentwise, declare component count rules and whether ints/bools are allowed.
•	If typeSpecific, the combo table is the source of truth.

8.4 Unit constraints (when applicable)
•	Per combo, optionally declare required/allowed unit annotations:
•	e.g. Sin:
•	float requires unit=radians if present
•	phase requires unit=phase if present

This metadata is compile-time only.

⸻

9. Performance Requirements
   •	All payload specialization is resolved at compile time.
   •	Runtime kernels/opcodes operate on dense arrays with known stride.
   •	No per-lane or per-sample type checks.
   •	No boxing.

⸻

10. Minimal Examples

10.1 Add — homogeneous componentwise
Signature: T × T -> T for T ∈ {float, vec2, vec3}
(Decide explicitly whether color is included; if included, it is componentwise RGBA add and must state clamp policy or “no clamp”.)

Compiler chooses:
•	OpCode.Add_f32 / Add_vec2 / Add_vec3 (or one opcode with known stride), but selection is compile-time.

10.2 Mul — mixed scalar scaling
Signature: T × float -> T for T ∈ {vec2, vec3, color} plus float×float->float
Disallow vec3×vec3 unless you explicitly define it as componentwise multiply.

10.3 Sin — type-specific with unit constraint
Allowed:
•	phase -> float (phase wraps; radians conversion internal)
•	float(unit=radians) -> float
Disallow:
•	float(unit=ms) if unit annotated and not radians.

⸻

This is the full nuts-and-bolts contract: payload-generic blocks are compile-time–specialized over an explicit, closed payload/combination table with explicit diagnostics and no implicit coercions, producing fully specialized IR and dense runtime execution.