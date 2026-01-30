---
parent: ../INDEX.md
topic: axes
tier: 1
---

# Axes: Invariants (Foundational)

> **Tier 1**: Cannot change. Would make this a different application.

**Related Topics**: [Type System](../type-system/), [Validation](../validation/)
**Key Terms**: [Extent](../GLOSSARY.md#extent), [DerivedKind](../GLOSSARY.md#derivedkind)

---

## Overview

The 5-axis extent system has inviolable rules that govern how axes behave across the entire system. These invariants are the foundation of type soundness.

## Invariant I1: Single Authority — No Duplicate Type Storage

**Rule**: No field, property, or data structure may store information that duplicates what CanonicalType already expresses. Instance identity lives in `extent.cardinality` (as `many(instanceRef)`), not as a separate `instanceId` field.

**Rationale**: If instance identity exists both in the type's cardinality axis AND as a separate field, they will drift. One update path will miss the other.

**Enforcement**:
- `requireManyInstance(type)` extracts instance identity from the type — no separate field needed
- Code review and CI checks reject `instanceId` fields on expressions that already carry `type: CanonicalType`

**Consequences of Violation**: Field expressions with mismatched instance identity between their type and their instanceId field → runtime dispatches to wrong lane buffer.

## Invariant I2: Only Explicit Ops Change Axes

**Rule**: Extent axes may only be changed by a small, named set of explicit operations:
- **Broadcast**: cardinality one → many
- **Reduce**: cardinality many → one
- **State ops**: may change binding semantics
- **Adapters**: explicitly declared axis transforms

Ordinary computation (math kernels, constructors, getters) preserves all extent axes from inputs to output.

**Rationale**: If arbitrary operations could change axes, the type system cannot predict what a value "is" at any point in the graph.

**Enforcement**: Kernel contracts are type-driven — a kernel's output extent is determined by its input extents and its declared transform, never by "what kind of IR node this came from."

**Consequences of Violation**: Silent signal→field conversion in a math kernel → downstream code expects 1 value but gets N lanes.

## Invariant I3: Axis Enforcement Is Centralized

**Rule**: There is exactly one enforcement gate — a single frontend validation pass (`validateAxes`) — that decides whether IR is valid. Small local asserts at boundaries are permitted as defense-in-depth, but the gate is the authority.

**Rationale**: Multiple enforcement points will disagree on edge cases. One gate means one truth.

**Additional constraints**:
- No bypass in "debug", "preview", or "partial compile" paths
- If compilation is partial, output must be explicitly tagged as "unvalidated"
- UI tooling can view incomplete graphs, but backend compile requires validated artifacts

**Consequences of Violation**: "Passes the check in module A but fails in module B" → developer whack-a-mole with validation.

## Invariant I4: State Is Scoped by Axes

**Rule**: Runtime storage is keyed by branch + instance lane identity. State operations must respect axis scoping — a value in branch A cannot silently read state from branch B.

**Rationale**: Preview, undo, and speculative execution rely on branch isolation. Instance identity relies on lane isolation.

**Consequences of Violation**: Preview changes corrupt main state, or undo accidentally uses prediction values.

## Invariant I5: Const Literal Matches Payload

**Rule**: `ConstValue` is a discriminated union keyed by payload kind. A const value's kind must match its CanonicalType's payload kind. Constants are NOT stored as `number | string | boolean`.

**Rationale**: Untyped constants bypass the type system. `3.14` could be a float, a norm01, an angle-in-radians — the type is what gives it meaning.

**Enforcement**: `constValueMatchesPayload()` validation.

**Consequences of Violation**: A bool constant with payload=float → runtime interprets `true` as `1.0` silently, or crashes on type mismatch.

---

## See Also

- [Single Authority Principle](../principles/t1_single-authority.md) - The foundational principle
- [Cardinality](./t2_cardinality.md) - Instance identity axis
- [Enforcement Gate](../validation/t1_enforcement-gate.md) - How invariants are enforced
