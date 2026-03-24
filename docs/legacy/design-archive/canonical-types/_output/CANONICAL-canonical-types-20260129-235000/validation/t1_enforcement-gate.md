---
parent: ../INDEX.md
topic: validation
tier: 1
---

# Validation: Enforcement Gate (Foundational)

> **Tier 1**: Cannot change. Would make this a different application.

**Related Topics**: [Axes](../axes/), [Type System](../type-system/), [Principles](../principles/)
**Key Terms**: [validateAxes](../GLOSSARY.md#validateaxes), [AxisViolation](../GLOSSARY.md#axisviolation)

---

## The Gate

There is exactly ONE enforcement point for axis validity in the entire system. It runs after normalization and type inference, before backend compilation. Nothing enters the backend without passing this gate.

### What the Gate Enforces

The gate enforces **axis-shape contracts** — the rules governing which combinations of extent axes are valid for which expression families:

- **Event invariants**: temporality=discrete ⇒ payload=bool AND unit=none (hard invariant)
- **Field invariants**: cardinality must be many(instance) for field expressions
- **Signal invariants**: cardinality must be one for signal expressions
- **No var escape**: all axes must be `{ kind: 'inst' }` by the time they reach the gate (no unresolved type variables)

### What the Gate Does NOT Do

- **No inference**: The gate does not infer or fix types — it only validates
- **No adapter insertion**: The gate does not insert adapters — that's a separate frontend transform
- **No coercion**: The gate does not silently convert types — violations are errors
- **No over-enforcement**: The gate enforces TRUE invariants, not "convenient expectations"

## Principles of Enforcement

### Single Point

All axis validation happens in one place. Scattered checks throughout the codebase are forbidden — they will diverge from the gate and create confusion about what's actually valid.

Small local asserts at API boundaries are allowed as defense-in-depth, but they must be strict subsets of what the gate checks. If a local assert fires and the gate didn't catch it, the gate has a bug.

### No Bypass

There is no "debug mode" that skips validation. There is no "preview mode" that relaxes rules. If compilation is partial (e.g., for editor feedback), the output is explicitly tagged as "unvalidated" and backend code refuses to consume it.

### Enforce Only True Invariants

The gate must not over-constrain. If a combination of axes is theoretically valid but unusual, the gate should allow it. The gate's job is to catch violations of the documented invariants (I1-I5), not to enforce taste or convention.

## The 17 Guardrails

These operational rules encode the enforcement principles into concrete DO/DON'T pairs for developers and agents. The principles (above) are foundational and cannot change. The specific guardrail implementations (below) are structural — they express the principles in actionable form.

### Guardrail 1: Single Authority
- DO NOT invent parallel type structures (SignalType, PortType, etc.)
- Instead: every value's type is exactly `CanonicalType = { payload, unit, extent }`

### Guardrail 2: Derived Kind Is Total and Deterministic
- DO NOT special-case signal/field/event based on node classes
- Instead: all dispatch uses `deriveKind(type)` and/or `payloadStride(type.payload)`

### Guardrail 3: Axis Shape Contracts Are Non-Negotiable
- DO NOT allow "signal with cardinality many" or "field with cardinality one" post-validation
- DO NOT allow discrete temporality for non-events
- Instead: enforce via single axis-validation gate before backend compilation

### Guardrail 4: Vars Are Inference-Only
- DO NOT let `Axis.kind:'var'` escape frontend into backend/runtime/renderer
- DO NOT treat var as "default"
- Instead: constructors produce `inst` values; after type solve, all axes are `inst`

### Guardrail 5: One Enforcement Gate
- DO NOT scatter ad-hoc axis checks throughout code
- DO NOT bypass validation in debug/preview/partial compile paths
- Instead: one gate + small local asserts at boundaries

### Guardrail 6: No Untyped Values
- DO NOT create value-producing nodes without `type: CanonicalType`
- Instead: type is mandatory on every ValueExpr variant

### Guardrail 7: Const Values Must Be Payload-Shaped
- DO NOT store constants as `number | string | boolean`
- Instead: discriminated `ConstValue` keyed by payload kind

### Guardrail 8: Units Are Canonical, Not Inference Junk
- DO NOT put unit variables inside UnitType
- DO NOT interpret unit semantics outside adapters/lenses
- Instead: only explicit ops change unit; solver tracks UnitVarId separately

### Guardrail 9: Only Explicit Ops Change Axes
- DO NOT mutate extent axes as side-effect of unrelated ops
- DO NOT implicitly convert signal↔field/event in evaluator
- Instead: small named set of ops (broadcast, reduce, state, adapter)

### Guardrail 10: Instance Identity Lives in Type
- DO NOT attach instanceId as separate field when it's in extent.cardinality
- DO NOT use `string` for IDs when branded IDs exist
- Instead: `requireManyInstance(type)` extracts identity

### Guardrail 11: Naming and Discriminants Are Consistent
- DO NOT introduce mixed discriminants across IR unions
- Instead: all IR discriminated unions use `kind`; ValueExpr uses `kind`
- DO NOT introduce snake_case discriminant values; use camelCase

### Guardrail 12: Kernel/Op Contracts Are Type-Driven
- DO NOT have kernel behavior depend on "this came from signal IR vs field IR"
- Instead: kernel behavior defined by CanonicalType only; stride from `payloadStride`

### Guardrail 13: Adapter/Lens Policy Separate From Type Soundness
- DO NOT bake auto-insert UX policy into type rules
- Instead: adapter insertion is a frontend transform using explicit blocks

### Guardrail 14: Frontend/Backend Boundary Is Strict
- DO NOT have UI read intermediate compiler globals
- Instead: UI reads pass snapshots and validated frontend artifacts

### Guardrail 15: Diagnostics Can't Create Hidden Types
- DO NOT encode type meaning into diagnostic-only fields
- Instead: diagnostics reference CanonicalType and existing IDs only

### Guardrail 16: Migration Hygiene
- DO NOT keep legacy type aliases alive indefinitely
- Instead: hard-deprecate and delete; enforce via CI/grep

### Guardrail 17: Tests That Make Cheating Impossible
- DO NOT accept "seems fine" without invariant tests
- Instead: tests that fail if a second type system appears, if Axis.var escapes backend, if deriveKind isn't total

---

## See Also

- [Axis Invariants](../axes/t1_axis-invariants.md) - The rules being enforced
- [Axis Validation Implementation](./t2_axis-validate.md) - How the gate is implemented
- [Diagnostics](./t3_diagnostics.md) - Error message formats
