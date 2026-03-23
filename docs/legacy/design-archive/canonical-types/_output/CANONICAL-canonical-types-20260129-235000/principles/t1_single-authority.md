---
parent: ../INDEX.md
topic: principles
tier: 1
---

# Principles: Single Type Authority (Foundational)

> **Tier 1**: Cannot change. Would make this a different application.

**Related Topics**: [Type System](../type-system/), [Validation](../validation/)
**Key Terms**: [CanonicalType](../GLOSSARY.md#canonicaltype), [DerivedKind](../GLOSSARY.md#derivedkind)

---

## The Core Principle

**CanonicalType is the ONLY type authority for all values in the system.**

Every value — whether it represents a signal, a field, an event, a constant, or any future classification — has exactly one type: `CanonicalType`. There is no second type system, no parallel representation, no "also stores type info" field.

## What This Means

### One Representation

```typescript
CanonicalType = { payload: PayloadType, unit: UnitType, extent: Extent }
```

This triple — payload, unit, extent — completely describes any value's type. Nothing else is needed. Nothing else is authoritative.

### Signal/Field/Event Are Derived, Not Stored

The classifications "signal," "field," and "event" are **derived** from CanonicalType axes using `deriveKind()`. They are NEVER stored as authoritative data.

```typescript
// CORRECT: derive classification from type
if (deriveKind(type) === 'field') { ... }

// WRONG: store classification as authoritative
interface Port { kind: 'signal' | 'field' | 'event'; ... }  // VIOLATION
```

### No Parallel Type Systems

If you find yourself creating `SignalType`, `PortType`, `FieldType`, `EventType`, or any structure that carries type-like information alongside or instead of `CanonicalType`, you are creating a second type system. This is a foundational violation.

## Invariants

### I1: No Field Duplicates Type Authority

**Rule**: No field, property, or data structure may store information that duplicates what CanonicalType already expresses.

**Rationale**: Duplicate type information will drift. When it drifts, you get "the type says signal but the kind field says field" bugs that are invisible until production.

**Consequences of Violation**: Type confusion, incorrect dispatch, silent data corruption, adapter insertion failures.

### I2: Only Explicit Ops Change Axes

**Rule**: Extent axes (cardinality, temporality, binding, perspective, branch) may only be changed by a small, named set of explicit operations (broadcast, reduce, state ops, adapters). Ordinary computation preserves extent.

**Rationale**: If any operation can silently change an axis, the type system cannot track what a value "is" through the graph.

**Consequences of Violation**: A math kernel that silently converts signal→field breaks all downstream type assumptions.

### I3: Axis Enforcement Is Centralized

**Rule**: There is exactly one enforcement gate — a single frontend validation pass — that decides whether an IR is valid. No scattered ad-hoc checks.

**Rationale**: Scattered checks will disagree. One gate ensures one answer.

**Consequences of Violation**: "Works in debug but fails in prod" or "passes validation but runtime crashes."

## Why This Cannot Change

Without single type authority:
- Every subsystem needs its own type representation → N representations that drift
- Type-dependent dispatch (kernels, adapters, continuity) becomes "which type do I trust?"
- Refactoring any type concept requires updating N places instead of 1
- Testing type invariants requires testing N systems, not 1

This principle is what makes the type system a *system* rather than a collection of ad-hoc type checks.

---

## See Also

- [CanonicalType Definition](../type-system/t1_canonical-type.md) - The foundational type shape
- [Axis Invariants](../axes/t1_axis-invariants.md) - Rules governing extent axes
- [Enforcement Gate](../validation/t1_enforcement-gate.md) - How this principle is enforced
