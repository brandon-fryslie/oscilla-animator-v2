---
parent: ../INDEX.md
topic: validation
tier: 3
---

# Validation: Diagnostics (Optional)

> **Tier 3**: Use it or don't. Change freely if something works better.

**Context**: Error message formats and diagnostic patterns for axis validation.

---

## AxisViolation Diagnostic (Resolution Q11: generic naming)

```typescript
type AxisViolation = {
  readonly nodeKind: 'ValueExpr' | 'CanonicalType' | string;  // type of node that failed
  readonly nodeIndex: number;   // index of the node
  readonly message: string;     // human-readable description
};
```

## AxisInvalid Category

All axis violations surface through the diagnostic system under `AxisInvalid`. Each diagnostic includes:

- **Source context**: Block ID, port ID where the violation originated
- **Expected**: What the axis value should be (e.g., `temporality=discrete`)
- **Actual**: What was found (e.g., `temporality=continuous`)
- **Suggestion**: When the fix is deterministic (e.g., "event requires payload=bool")

## Example Diagnostics

### Event payload mismatch
```
AxisInvalid: ValueExpr at node 42 has temporality=discrete but payload=float.
  Event expressions require payload=bool.
  Block: "MyEventBlock" (block-123), output port "trigger"
```

### Field cardinality mismatch
```
AxisInvalid: ValueExpr at node 17 is classified as field but has cardinality=one.
  Field expressions require cardinality=many(instance).
  Block: "FieldGenerator" (block-456), output port "values"
```

### Unresolved type variable
```
AxisInvalid: ValueExpr at node 5 has unresolved type variable in cardinality axis.
  All axes must be instantiated before backend compilation.
  Block: "MathAdd" (block-789), output port "result"
```

## Diagnostic References

Diagnostics reference CanonicalType and existing IDs only — no "hidden types" encoded in diagnostic fields (Guardrail 15).

```typescript
// CORRECT
{ expected: CanonicalType, actual: CanonicalType }

// WRONG - creates hidden type information
{ expectedKind: 'signal', actualKind: 'field' }
```

## BindingMismatchError (Resolution Q9)

Structured diagnostic for binding axis unification failures. Replaces generic `AxisUnificationError` for binding-specific cases.

```typescript
type BindingMismatchError = {
  readonly left: BindingValue;
  readonly right: BindingValue;
  readonly location: { blockId: BlockId; portId: PortId };
  readonly remedy: 'insert-state-op' | 'insert-continuity-op' | 'rewire';
};
```

**Behavior**:
- Type solver catches binding mismatches internally
- Frontend emits structured `BindingMismatchError` diagnostic entries
- No "needs adapter" suggestion unless an explicit binding-changing op is registered
- Remedy field suggests the most likely fix

**Example**:
```
BindingMismatch: Cannot unify binding=strong with binding=unbound.
  Left: output port "state" on "Lag" (block-101) — binding=strong
  Right: input port "value" on "MathAdd" (block-202) — binding=unbound
  Remedy: insert-state-op (wrap with explicit state boundary)
```

---

## See Also

- [Axis Validation](./t2_axis-validate.md) - Implementation that produces these diagnostics
- [Enforcement Gate](./t1_enforcement-gate.md) - Guardrail 15 (no hidden types in diagnostics)
- [Binding](../axes/t2_binding.md) - Binding axis semantics (NOT a lattice)
