---
command: /canonicalize-architecture design-docs/spec/
files: INDEX.md 00-invariants.md AMBIGUITIES.md graph/02-time.md graph/03-buses.md graph/06-blocks.md graph/07-transforms.md graph/08-primitives-composites.md graph/stateful-blocks.md graph/basic-12-blocks.md compiler/01-type-system.md compiler/02-polymorphism.md compiler/03-category-theory.md compiler/04-compilation.md compiler/canonical-types-and-constraints.md compiler/canonical-types-and-constraints-UPDATED.md compiler/maybe-block-defs.md runtime/05-runtime.md renderer/09-renderer.md renderer/RENDER-PIPELINE.md time/10-phase-matching-system.md time/11-phase-unwrap-IMPORTANT.md
indexed: true
source_files:
  - design-docs/spec/INDEX.md
  - design-docs/spec/00-invariants.md
  - design-docs/spec/AMBIGUITIES.md
  - design-docs/spec/graph/02-time.md
  - design-docs/spec/graph/03-buses.md
  - design-docs/spec/graph/06-blocks.md
  - design-docs/spec/graph/07-transforms.md
  - design-docs/spec/graph/08-primitives-composites.md
  - design-docs/spec/graph/stateful-blocks.md
  - design-docs/spec/graph/basic-12-blocks.md
  - design-docs/spec/compiler/01-type-system.md
  - design-docs/spec/compiler/02-polymorphism.md
  - design-docs/spec/compiler/03-category-theory.md
  - design-docs/spec/compiler/04-compilation.md
  - design-docs/spec/compiler/canonical-types-and-constraints.md
  - design-docs/spec/compiler/canonical-types-and-constraints-UPDATED.md
  - design-docs/spec/compiler/maybe-block-defs.md
  - design-docs/spec/runtime/05-runtime.md
  - design-docs/spec/renderer/09-renderer.md
  - design-docs/spec/renderer/RENDER-PIPELINE.md
  - design-docs/spec/time/10-phase-matching-system.md
  - design-docs/spec/time/11-phase-unwrap-IMPORTANT.md
---

# Open Questions & Ambiguities: Oscilla v2

Generated: 2026-01-08T14:00:00Z
Supersedes: CANONICALIZED-QUESTIONS-oscilla-v2-20260108-130000.md

---

## Quick Wins

| # | Item | Status | Resolution |
|---|------|--------|------------|
| 1 | `tMs` vs `time` output naming | RESOLVED | `tMs` for signal, `time` for rail name |
| 2 | `float` vs `number` in Domain | RESOLVED | `float` and `int` are types; `number` is TypeScript-only |
| 3 | `trigger` vs `event` world | RESOLVED | `event` is the temporality axis; `trigger<T>` is discrete signal-level |
| 4 | Phase rail names | RESOLVED | `phaseA`, `phaseB` |
| 5 | Time output type | RESOLVED | `tMs`: signal<int>, via rails only |

---

## 1. Critical Contradictions

### C1: Stateful Block Count (4 vs 5)

