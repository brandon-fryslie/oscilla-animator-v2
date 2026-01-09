---
parent: INDEX.md
---

# Resolution Log

> Record of key decisions made during canonicalization.

This document preserves the rationale for important decisions.
If you're wondering "why is it this way?", check here.

---

## Decision Summary

| ID | Decision | Resolution | Rationale |
|----|----------|------------|-----------|
| D1 | Stateful primitive count | 4 MVP + 1 post-MVP | UnitDelay, Lag, Phasor, SampleAndHold; Accumulator later |
| D2 | Lag status | Primitive | Technically composite but distinction arbitrary |
| D3 | Phasor vs Accumulator | Distinct | Different semantics: wrap vs unbounded |
| D4 | Custom combine modes | Removed | Complexity not worth benefit |
| D5 | Domain on wires | Compile-time resource | Runtime performance, cleaner types |
| D6 | World replacement | Split into 5 axes | Clean separation of concerns |
| D7 | Optional fields | Discriminated unions | TypeScript narrowing, explicit defaults |
| D8 | Block.type naming | Rename to Block.kind | Reserve `type` for type system |
| D9 | Role naming | `derived` not `structural` | Better describes system-generated |
| D10 | Default sources | Useful values not zeros | Animation should move by default |

---

## Detailed Decisions

### D1: Stateful Primitive Count (4 vs 5)

**Category**: Critical Contradiction

**The Problem**:
Different documents listed different stateful primitive counts. Some included Accumulator, others didn't.

**Options Considered**:

1. **3 primitives** (UnitDelay, Phasor, SampleAndHold)
   - Pros: Minimal set
   - Cons: Missing smoothing (Lag)

2. **4 primitives** (+ Lag)
   - Pros: Covers common use cases
   - Cons: Lag is technically composite

3. **5 primitives** (+ Accumulator)
   - Pros: Complete set
   - Cons: Can defer Accumulator

**Resolution**: 4 MVP + 1 post-MVP

**Rationale**: UnitDelay, Lag, Phasor, SampleAndHold cover MVP needs. Accumulator (unbounded sum) can wait for post-MVP.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D2: Lag as Primitive vs Composite

**Category**: High-Impact Ambiguity

**The Problem**:
Lag can be implemented using UnitDelay + arithmetic. Should it be a primitive?

**Options Considered**:

1. **Primitive**: First-class stateful block
   - Pros: Common operation, cleaner API
   - Cons: Technically redundant

2. **Composite**: Built from UnitDelay
   - Pros: Minimal primitive set
   - Cons: Harder to optimize, less clear intent

**Resolution**: Lag IS a primitive

**Rationale**: The distinction between "true primitive" and "labeled composite" is arbitrary for this system. Practical value wins.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D3: Phasor vs Accumulator Identity

**Category**: Critical Contradiction

**The Problem**:
Some docs used Phasor and Accumulator interchangeably. Are they the same?

**Options Considered**:

1. **Same block**: Phasor = Accumulator with wrap
   - Pros: Simpler
   - Cons: Conflates different semantics

2. **Distinct blocks**: Different purposes
   - Pros: Clear semantics
   - Cons: Two similar blocks

**Resolution**: Distinct

**Rationale**:
- Phasor: 0..1 phase accumulator with wrap
- Accumulator: `y(t) = y(t-1) + x(t)`, unbounded

Different semantics require different blocks.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D4: Custom Combine Mode Registry

**Category**: High-Impact Ambiguity

**The Problem**:
Should users be able to define custom combine modes?

**Options Considered**:

1. **Allow custom**: User-defined combine functions
   - Pros: Flexibility
   - Cons: Complexity, testing burden, performance

2. **Built-in only**: Fixed set of combine modes
   - Pros: Predictable, optimizable
   - Cons: Less flexible

**Resolution**: Built-in only, no custom registry

**Rationale**: The complexity of custom combine modes is not worth the marginal benefit. Built-in modes cover practical cases.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D5: Domain as Wire Value vs Compile-Time Resource

