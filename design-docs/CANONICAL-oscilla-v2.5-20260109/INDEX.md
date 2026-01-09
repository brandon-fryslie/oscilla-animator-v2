---
status: CANONICAL
generated: 2026-01-09T17:00:00Z
approved_by: Brandon Fryslie
approval_method: full_walkthrough
source_documents: 23
topics: 6
---

# Oscilla v2.5: Canonical Specification Index

> **STATUS: CANONICAL**
> This is the authoritative source of truth for the Oscilla Animator v2.5 architecture.
> All other documents are superseded by this specification series.

Generated: 2026-01-09T17:00:00Z
Approved by: Brandon Fryslie
Source Documents: 23 files from `design-docs/spec/`

---

## Quick Navigation

| Document | Description |
|----------|-------------|
| [SUMMARY](./SUMMARY.md) | Executive overview—start here |
| [INVARIANTS](./INVARIANTS.md) | Non-negotiable rules (27 laws) |
| [GLOSSARY](./GLOSSARY.md) | Term definitions (50+ terms) |
| [Resolution Log](./RESOLUTION-LOG.md) | Decision history (50 resolutions) |

## Topics

| # | Topic | Description | Key Concepts |
|---|-------|-------------|--------------|
| 01 | [Type System](./topics/01-type-system.md) | Five-axis type model | PayloadType, Extent, SignalType, AxisTag |
| 02 | [Block System](./topics/02-block-system.md) | Compute units and roles | Block, BlockRole, DerivedBlockMeta |
| 03 | [Time System](./topics/03-time-system.md) | Time sources and rails | TimeRoot, Rails, tMs, phase |
| 04 | [Compilation](./topics/04-compilation.md) | Graph normalization and IR | NormalizedGraph, CompiledProgramIR |
| 05 | [Runtime](./topics/05-runtime.md) | Execution model and state | State slots, scheduling, erasure |
| 06 | [Renderer](./topics/06-renderer.md) | Render pipeline and sinks | RenderInstances2D, batching |

## Recommended Reading Order

For newcomers to this architecture:

1. **[SUMMARY](./SUMMARY.md)** - Get the big picture
2. **[INVARIANTS](./INVARIANTS.md)** - Understand the rules
3. **[01-type-system](./topics/01-type-system.md)** - Foundation concepts
4. **[02-block-system](./topics/02-block-system.md)** - Core building blocks
5. **[GLOSSARY](./GLOSSARY.md)** - Reference as needed

For implementers:
1. [INVARIANTS](./INVARIANTS.md) - Don't violate these
2. [04-compilation](./topics/04-compilation.md) - How it compiles
3. [05-runtime](./topics/05-runtime.md) - Runtime constraints
4. [GLOSSARY](./GLOSSARY.md) - Naming conventions

## Search Hints

Looking for something specific? Here's where to find it:

| Concept | Location |
|---------|----------|
| PayloadType, Extent, SignalType | [01-type-system.md](./topics/01-type-system.md) |
| Cardinality, Temporality, Binding | [01-type-system.md](./topics/01-type-system.md) |
| Block, BlockRole, DerivedBlockMeta | [02-block-system.md](./topics/02-block-system.md) |
| UnitDelay, Lag, Phasor, SampleAndHold | [02-block-system.md](./topics/02-block-system.md) |
| TimeRoot, Rails, tMs | [03-time-system.md](./topics/03-time-system.md) |
| NormalizedGraph, CompiledProgramIR | [04-compilation.md](./topics/04-compilation.md) |
| State slots, scheduling | [05-runtime.md](./topics/05-runtime.md) |
| RenderInstances2D, batching | [06-renderer.md](./topics/06-renderer.md) |
| All term definitions | [GLOSSARY.md](./GLOSSARY.md) |
| All invariant rules | [INVARIANTS.md](./INVARIANTS.md) |

## Appendices

- [Source Map](./appendices/source-map.md) - Which sources contributed to which sections
- [Superseded Documents](./appendices/superseded-docs.md) - Archived original documents

---

## About This Encyclopedia

This specification series was generated through a structured canonicalization process:

1. **Source Analysis**: 23 documents analyzed for contradictions and ambiguities
2. **Resolution**: 50 items resolved through iterative refinement
3. **Editorial Review**: Peer design review conducted
4. **User Approval**: All decisions approved by Brandon Fryslie (full walkthrough method)

Resolution history is preserved in [RESOLUTION-LOG.md](./RESOLUTION-LOG.md).

---

## Companion Document

For a condensed single-document overview, see:
[CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md](../CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md)

The monolith provides a quick reference; this encyclopedia provides exhaustive detail.
