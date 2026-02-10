---
parent: ../INDEX.md
topic: obligation-normalization
order: 27
---

# Obligation-Driven Normalization

> Graph normalization as iterative obligation fulfillment within a fixpoint loop.

**Related Topics**: [04-compilation](./04-compilation.md), [01-type-system](./01-type-system.md), [02-block-system](./02-block-system.md), [25-pure-lowering](./25-pure-lowering.md)
**Key Terms**: [DefaultPolicyTable](../GLOSSARY.md#defaultpolicytable), [NormalizedGraph](../GLOSSARY.md#normalizedgraph)
**Relevant Invariants**: [I26](../INVARIANTS.md#i26-every-input-has-a-source)

---

## Core Concept

Graph normalization is not a single pass — it is a **fixpoint loop** that alternates between structural mutation (inserting blocks and edges) and constraint solving (type inference). Each iteration may discover new obligations (unconnected inputs, type mismatches) that require further structural changes, which in turn require further type solving.

The loop terminates when no new obligations are discovered — the graph has reached a fixed point where every input has a source and all types are resolved.

---

## Architecture (T2)

### The Fixpoint Loop

```
repeat {
  1. Structural normalization: expand composites, insert default sources, insert adapters
  2. Type solving: payload/unit inference, cardinality solving
  3. Collect obligations: find remaining unconnected inputs, type mismatches
} until no new obligations
```

Each iteration produces a progressively more complete graph. The loop converges because each iteration strictly reduces the number of unsatisfied obligations (or the graph is malformed and diagnostics are emitted).

### Obligation Abstraction

An **obligation** is a declarative request for deferred graph structure. Rather than materializing all structure eagerly before types are known, the system identifies what structure is needed and defers materialization until types provide the information needed to make correct decisions.

**Current obligation kinds**:

| ObligationKind | Description | Current Status |
|----------------|-------------|----------------|
| `missingInput` | Unconnected input needs a default source | Implemented (DefaultSourcePolicy) |
| `coerce` | Type mismatch requiring adapter insertion | Implemented (adapter normalization) |
| `lens` | Port decorator requiring block materialization | Future extension |
| `busJunction` | Bus connection requiring junction block | Future extension |

### Why a Loop?

Default source insertion depends on resolved types (a `color` input gets `HueRainbow(phaseA)`, a `float` input gets `Constant(0.5)`). But type solving depends on a complete graph (all edges present). This circular dependency is resolved by iteration:

1. First iteration: insert default sources based on declared port types
2. Type solving resolves payload/unit for polymorphic blocks
3. Second iteration: newly typed ports may reveal new obligations (e.g., an adapter inserted in iteration 1 has ports that need their own default sources)
4. Loop until stable

### DefaultPolicyTable Integration

The `DefaultPolicyTable` is a type-indexed resolution table that chooses default producers for unconnected inputs. It operates within the fixpoint loop:

```typescript
resolve(policyKey, targetType, targetPort) → DefaultProducerPlan | Diagnostic
```

The table enables per-port semantic defaults (e.g., `render.pos → vec2(0.5,0.5)`, `render.color → palette`) while maintaining a single source of truth for default behavior.

### Anchor-Based Stable IDs

Materialized blocks use deterministic IDs derived from user graph anchors:

| Type | Anchor Format |
|------|---------------|
| Default source | `defaultSource:<blockId>:<portName>:<in\|out>` |
| Adapter | `adapter:<edgeId>:<adapterKind>` |

Stable IDs ensure that hot-swap state migration works correctly — the same structural block gets the same identity across recompilations.

---

## Invariant: I26 After Fixpoint

**I26 (Every input has a source)** is enforced after the fixpoint loop completes, not after any single normalization pass. During iteration, inputs may temporarily lack sources — this is expected and correct.

If the loop terminates with remaining unsatisfied obligations, these are reported as diagnostics (compile errors), not silently ignored.

---

## Convergence Guarantees

- Each iteration inserts zero or more blocks/edges (monotonically growing graph)
- Type solving is deterministic for the same graph structure
- Maximum iteration count is bounded (configurable, default: 10)
- If the bound is hit, remaining obligations become diagnostics

---

## Future Extensions

The obligation abstraction generalizes beyond the current `missingInput` and `coerce` kinds. Future obligation kinds (lens, busJunction) follow the same pattern: collect obligations during structural analysis, materialize them after type information is available, and re-solve until stable.

This generalization does not change the fundamental mechanism — it extends the set of obligation kinds the loop handles.

---

## See Also

- [04-compilation](./04-compilation.md) - Pipeline context and fixpoint loop placement
- [25-pure-lowering](./25-pure-lowering.md) - DefaultPolicyTable and macro lowering
- [01-type-system](./01-type-system.md) - Type inference that drives obligation resolution
