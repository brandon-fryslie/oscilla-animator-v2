---
parent: ../INDEX.md
topic: validation
tier: 2
---

# Validation: Axis Validation Implementation (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [Enforcement Gate](./t1_enforcement-gate.md)
**Related Topics**: [Axes](../axes/), [Type System](../type-system/)

---

## Overview

`validateAxes` is the implementation of the enforcement gate. It takes a set of IR expressions and produces `AxisViolation` diagnostics for any that violate axis-shape contracts.

## validateAxes()

```typescript
function validateAxes(exprs: readonly ValueExpr[]): AxisViolation[];
```

### What It Checks

For each expression:

1. **Event invariants**:
   - temporality=discrete ⇒ payload=bool
   - temporality=discrete ⇒ unit=none
   - Event expressions must have exactly these properties

2. **Field invariants**:
   - Field expressions must have cardinality=many(instance)
   - Instance identity must be present and valid

3. **Signal invariants**:
   - Signal expressions must have cardinality=one (or zero for consts)
   - Signal expressions must have temporality=continuous

4. **No var escape**:
   - All axes must be `{ kind: 'inst' }` — no unresolved type variables

### What It Does NOT Check

- Payload/unit combinations beyond event invariants (most combos are valid)
- Whether adapters should be inserted (that's a separate pass)
- Whether types can be inferred (that's the solver's job)
- Whether the graph makes semantic sense (that's the user's problem)

## AxisViolation (Resolution Q11: generic naming)

```typescript
type AxisViolation = {
  readonly nodeKind: 'ValueExpr' | 'CanonicalType' | string;  // type of node that failed
  readonly nodeIndex: number;   // index of the node
  readonly message: string;     // human-readable description
};
```

**Note**: Resolution Q11 standardized field names to be generic (`nodeKind` + `nodeIndex`) rather than expression-specific (`exprIndex`). The `nodeKind` field identifies the type of IR node, not the violation classification.

## deriveKind Agreement Assertion (Resolutions Q4/Q5)

At lowering and debug boundaries, any variant that carries both a discriminant tag and a `.type: CanonicalType` field must satisfy:

```typescript
// At construction/validation time:
if (hasType(v)) {
  assert(v.tag === deriveKind(v.type));
}
```

This assertion ensures that TypeScript narrowing tags (allowed for ergonomics) never diverge from the canonical type. Tags are permitted ONLY as:
1. TypeScript discriminated union narrowing aids
2. Variants that lack a `.type` field

If a variant has `.type`, the tag MUST agree with `deriveKind(type)`.

## eventRead Type Validation (Resolution Q10)

The axis validator checks that `eventRead` kernel outputs are continuous float signals:
- Output type MUST be `canonicalSignal({ kind: 'float' }, { kind: 'scalar' })`
- The IR builder enforces this at construction time (see [Derived Classifications](../type-system/t2_derived-classifications.md))
- The validator provides defense-in-depth

## AxisInvalid Diagnostic Category

Axis violations are surfaced through the diagnostic system under the `AxisInvalid` category. Each violation produces a diagnostic with:
- Source context (which block, which port)
- Expected vs actual axis values
- Suggested fix (when deterministic)

---

## See Also

- [Enforcement Gate](./t1_enforcement-gate.md) - Foundational principles
- [Diagnostics](./t3_diagnostics.md) - Error message details
- [Axis Invariants](../axes/t1_axis-invariants.md) - The rules being enforced
