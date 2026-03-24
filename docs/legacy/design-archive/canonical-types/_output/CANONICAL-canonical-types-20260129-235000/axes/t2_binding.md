---
parent: ../INDEX.md
topic: axes
tier: 2
---

# Axes: Binding (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [Axis Invariants](./t1_axis-invariants.md)
**Related Topics**: [Type System](../type-system/)

---

## Overview

Binding describes how values attach to identity across time and edits. It governs continuity semantics — whether and how the system preserves associations between values and their referents during hot-swap and state migration.

## BindingValue (Q2 Resolved: NOT a Lattice)

```typescript
type BindingValue =
  | { kind: 'unbound' }
  | { kind: 'weak' }
  | { kind: 'strong' }
  | { kind: 'identity' };
```

**Critical**: BindingValue is **NOT** a lattice. It has **NO ordering**. The values are nominal tags with equality-only semantics.

### Tag Semantics

These are intent labels constraining what operations are allowed, NOT a hierarchy:

- **unbound**: No continuity identity requirement. Safe default. The system makes no promises about preserving associations.
- **weak**: Continuity may attempt association if a referent is available in the operation config (not in the type). Best-effort preservation.
- **strong**: Continuity requires a referent association in the operation config. Missing referent is a compile error in the lowering/validation that consumes that operation.
- **identity**: Continuity must preserve lane identity 1:1 (stable IDs). If identity cannot be established, error.

### What This Is NOT

DO NOT describe binding values as:
- "Stronger" or "weaker" (there is no ordering)
- A "partial order" or "lattice"
- Having "join" or "meet" operations
- Supporting "subtyping" between values

### Unification

During type inference, if two bindings differ and both are instantiated, it is a **type error** (or requires an explicit adapter that declares the axis transform). There is no "choose the stronger binding" logic.

## Referent Removal (A4 Resolved)

**No referent data lives in BindingValue or CanonicalType.** Previously, binding carried referent information. This has been removed.

Referent data now lives in:
- **Continuity policies**: "What prior thing am I preserving against?" is expressed as explicit config (gauge/projector/post args)
- **State/continuity ops**: Binding targets needed by stateful evaluation are carried as explicit args on state operations

**Binding axis stays clean**: Just 4 nominal tags with no IDs, pointers, or referents.

## Enforcement

Since there's no ordering:
- In continuity/state lowering: if an op requires weak|strong|identity, it validates the necessary config is present
- In axis validation: binding may be `var` during inference, but by backend IR emit time it must be `inst`
- Adapters that change binding must be explicit and declare the transform in their AdapterSpec

---

## See Also

- [Axis Invariants](./t1_axis-invariants.md) - I4 (state scoping)
- [Perspective](./t2_perspective.md) - Coordinate frame axis
- [Branch](./t2_branch.md) - History worldline axis
