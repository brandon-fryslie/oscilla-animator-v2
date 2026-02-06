---
parent: ../INDEX.md
topic: migration
tier: 3
---

# Migration: Rules for New Types (Optional)

> **Tier 3**: Use it or don't. Change freely if something works better.

**Context**: Governance rules preventing regression after migration.

---

## 12 Rules for New Types

These rules prevent "old world" patterns from leaking back into the codebase:

### 1. Every new type MUST compose with CanonicalType
No standalone type representations. If it carries type info, it references CanonicalType.

### 2. No "kind" field that duplicates DerivedKind
If you need signal/field/event classification, call `deriveKind()`.

### 3. No flat unit kinds
New units use the structured UnitType (e.g., `{ kind: 'space', space: 'uv', dims: 2 }`).

### 4. No instance ID outside CanonicalType.extent.cardinality
Instance identity has one home. Use `requireManyInstance()` to extract it.

### 5. No new expression families
Everything is ValueExpr. New expression kinds become new kernelIds, not new union variants (unless architecturally justified and approved).

### 6. No untyped value nodes
Every value-producing node carries `type: CanonicalType`.

### 7. No discriminant name surprises
New discriminated unions use `kind` as the discriminant field name.

### 8. No unit variables in canonical types
Unit inference uses solver-internal structures, not `{ kind: 'var' }` in UnitType.

### 9. No referent data in binding axis
Binding is just 4 nominal tags. Referent info goes in continuity/state op args.

### 10. No implicit axis transforms
New operations that change axes must declare the transform explicitly.

### 11. No bypass of validation gate
New expression types must be validated by `validateAxes()`.

### 12. No legacy type aliases
Do not reintroduce `SignalType`, `PortType`, `FieldType`, `EventType`, or `ResolvedPortType`.

## Code Review Litmus Tests

When reviewing a PR, ask:
- Does this introduce a parallel type representation? (Rule 1)
- Does this store DerivedKind as authoritative data? (Rule 2)
- Does this add instanceId as a separate field? (Rule 4)
- Does this bypass the validation gate? (Rule 11)

If the answer to any is "yes," the PR needs architectural review.

---

## See Also

- [Definition of Done](./t3_definition-of-done.md) - Migration completion checklist
- [Single Authority](../principles/t1_single-authority.md) - The principle these rules protect
