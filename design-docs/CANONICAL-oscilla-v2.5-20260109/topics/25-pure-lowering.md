---
parent: ../INDEX.md
topic: pure-lowering
order: 25
---

# Pure Lowering Contract

> Block lowering is a pure function. No graph mutation, no scheduling side effects.

**Related Topics**: [04-compilation](./04-compilation.md), [02-block-system](./02-block-system.md)
**Key Terms**: [LowerSandbox](../GLOSSARY.md#lowersandbox), [LowerEffects](../GLOSSARY.md#lowereffects), [Macro Lowering](../GLOSSARY.md#macro-lowering)

---

## Core Principle (T2)

`BlockDef.lower()` is a **pure function** of (resolved types, parameters, inputs, context). It produces ValueExpr DAGs and declarative effects. It does NOT mutate the graph, access global state, or schedule execution directly.

## LowerSandbox (T2)

A capability-based IR builder that enforces purity during block lowering.

**Provides**: `emitConst`, `emitOp`, `emitKernel`, `emitExtract`, `emitConstruct`, `readRail`, `hslToRgb`
**Prevents**: graph mutation, global state access, scheduling side effects

Used for both:
- Regular block lowering (single block → IR)
- Macro lowering (invoking other blocks' `lower()` as IR libraries)

## Effects-as-Data Model (T2)

Lowerers return `exprOutputs + effects?`:
- `exprOutputs`: ValueExpr DAGs for each output port
- `effects`: Declarative data — state cell requests, kernel registrations, intrinsic dependencies, slot requests

A separate compiler stage consumes effects (slot allocation, schedule step generation). Lowerers never schedule directly.

## Macro Lowering (T2)

Technique of invoking existing blocks' `lower()` functions through a LowerSandbox to produce IR without creating graph nodes.

**Primary use case**: DefaultSource dispatches on resolved type via DefaultPolicyTable, potentially invoking other blocks' lowerers as macros.

**Key benefit**: Block semantics are the single source of truth. If a block's behavior changes, all macro expansions using it automatically update.

## Purity Enforcement (T2)

- **Determinism**: Same inputs → same outputs (no random, no timestamps in lowering)
- **No mutation**: Lowerers cannot modify graph, stores, or global state
- **Forbidden imports**: No direct access to runtime or store modules from lower functions
- **Completeness**: Every port listed in BlockDef must have a corresponding output in lower() result

---

## Cross-References

- Pipeline integration: [04-compilation](./04-compilation.md)
- Block definitions: [02-block-system](./02-block-system.md)
