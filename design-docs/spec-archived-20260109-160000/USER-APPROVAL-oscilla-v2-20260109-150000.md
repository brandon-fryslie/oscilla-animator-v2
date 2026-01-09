---
command: /canonicalize-architecture design-docs/spec/ Please apply this refinement document to the remaining unresolved questions @"design-docs/spec/_architecture-refinement/ChatGPT-Fundamental Axes in Systems.md"
approved: true
approval_timestamp: 2026-01-09T15:00:00Z
approval_method: full_walkthrough
reviewed_items: 50
approved_items: 50
modified_items: []
rejected_items: none
---

# User Approval Record: Oscilla v2.5 Type System

Generated: 2026-01-09T15:00:00Z

## Approval Summary

- **Total items reviewed**: 50
- **Approved as-is**: 50
- **Approved with modifications**: 0
- **Rejected/deferred**: 0

## Notes Recorded During Approval

The following items were approved with clarifying notes:

### Resolution 8: Lag as Primitive

**Resolution**: Lag IS a primitive (MVP stateful block)
**User note**: Lag is technically a composite but labeled as primitive for practical purposes. The distinction is arbitrary for this system.

### Resolution 25: Field as SignalType Specialization

**Resolution**: Field = `cardinality: many(domain)` + `temporality: continuous`
**User note**: UI will still use "field" terminology; SignalType constraint is the internal representation.

### Resolution 41: State Migration on Block ID Change

**Resolution**: Block IDs are stable UUIDs. State keyed per-ID. Hot-swap matches by ID.
**User note**: MVP behavior; may evolve for better stability/UX/no resets during playback.

### Resolution 42: Runtime Erasure Requirements

**Resolution**: No axis tags, referent ids, or domain objects at runtime.
**User note**: Hard requirement for MVP only.

### Resolution 44: CompiledProgramIR Storage Model

**Resolution**: Erased storage slots (ScalarSlot, FieldSlot, EventSlot, StateSlot).
**User note**: MVP only.

## Resolutions by Category

### Quick Wins (5)

| # | Item | Resolution |
|---|------|------------|
| 1 | tMs vs time naming | `tMs` = signal, `time` = rail name |
| 2 | float vs number | `float`/`int` = PayloadTypes, `number` = TypeScript-only |
| 3 | trigger vs event | `discrete` = temporality axis; trigger = `one + discrete` |
| 4 | Phase rail names | `phaseA`, `phaseB` |
| 5 | Time output type | `tMs`: `one + continuous + int` |

### Critical Contradictions (4)

| # | Item | Resolution |
|---|------|------------|
| 6 | Stateful block count | MVP: UnitDelay, Lag, Phasor, SampleAndHold (4). Accumulator post-MVP. |
| 7 | Phasor vs Accumulator | Distinct. Phasor = 0..1 wrap. Accumulator = unbounded (post-MVP). |
| 8 | Lag primitive vs composite | Lag IS a primitive (see note above) |
| 9 | "State" block | Remove - it's just UnitDelay |

### High-Impact Ambiguities (6)

| # | Item | Resolution |
|---|------|------------|
| 10 | Stateful primitives cardinality | Polymorphic. State allocation by cardinality: one→1 cell, many→N cells. |
| 11 | Custom combine modes | Removed entirely. Built-in only. |
| 12 | Domain lifting rules | Explicit broadcast required. No implicit domain inference. |
| 13 | Phase type semantics | `phase + float` → phase, `phase * float` → phase, `phase + phase` → invalid |
| 14 | Event payload shape | `{ key: string, value: float | int }`. No optionals. |
| 15 | TimeRoot outputs | `tMs`, `phaseA`, `phaseB`, `progress`, `pulse` with v2.5 typing |

### Type System - v2.5 (10)

| # | Item | Resolution |
|---|------|------------|
| 16 | World → Cardinality + Temporality | Two orthogonal axes replace World enum |
| 17 | Naming: PayloadType/Extent/SignalType | ValueType→PayloadType, World→Extent, Type→SignalType |
| 18 | AxisTag and DefaultSemantics | Discriminated unions, no optionals |
| 19 | Cardinality axis | zero / one / many(domain) |
| 20 | Temporality axis | continuous / discrete |
| 21 | Binding axis | unbound/weak/strong/identity (v0 default-only) |
| 22 | Perspective and Branch | v0 defaults: global, main |
| 23 | Domain as compile-time resource | Not a wire value. Erased at runtime. |
| 24 | Axis unification rules | Strict join. X + Y (X≠Y) → type error |
| 25 | Field as SignalType constraint | many(domain) + continuous (see note above) |

### Terminology (12)

| # | Item | Resolution |
|---|------|------------|
| 26 | Domain concept | Compile-time topology, not wire value |
| 27 | Phasor | Distinct from Accumulator |
| 28 | Lag | IS a primitive |
| 29 | field domain ref | Cardinality references DomainId |
| 30 | float vs number | PayloadType vs TypeScript |
| 31 | trigger vs event | Temporality axis |
| 32 | time type | `one + continuous + int` |
| 33 | unit vs unit01 | Use `unit` |
| 34 | ValueType | → PayloadType |
| 35 | World | → Extent |
| 36 | Type | → SignalType |

### Gaps (8)

| # | Item | Resolution |
|---|------|------------|
| 37 | Default source catalog | Useful defaults (phaseA, etc.), not zeros |
| 38 | Block roles | user / derived (with DerivedBlockMeta) |
| 39 | Cycle validation | Tarjan's SCC. Each cycle needs stateful block. |
| 40 | Primitive block catalog | Basic-12. UnitDelay (not "State"). |
| 41 | State migration | UUID-keyed. Reset on ID change. (see note) |
| 42 | Runtime erasure | No axis/domain/referent at runtime (see note) |
| 43 | NormalizedGraph | domains + nodes + edges |
| 44 | CompiledProgramIR storage | Slot-based, erased (see note) |

### Low-Impact (5)

| # | Item | Resolution |
|---|------|------------|
| 45 | DomainTag event/domain | Moot - excluded from PayloadType |
| 46 | path2d | Asset/domain shape, not PayloadType |
| 47 | config vs scalar | Both = cardinality zero |
| 48 | Rail list | time, phaseA, phaseB, pulse |
| 49 | FieldExpr vs Field | Different layers (type vs IR) |
| 50 | Block.type → Block.kind | Reserve `type` for type system |

## User Confirmation

The user has reviewed and approved the canonicalized architecture specification.

Approved by: Brandon Fryslie
Method: full_walkthrough
Timestamp: 2026-01-09T15:00:00Z

---

**Next step**: Run again to generate the master compendium (CANONICAL-ARCHITECTURE document).
