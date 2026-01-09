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

# Canonical Architecture Summary: Oscilla Animator v2

Generated: 2026-01-08T14:00:00Z
Supersedes: CANONICALIZED-SUMMARY-oscilla-v2-20260108-130000.md
Documents Analyzed: 22 files
Resolution Status: **100% Complete**

---

## Executive Summary

Oscilla v2 is a node-based animation system built on a dataflow architecture. The system is designed around category-theoretic principles (Functor/Applicative patterns) to maintain elegance and minimize special cases.

Key architectural decisions from canonicalization:
- **Type system**: `ValueType` (float/int/vec2/etc) + `World` (static/signal/field/event)
- **Blocks use `kind`** not `type` (reserve `type` for the type system)
- **Block/Edge roles**: `user` vs `derived` (not `structural`)
- **Stateful primitives**: UnitDelay, Phasor, SampleAndHold (Lag doesn't exist)
- **No custom combine modes**: Built-in only, per type
- **Default sources**: Useful values (rails where sensible), not zeros

---

## Key Naming Changes

| Old | New | Reason |
|-----|-----|--------|
| `DomainTag` | `ValueType` | Domain = element topology; ValueType = float/vec2/etc |
| `config` / `scalar` | `static` | Clearer: compile-time constant |
| `Block.type` | `Block.kind` | Reserve `type` for type system |
| `structural` | `derived` | Better describes system-generated entities |
| `TypeDesc` | `Type` | Simpler |

---

## Type System (Current Working Model)

```ts
type ValueType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit';

type World = 'static' | 'signal' | 'field' | 'event';

type Type =
  | { world: 'static'; value: ValueType }
  | { world: 'signal'; value: ValueType }
  | { world: 'field';  value: ValueType; domain: DomainRef }
  | { world: 'event';  value: ValueType };
```

**Design principle**: No optional fields. Use discriminated unions. Field has `domain`, others don't.

**Note**: Type system design is ongoing. Additional axes being explored for more expressive power.

---

## Block & Edge Roles

```ts
type BlockRole =
  | { kind: "user" }
  | { kind: "derived"; meta: DerivedBlockMeta };

type DerivedBlockMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState";     target: { kind: "wire"; wire: WireId } }
  | { kind: "bus";           target: { kind: "bus"; busId: BusId } }
  | { kind: "rail";          target: { kind: "bus"; busId: BusId } }
  | { kind: "lens";          target: { kind: "node"; node: NodeRef } };

type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "busTap";  meta: { busId: BusId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };
```

---

## Stateful Primitives

Canonical set (no others):
1. **UnitDelay** - `y(t) = x(t-1)` - feedback gate
2. **Phasor** - phase accumulator (0..1 ramp with wrap)
3. **SampleAndHold** - latch on trigger
4. **Accumulator** - `y(t) = y(t-1) + x(t)` (distinct from Phasor)

**Removed**: Lag (doesn't exist), "State" block (is just UnitDelay)

---

## TimeRoot Outputs

| Output | Type | Description |
|--------|------|-------------|
| `tMs` | signal<int> | Monotonic time in ms |
| `phaseA` | signal<phase> | Primary phase |
| `phaseB` | signal<phase> | Secondary phase |
| `progress` | signal<unit> | 0..1 (finite only) |
| `pulse` | trigger<unit> | Frame tick |

**MVP Rails**: `time`, `phaseA`, `phaseB`, `pulse` (not `progress`)

---

## Combine Modes

Built-in only. No custom registry.

| Type | Available Modes |
|------|-----------------|
| Numeric | sum, average, min, max, mul |
| Any | last, first, layer |
| Boolean | or, and |

---

## Event Payload

```ts
{ key: string, value: float | int }
```

Versioned. No optional fields. No `any` types.

---

## Default Sources

Use useful defaults, not zeros. Prefer rails for animation:

| ValueType | Default |
|-----------|---------|
| float | `phaseA` rail or `Constant(0.5)` |
| int | `Constant(1)` |
| vec2 | `Constant([0.5, 0.5])` |
| color | `HueRainbow(phaseA)` |
| phase | `phaseA` rail |
| bool | `Constant(true)` |
| unit | `phaseA` rail |
| domain | `DomainN(100)` |

---

## Basic 12 Blocks (MVP)

1. TimeRoot
2. DomainN
3. Id/U01
4. Hash
5. Noise
6. Add
7. Mul
8. Length
9. Normalize
10. UnitDelay
11. HSV→RGB
12. RenderInstances2D

---

## Architecture Principles

1. **No special cases** - Align with category theory (Functor/Applicative)
2. **No optional fields** - Use discriminated unions
3. **`kind` for discriminators** - Standard TS pattern
4. **Derived blocks are real** - Exist in patch, compiled normally, just not user-authored
5. **Compiler ignores roles** - Roles are for editor, not compilation
6. **Single source of truth** - Each concept has one canonical representation

---

## Reference: v1 Codebase

Located at `~/code/oscilla-animator_codex`:
- Block/Edge roles: `src/editor/types.ts`
- Role invariants: `design-docs/final-System-Invariants/15-Block-Edge-Roles.md`
- GraphNormalizer: `src/editor/graph/GraphNormalizer.ts`

---

## Next Steps

1. **Type system expansion** - Additional axes being designed
2. **Update source specs** - Apply naming changes to all spec documents
3. **Implement in code** - Align implementation with canonical spec
