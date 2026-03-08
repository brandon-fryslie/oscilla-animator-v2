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

- **Event invariants**: temporality=discrete ⇒ payload=bool AND unit=none.
- **Array invariants**: cardinality=many(instance) ⇒ instance identity must be present.
- **Scalar invariants**: cardinality=one ⇒ temporality must be continuous (unless trigger).
- **No var escape**: all axes must be `{ kind: 'inst' }` by the time they reach the gate.

### Principles

**Single Point**: All axis validation happens in one place. Scattered checks throughout the codebase are forbidden.

**No Bypass**: There is no "debug mode" or "preview mode" that relaxes rules.

**Enforce Only True Invariants**: The gate must not over-constrain. If a combination of axes is theoretically valid, the gate should allow it.

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

2. **Array invariants**:
   - cardinality=many(instance) requires a valid InstanceRef.

3. **Scalar invariants**:
   - cardinality=one expressions must have continuous temporality (except for Triggers).

4. **No var escape**:
   - All axes must be `{ kind: 'inst' }` — no unresolved type variables.

---

## AxisViolation

```typescript
type AxisViolation = {
  readonly nodeKind: 'ValueExpr' | 'CanonicalType' | string;
  readonly nodeIndex: number;
  readonly message: string;
};
```

### Example Diagnostics

```
AxisInvalid: ValueExpr at node 42 has temporality=discrete but payload=float.
  Event expressions require payload=bool.
  Block: "MyEventBlock" (block-123), output port "trigger"
```

```
AxisInvalid: ValueExpr at node 17 is classified as many-lane but has cardinality=one.
  Instance-aligned expressions require cardinality=many(instance).
```

### Diagnostic References

Diagnostics reference CanonicalType and existing IDs only.

```typescript
// CORRECT
{ expected: CanonicalType, actual: CanonicalType }

// WRONG - creates hidden type information
{ expectedKind: 'scalar', actualKind: 'array' }
```

---

## The 17 Guardrails

Operational DO/DON'T pairs that encode the enforcement principles.

### G1: Single Authority
- DO NOT invent parallel type structures (OneType, ArrayType, etc.).
- Instead: every value's type is exactly `CanonicalType`.

### G2: Dispatch by Axis
- DO NOT special-case behavior based on old node classes.
- Instead: all dispatch uses `Axis` values and `payloadStride(type.payload)`.

### G3: Axis Shape Contracts Are Non-Negotiable
- DO NOT allow discrete temporality for non-events.
- Instead: enforce via single axis-validation gate.

### G4: Vars Are Inference-Only
- DO NOT let `Axis.kind:'var'` escape frontend into backend/runtime/renderer.

### G5: One Enforcement Gate
- DO NOT scatter ad-hoc axis checks throughout code.

### G6: No Untyped Values
- DO NOT create value-producing nodes without `type: CanonicalType`.

### G7: Const Values Must Be Payload-Shaped
- DO NOT store constants as `number | string | boolean`.
- Instead: discriminated `ConstValue` keyed by payload kind.

### G8: Units Are Canonical
- DO NOT put unit variables inside UnitType.

### G9: Only Explicit Ops Change Axes
- DO NOT mutate extent axes as side-effect of unrelated ops.
- Instead: small named set of ops (broadcast, reduce, state, adapter).

### G10: Instance Identity Lives in Type
- DO NOT attach instanceId as separate property when it's in extent.cardinality.

### G11: Naming and Discriminants Are Consistent
- All IR discriminated unions use `kind`.

### G12: Kernel/Op Contracts Are Type-Driven
- DO NOT have kernel behavior depend on "this came from scalar IR vs array IR".

### G13: Adapter/Lens Policy Separate From Type Soundness
- DO NOT bake auto-insert UX policy into type rules.

### G14: Frontend/Backend Boundary Is Strict
- DO NOT have UI read intermediate compiler globals.

### G15: Diagnostics Can't Create Hidden Types
- DO NOT encode type meaning into diagnostic-only properties.

### G16: No Forbidden Patterns
- DO NOT introduce forbidden type aliases (One, Many, etc.).

### G17: Tests That Make Cheating Impossible
- DO NOT accept "seems fine" without invariant tests.

---

## See Also

- [01-type-system](./01-type-system.md) - Core type definitions
- [INVARIANTS](../INVARIANTS.md) - System-wide invariant rules