- **Status**: RESOLVED
- **Resolution**: Use Set A (invariants.md): UnitDelay, Phasor, SampleAndHold (Lag doesn't exist)

---

### C2: Phasor vs Accumulator Identity

- **Status**: RESOLVED
- **Resolution**: **Distinct** - Phasor and Accumulator are separate primitives

---

### C3: Lag as Primitive vs Composite

- **Status**: RESOLVED
- **Resolution**: **Lag doesn't exist** - remove from all docs

---

### C4: "State" Block in basic-12-blocks.md

- **Status**: RESOLVED
- **Resolution**: **Remove** - this is just UnitDelay; no separate "State" block concept

---

## 2. High-Impact Ambiguities

### A1: Stateful Primitives World Coverage

- **Status**: RESOLVED
- **Resolution**:
  - One polymorphic UnitDelay block that specializes at compile time
  - State keyed by (blockId, domainElementId) tuple
  - Stable IDs allow transferring/keeping state on domain count changes

---

### A2: Custom Combine Mode Registry

- **Status**: RESOLVED
- **Resolution**: **Remove entirely** from spec. Combine modes are built-in per type. No custom combine registry.

---

### A3: Domain Lifting Rules for Fields

- **Status**: RESOLVED
- **Resolution**: Explicit domain input always required for signal→field promotion

---

### A4: Phase Type Semantics

- **Status**: RESOLVED
- **Resolution**: `float` and `int` are the numeric types. Phase arithmetic:
  - `phase + float` → phase (offset)
  - `phase * float` → phase (scale)
  - `phase + phase` → invalid

---

### A5: Event Payload Shape and Combine

- **Status**: RESOLVED
- **Resolution**: Event payload is versioned with structure:
  ```ts
  { key: string, value: float | int }
  ```
  No optional fields. No `any` types. Blocks interpret events as they see fit.

---

### A6: TimeRoot Output Naming Inconsistency

- **Status**: RESOLVED
- **Resolution**: Canonical TimeRoot outputs:
  - `tMs`: signal<int> - monotonic time in milliseconds
  - `phaseA`: signal<phase> - primary phase (from rail)
  - `phaseB`: signal<phase> - secondary phase (from rail)
  - `progress`: signal<unit> - 0..1 for finite only
  - `pulse`: trigger<unit> - frame tick

---

## 3. Terminology & Naming

### Ambiguous Terms

| # | Term | Status | Resolution |
|---|------|--------|------------|
| T1 | Domain (concept) | RESOLVED | `Domain` = element topology; rename `DomainTag` → `ValueType` for value types (float, vec2, etc.) |
| T2 | Phasor | RESOLVED | Phasor and Accumulator are distinct primitives |
| T3 | Lag | RESOLVED | Lag doesn't exist |
| T4 | field domain ref | RESOLVED | Use `domain` (clear from context since only fields have it) |
| T5 | float vs number | RESOLVED | `float` and `int` are types; `number` is TypeScript-only |
| T6 | trigger vs event | RESOLVED | `event` is temporality axis; `trigger<T>` for discrete signal-level events |
| T7 | time type | RESOLVED | `tMs`: signal<int> |
| T8 | unit vs unit01 | RESOLVED | Use `unit` as ValueType for [0,1] values |

---

## 4. Gaps and Missing Content

### G1: Default Source Catalog

- **Status**: RESOLVED
- **Resolution**: Defaults should be useful, not zeros. Use rails where sensible:
  - float: `phaseA` rail or `Constant(0.5)`
  - int: `Constant(1)`
  - vec2: `Constant([0.5, 0.5])` (center)
  - color: `HueRainbow(phaseA)` or `Constant(white)`
  - phase: `phaseA` rail
  - bool: `Constant(true)`
  - unit: `phaseA` rail or `Constant(0.5)`
  - domain: `DomainN(100)`

---

### G2: Block Roles Specification

- **Status**: RESOLVED
- **Resolution**: Block and Edge roles use discriminated unions with `derived` (not `structural`):

```ts
type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };

type DerivedBlockMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState";     target: { kind: "wire"; wire: WireId } }
  | { kind: "bus";           target: { kind: "bus"; busId: BusId } }
  | { kind: "rail";          target: { kind: "bus"; busId: BusId } }
  | { kind: "lens";          target: { kind: "node"; node: NodeRef; port?: string } };

type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "busTap";  meta: { busId: BusId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };
```

---

### G3: Cycle Validation Details

- **Status**: RESOLVED
- **Resolution**: Use Tarjan's algorithm for SCC detection. Each SCC must contain at least one stateful primitive. Otherwise emit "Feedback loop without delay" error.

---

### G4: Complete Primitive Block Catalog

- **Status**: RESOLVED
- **Resolution**: The basic-12 blocks define MVP functionality. Align names/signatures to spec:
  1. TimeRoot
  2. DomainN
  3. Id/U01
  4. Hash
  5. Noise
  6. Add
  7. Mul
  8. Length
  9. Normalize
  10. UnitDelay (not "State")
  11. HSV→RGB
  12. RenderInstances2D

---

### G5: State Migration on Block ID Change

- **Status**: RESOLVED
- **Resolution**: Block IDs are stable UUIDs. Copy/paste creates new IDs. State is per-ID. Hot-swap matches by ID.

---

## 5. Low-Impact Items

### L1: DomainTag includes "event" and "domain"

- **Status**: RESOLVED
- **Resolution**: Moot with T1 resolution. `ValueType` = `float | int | vec2 | color | phase | bool | unit`. Domain handles are separate. Events are a temporality axis, not a ValueType.

---

### L2: "path2d" in Domain enum

- **Status**: RESOLVED
- **Resolution**: path2d is a special/asset type, not a computational ValueType

---

### L3: Config vs Scalar world

- **Status**: RESOLVED
- **Resolution**: Use **`static`** (not `config` or `scalar`) for compile-time constants

---

### L4: Rail list completeness

- **Status**: RESOLVED
- **Resolution**: MVP rails: `time`, `phaseA`, `phaseB`, `pulse`. Remove `progress` from rails.

---

### L5: FieldExpr vs Field type

- **Status**: RESOLVED
- **Resolution**: `Field<T>` = semantic type; `FieldExpr` = IR node. Both correct in context.

---

## 6. Naming Changes Summary

| Old | New | Reason |
|-----|-----|--------|
| `DomainTag` | `ValueType` | Clarity: Domain is element topology, ValueType is float/vec2/etc |
| `config` / `scalar` | `static` | Clearer meaning: compile-time constant |
| `Block.type` | `Block.kind` | Reserve `type` for the type system |
| `structural` (in roles) | `derived` | Better describes system-generated blocks |
| `TypeDesc` | `Type` | Simpler; it is the type |

---

## 7. Type System (Pending Further Design)

**NOTE**: The type system is undergoing redesign. The following is the current working model, but additional axes are being explored.

Current working model:
- `ValueType` = `float | int | vec2 | color | phase | bool | unit`
- `Type` = discriminated union by world (static/signal/field + event axis)
- Field requires `domain`, others don't
- No optional fields in Type - use discriminated union

Pending:
- Full axis model (cardinality × temporality × ???)
- User-friendly syntax
- Alignment with Applicative/Functor patterns

---

## Resolution Progress

| Category | Total | Resolved | Remaining |
|----------|-------|----------|-----------|
| Quick Wins | 5 | 5 | 0 |
| Critical Contradictions | 4 | 4 | 0 |
| High-Impact Ambiguities | 6 | 6 | 0 |
| Terminology | 8 | 8 | 0 |
| Gaps | 5 | 5 | 0 |
| Low-Impact | 5 | 5 | 0 |
| **Total** | **33** | **33** | **0** |

**Progress: 100%**

All items resolved. Type system design is ongoing but does not block canonicalization.

Re-run to generate master compendium.
