---
parent: INDEX.md
---

# Oscilla v2.5: Executive Summary

> Start here for a high-level understanding of the architecture.

## What This System Does

Oscilla v2.5 is a **looping, interactive visual instrument** compiled from a typed reactive graph. Users create visual animations by connecting blocks in a patch; the system compiles patches to efficient runtime code; animations loop continuously, responding to time and user input.

The system is built on a node-based dataflow architecture with category-theoretic principles (Functor/Applicative patterns). Everything flows through typed wires with deterministic evaluation.

## Key Design Principles

1. **No special cases** - Align with category theory; avoid ad-hoc rules
2. **No optional fields** - Use discriminated unions (`AxisTag` pattern)
3. **Single source of truth** - Each concept has one canonical representation
4. **Runtime erasure** - All type information resolved at compile time
5. **State is explicit** - Only 4 stateful primitives; everything else is pure

## Architecture at a Glance

```
User Patch (RawGraph)
        │
        ▼
┌─────────────────────┐
│ GraphNormalization  │  ← Materializes derived blocks, assigns types
└─────────────────────┘
        │
        ▼
   NormalizedGraph     ← Domains + Nodes + Edges (all explicit)
        │
        ▼
┌─────────────────────┐
│    Compilation      │  ← Type unification, scheduling, IR generation
└─────────────────────┘
        │
        ▼
  CompiledProgramIR    ← Slot-based, axis-erased runtime code
        │
        ▼
┌─────────────────────┐
│      Runtime        │  ← Executes schedules, manages state
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│     Renderer        │  ← Sink only; receives render commands
└─────────────────────┘
```

### Major Components

| Component | Purpose | Key Document |
|-----------|---------|--------------|
| Type System | Five-axis type coordinates | [01-type-system.md](./topics/01-type-system.md) |
| Block System | Compute units and roles | [02-block-system.md](./topics/02-block-system.md) |
| Time System | Monotonic time, rails | [03-time-system.md](./topics/03-time-system.md) |
| Compilation | Graph → IR pipeline | [04-compilation.md](./topics/04-compilation.md) |
| Runtime | Execution and state | [05-runtime.md](./topics/05-runtime.md) |
| Renderer | Output sink | [06-renderer.md](./topics/06-renderer.md) |

### Data Flow

1. **Patches** define blocks and wires
2. **Normalization** makes all structure explicit (default sources, buses, lenses)
3. **Compilation** resolves types, schedules execution, generates IR
4. **Runtime** executes IR per-frame with explicit state management
5. **Renderer** receives instances and renders them

## Five-Axis Type System

Every value in the system has a single authoritative type: `CanonicalType = { payload, unit, extent }`.

The **extent** describes where/when/about-what a value exists via five independent axes:
1. **Cardinality** — How many lanes (zero/one/many)
2. **Temporality** — When values exist (continuous/discrete)
3. **Binding** — Referential anchoring (v0: default only)
4. **Perspective** — Viewpoint (v0: default only)
5. **Branch** — Timeline branch (v0: default only)

This cleanly separates concerns without concept conflation while maintaining runtime performance via compile-time erasure.

## Quick Reference

- **Invariants**: [INVARIANTS.md](./INVARIANTS.md) - 27 non-negotiable rules
- **Glossary**: [GLOSSARY.md](./GLOSSARY.md) - 50+ term definitions
- **Full Topic List**: [INDEX.md](./INDEX.md)
- **Resolution History**: [RESOLUTION-LOG.md](./RESOLUTION-LOG.md)
