---
parent: ../INDEX.md
topic: type-validation
order: 20
---

# Type Validation (Enforcement Gate & Guardrails)

> Single enforcement point for axis validity and type system integrity.

**Related Topics**: [01-type-system](./01-type-system.md), [04-compilation](./04-compilation.md), [21-adapter-system](./21-adapter-system.md)
**Key Terms**: [validateAxes](../GLOSSARY.md#validateaxes), [AxisViolation](../GLOSSARY.md#axisviolation), [CanonicalType](../GLOSSARY.md#canonicaltype)
**Relevant Invariants**: [I32-I36](../INVARIANTS.md#i32-single-type-authority)

---

## Overview

There is exactly ONE enforcement point for axis validity in the entire system. It runs after normalization and type inference, before backend compilation. Nothing enters the backend without passing this gate.

---

## The Enforcement Gate

### What the Gate Enforces

Axis-shape contracts — the rules governing which combinations of extent axes are valid:

- **Event invariants**: temporality=discrete ⇒ payload=bool AND unit=none (hard invariant)
- **Field invariants**: cardinality must be many(instance) for field expressions
- **Signal invariants**: cardinality must be one for signal expressions
- **No var escape**: all axes must be `{ kind: 'inst' }` by the time they reach the gate

### What the Gate Does NOT Do

- **No inference**: The gate does not infer or fix types — it only validates
- **No adapter insertion**: The gate does not insert adapters — that's a separate frontend transform
- **No coercion**: The gate does not silently convert types — violations are errors
- **No over-enforcement**: The gate enforces TRUE invariants, not "convenient expectations"

### Principles

**Single Point**: All axis validation happens in one place. Scattered checks throughout the codebase are forbidden — they will diverge from the gate. Small local asserts at API boundaries are allowed as defense-in-depth, but they must be strict subsets of what the gate checks.

**No Bypass**: There is no "debug mode" that skips validation. There is no "preview mode" that relaxes rules. If compilation is partial, the output is explicitly tagged as "unvalidated" and backend code refuses to consume it.

**Enforce Only True Invariants**: The gate must not over-constrain. If a combination of axes is theoretically valid but unusual, the gate should allow it.

---

## validateAxes()

```typescript
function validateAxes(exprs: readonly ValueExpr[]): AxisViolation[];
```

### Checks

For each expression:

1. **Event invariants**:
   - temporality=discrete ⇒ payload=bool
   - temporality=discrete ⇒ unit=none

2. **Field invariants**:
   - Field expressions must have cardinality=many(instance)
   - Instance identity must be present and valid

3. **Signal invariants**:
   - Signal expressions must have cardinality=one (or zero for consts)
   - Signal expressions must have temporality=continuous

4. **No var escape**:
   - All axes must be `{ kind: 'inst' }` — no unresolved type variables

### Does NOT Check

- Payload/unit combinations beyond event invariants (most combos are valid)
- Whether adapters should be inserted (that's a separate pass)
- Whether types can be inferred (that's the solver's job)
- Whether the graph makes semantic sense (that's the user's problem)

---

## AxisViolation

```typescript
type AxisViolation = {
  readonly nodeKind: 'ValueExpr' | 'CanonicalType' | string;
  readonly nodeIndex: number;
  readonly message: string;
};
```

### AxisInvalid Diagnostic Category

All axis violations surface through the diagnostic system under `AxisInvalid`. Each diagnostic includes:

- **Source context**: Block ID, port ID where the violation originated
- **Expected**: What the axis value should be
- **Actual**: What was found
- **Suggestion**: When the fix is deterministic

### Example Diagnostics

```
AxisInvalid: ValueExpr at node 42 has temporality=discrete but payload=float.
  Event expressions require payload=bool.
  Block: "MyEventBlock" (block-123), output port "trigger"
```

```
AxisInvalid: ValueExpr at node 17 is classified as field but has cardinality=one.
  Field expressions require cardinality=many(instance).
  Block: "FieldGenerator" (block-456), output port "values"
```

```
AxisInvalid: ValueExpr at node 5 has unresolved type variable in cardinality axis.
  All axes must be instantiated before backend compilation.
  Block: "MathAdd" (block-789), output port "result"
```

### Diagnostic References

Diagnostics reference CanonicalType and existing IDs only — no "hidden types" encoded in diagnostic fields (Guardrail 15).

```typescript
// CORRECT
{ expected: CanonicalType, actual: CanonicalType }

// WRONG - creates hidden type information
{ expectedKind: 'signal', actualKind: 'field' }
```

---

## BindingMismatchError

Structured diagnostic for binding axis unification failures.

```typescript
type BindingMismatchError = {
  readonly left: BindingValue;
  readonly right: BindingValue;
  readonly location: { blockId: BlockId; portId: PortId };
  readonly remedy: 'insert-state-op' | 'insert-continuity-op' | 'rewire';
};
```

---

## deriveKind Agreement Assertion

At lowering and debug boundaries, any variant that carries both a discriminant tag and a `.type: CanonicalType` field must satisfy:

```typescript
if (hasType(v)) {
  assert(v.tag === deriveKind(v.type));
}
```

Tags are permitted ONLY as TypeScript discriminated union narrowing aids or for variants that lack a `.type` field. If a variant has `.type`, the tag MUST agree with `deriveKind(type)`.

---

## eventRead Type Validation

The axis validator checks that `eventRead` kernel outputs are continuous float signals:
- Output type MUST be `canonicalSignal({ kind: 'float' }, { kind: 'scalar' })`
- The IR builder enforces this at construction time
- The validator provides defense-in-depth

---

## The 17 Guardrails

Operational DO/DON'T pairs that encode the enforcement principles into concrete rules. The principles (gate, no bypass, true invariants) are foundational and cannot change. The specific guardrail implementations express the principles in actionable form.

### G1: Single Authority
- DO NOT invent parallel type structures (SignalType, PortType, etc.)
- Instead: every value's type is exactly `CanonicalType = { payload, unit, extent }`

### G2: Derived Kind Is Total and Deterministic
- DO NOT special-case signal/field/event based on node classes
- Instead: all dispatch uses `deriveKind(type)` and/or `payloadStride(type.payload)`

### G3: Axis Shape Contracts Are Non-Negotiable
- DO NOT allow "signal with cardinality many" or "field with cardinality one" post-validation
- DO NOT allow discrete temporality for non-events
- Instead: enforce via single axis-validation gate before backend compilation

### G4: Vars Are Inference-Only
- DO NOT let `Axis.kind:'var'` escape frontend into backend/runtime/renderer
- DO NOT treat var as "default"
- Instead: constructors produce `inst` values; after type solve, all axes are `inst`

### G5: One Enforcement Gate
- DO NOT scatter ad-hoc axis checks throughout code
- DO NOT bypass validation in debug/preview/partial compile paths
- Instead: one gate + small local asserts at boundaries

### G6: No Untyped Values
- DO NOT create value-producing nodes without `type: CanonicalType`
- Instead: type is mandatory on every ValueExpr variant

### G7: Const Values Must Be Payload-Shaped
- DO NOT store constants as `number | string | boolean`
- Instead: discriminated `ConstValue` keyed by payload kind

### G8: Units Are Canonical, Not Inference Junk
- DO NOT put unit variables inside UnitType
- DO NOT interpret unit semantics outside adapters/lenses
- Instead: only explicit ops change unit; solver tracks UnitVarId separately

### G9: Only Explicit Ops Change Axes
- DO NOT mutate extent axes as side-effect of unrelated ops
- DO NOT implicitly convert signal↔field/event in evaluator
- Instead: small named set of ops (broadcast, reduce, state, adapter)

### G10: Instance Identity Lives in Type
- DO NOT attach instanceId as separate field when it's in extent.cardinality
- DO NOT use `string` for IDs when branded IDs exist
- Instead: `requireManyInstance(type)` extracts identity

### G11: Naming and Discriminants Are Consistent
- DO NOT introduce mixed discriminants across IR unions
- Instead: all IR discriminated unions use `kind`; ValueExpr uses `kind`
- DO NOT introduce snake_case discriminant values; use camelCase

### G12: Kernel/Op Contracts Are Type-Driven
- DO NOT have kernel behavior depend on "this came from signal IR vs field IR"
- Instead: kernel behavior defined by CanonicalType only; stride from `payloadStride`

### G13: Adapter/Lens Policy Separate From Type Soundness
- DO NOT bake auto-insert UX policy into type rules
- Instead: adapter insertion is a frontend transform using explicit blocks

### G14: Frontend/Backend Boundary Is Strict
- DO NOT have UI read intermediate compiler globals
- Instead: UI reads pass snapshots and validated frontend artifacts

### G15: Diagnostics Can't Create Hidden Types
- DO NOT encode type meaning into diagnostic-only fields
- Instead: diagnostics reference CanonicalType and existing IDs only

### G16: No Forbidden Patterns
- DO NOT introduce forbidden type aliases (see GLOSSARY Forbidden Terms)
- Instead: enforce via CI gate test; see [appendices/type-system-migration.md](../appendices/type-system-migration.md)

### G17: Tests That Make Cheating Impossible
- DO NOT accept "seems fine" without invariant tests
- Instead: tests that fail if a second type system appears, if Axis.var escapes backend, if deriveKind isn't total

---

## See Also

- [01-type-system](./01-type-system.md) - Core type definitions
- [21-adapter-system](./21-adapter-system.md) - Adapter matching and transforms
- [07-diagnostics-system](./07-diagnostics-system.md) - How diagnostics are surfaced
- [INVARIANTS](../INVARIANTS.md) - System-wide invariant rules