**Category**: High-Impact Ambiguity

**The Problem**:
Should Domain flow on wires like other values?

**Options Considered**:

1. **Wire value**: Domain can be connected and passed
   - Pros: Uniform model
   - Cons: Runtime overhead, unclear semantics

2. **Compile-time resource**: Domain is patch-level declaration
   - Pros: No runtime overhead, clear semantics
   - Cons: Less dynamic

**Resolution**: Compile-time resource

**Rationale**: Domain defines topology, not data flow. Runtime performance requires domain to be loop bounds, not objects.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D6: World Replacement Strategy

**Category**: Type System (v2.5)

**The Problem**:
The `World` enum conflated multiple concerns (cardinality, temporality).

**Options Considered**:

1. **Keep World**: Add more variants
   - Pros: Minimal change
   - Cons: Continues conflation

2. **Split into axes**: 5 independent coordinates
   - Pros: Clean separation
   - Cons: More complex type

**Resolution**: Split into 5 axes (Cardinality, Temporality, Binding, Perspective, Branch)

**Rationale**: Orthogonal axes allow independent evolution and cleaner reasoning. Binding/Perspective/Branch are defaults-only in v0 but enable future features.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D7: Optional Fields vs Discriminated Unions

**Category**: Type System (v2.5)

**The Problem**:
How to represent "default unless specified"?

**Options Considered**:

1. **Optional fields**: `domain?: DomainRef`
   - Pros: Simple syntax
   - Cons: No type narrowing, unclear semantics

2. **Discriminated unions**: `AxisTag<T>`
   - Pros: Type narrowing, explicit defaults
   - Cons: More verbose

**Resolution**: Discriminated unions (AxisTag pattern)

**Rationale**: TypeScript type narrowing makes discriminated unions safer. "default" is an explicit choice, not absence of data.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D8: Block.type Naming

**Category**: Terminology

**The Problem**:
`Block.type` conflicts with the type system terminology.

**Options Considered**:

1. **Keep Block.type**: Accept ambiguity
   - Pros: No change
   - Cons: Confusing

2. **Rename to Block.kind**: Clear distinction
   - Pros: `type` reserved for type system
   - Cons: Migration needed

**Resolution**: Rename to `Block.kind`

**Rationale**: Reserve `type` for the type system. `kind` is a common pattern for discriminated unions.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D9: Role Naming (structural vs derived)

**Category**: Terminology

**The Problem**:
What to call system-generated blocks?

**Options Considered**:

1. **structural**: Emphasizes graph structure
   - Pros: Technical accuracy
   - Cons: Obscure meaning

2. **derived**: Emphasizes derivation from user intent
   - Pros: Clearer meaning
   - Cons: Could imply "derived type"

**Resolution**: `derived`

**Rationale**: "Derived" better describes that these blocks are generated to satisfy invariants, not user-authored.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D10: Default Source Values

**Category**: Gap

**The Problem**:
What should default source blocks output?

**Options Considered**:

1. **Zeros**: 0, false, black
   - Pros: Predictable
   - Cons: Static, boring defaults

2. **Useful values**: phaseA rail, 0.5, etc.
   - Pros: Animations move by default
   - Cons: Less predictable

**Resolution**: Useful values, not zeros

**Rationale**: This is an animation system. Defaults should make things move. Prefer rails (phaseA) where sensible.

**Approved**: 2026-01-09 by Brandon Fryslie

---

## Category Totals

| Category | Count |
|----------|-------|
| Quick Wins | 5 |
| Critical Contradictions | 4 |
| High-Impact Ambiguities | 6 |
| Type System (v2.5) | 10 |
| Terminology | 12 |
| Gaps | 8 |
| Low-Impact | 5 |
| **Total** | **50** |

---

## Approval Record

- **Total items reviewed**: 50
- **Approved as-is**: 50
- **Approved with modifications**: 0
- **Rejected/deferred**: 0

**Approved by**: Brandon Fryslie
**Method**: Full walkthrough
**Timestamp**: 2026-01-09T15:00:00Z
