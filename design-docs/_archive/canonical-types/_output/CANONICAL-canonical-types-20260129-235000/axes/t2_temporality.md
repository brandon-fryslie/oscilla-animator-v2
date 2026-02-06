---
parent: ../INDEX.md
topic: axes
tier: 2
---

# Axes: Temporality (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [Axis Invariants](./t1_axis-invariants.md)
**Related Topics**: [Type System](../type-system/), [Validation](../validation/)

---

## Overview

Temporality describes which evaluation clock governs a value's presence and updates. It is the axis that distinguishes events from continuous values.

## TemporalityValue

```typescript
type TemporalityValue =
  | { kind: 'continuous' }
  | { kind: 'discrete' };
```

### continuous

The value is defined for every frame. Signals and fields are continuous.

### discrete

The value is defined only at ticks/edges — it represents an event occurrence. Between ticks, the value does not exist (or is "no event").

## Event Hard Invariants

**Discrete temporality implies event semantics.** These are hard invariants enforced by the validation gate:

- `temporality=discrete` ⇒ `payload=bool` (always)
- `temporality=discrete` ⇒ `unit=none` (always)

An event's bool payload means: `true` = event fired this frame, `false` = no event.

There are no "discrete float" or "discrete vec3" values. If you need a value that changes at event boundaries, use a continuous value gated by an event (via `eventRead` kernel producing float 0.0/1.0).

## Event Read Pattern (N5 Resolved)

`SigExprEventRead` (legacy) maps to `ValueExprKernel` with `kernelId('eventReadScalar01')`:

- **Output type**: `canonicalSignal({ kind: 'float' }, { kind: 'scalar' })` — float, not bool
- **Semantics**: 1.0 on frames where event fires, 0.0 otherwise
- **Temporality**: The output is CONTINUOUS (it's a signal that reads an event, not an event itself)

This is the canonical pattern for "reading" an event as a continuous value.

---

## See Also

- [Axis Invariants](./t1_axis-invariants.md) - I3 (centralized enforcement)
- [Cardinality](./t2_cardinality.md) - The other primary classification axis
- [Enforcement Gate](../validation/t1_enforcement-gate.md) - Where event invariants are enforced
