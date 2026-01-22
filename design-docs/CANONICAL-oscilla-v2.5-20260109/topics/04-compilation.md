---
parent: ../INDEX.md
topic: compilation
order: 4
---

# Compilation Pipeline

> How patches become executable programs.

**Related Topics**: [01-type-system](./01-type-system.md), [02-block-system](./02-block-system.md), [05-runtime](./05-runtime.md)
**Key Terms**: [NormalizedGraph](../GLOSSARY.md#normalizedgraph), [CompiledProgramIR](../GLOSSARY.md#compiledprogramir)
**Relevant Invariants**: [I6](../INVARIANTS.md#i6-compiler-never-mutates-the-graph), [I7](../INVARIANTS.md#i7-explicit-cycle-semantics), [I8](../INVARIANTS.md#i8-slot-addressed-execution), [I9](../INVARIANTS.md#i9-schedule-is-data)

---

## Overview

The compilation pipeline transforms user patches into efficient runtime code:

```
RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR
```

Key principles:
- **Compiler never mutates the graph** (Invariant I6)
- **All structure is explicit** after normalization
- **Runtime erasure** - No type info at runtime
- **Schedule is data** (Invariant I9)

---

## Pipeline Stages

### Stage 1: RawGraph

The user-authored patch before any processing:
- User blocks and wires
- May have unconnected inputs
- May have implicit buses
- Types may be partial (AxisTag.default)

### Stage 2: GraphNormalization

Makes all structure explicit:
- Materializes derived blocks (default sources, buses, rails, lenses)
- Assigns initial SignalType coordinates
- Connects all inputs (default source invariant)

**Output**: NormalizedGraph

### Stage 3: Compilation

Transforms NormalizedGraph to executable IR:
- Type unification and resolution
- Cycle detection and validation
- Scheduling
- Slot allocation
- IR generation

**Output**: CompiledProgramIR

---

## RawGraph vs NormalizedGraph

The compilation pipeline operates on two graph representations:

### RawGraph (UI Graph)

What the user edits: blocks, edges, plus role metadata. May contain implicit attachments:
- Default source attachments (badges on ports)
- Wire-state indicators (slew/delay markers)
- Bus tap UI affordances

**RawGraph is the authoritative, undoable user intent.**

### NormalizedGraph (Compiler Graph)

The canonical compile-time representation the compiler consumes.

```typescript
type NormalizedGraph = {
  domains: DomainDecl[];
  nodes: Node[];
  edges: Edge[];
};
```

A fully explicit graph where:
- Every default-source is an actual `BlockInstance` + `Edge`
- Every bus tap/publish is an actual block + edges
- Every wire-state sidecar is an actual state block + edges
- No implicit attachments remain

**NormalizedGraph is what you compile.**

### Normalization Invariants

1. **Pure, Deterministic Rewrite**: `normalized = normalize(raw)` is a pure function
2. **ID-Stable**: Structural nodes/edges get stable IDs derived from anchors (not creation order)
3. **Single Writer**: Only normalization creates structural artifacts; compiler never inserts blocks

### Anchor-Based Stable IDs

Structural artifacts are keyed by what they attach to, ensuring IDs survive copy/paste/undo:

| Structural Type | Anchor Format |
|-----------------|---------------|
| Default source | `defaultSource:<blockId>:<portName>:<in\|out>` |
| Wire-state | `wireState:<wireId>` |
| Bus junction | `bus:<busId>:<pub\|sub>:<typeKey>` |

```typescript
structNodeId = hash("structNode", anchor)
structEdgeId = hash("structEdge", anchor, localEdgeName)
```

**Why anchors matter:** Structural objects stop thrashing when the user rearranges things. Moving a block doesn't regenerate all its default-source IDs.

### Properties

- **Explicitly closed**: All derived blocks materialized
- **Fully connected**: Every input has exactly one source
- **Typed ports**: Every port has a SignalType
- **Immutable input**: Compiler never mutates this

### IDs and References

```typescript
type NodeId = string;
type PortId = string;
type EdgeId = string;

type NodeRef = { kind: 'node'; id: NodeId };
type PortRef = { kind: 'port'; node: NodeRef; port: PortId };
type EdgeRef = { kind: 'edge'; id: EdgeId };
```

### Port Structure

```typescript
type PortDirection = { kind: 'in' } | { kind: 'out' };

type Port = {
  id: PortId;
  dir: PortDirection;
  type: SignalType;       // 5-axis coordinate
  combine: CombineMode;   // For inputs
};
```

### Edge Structure

```typescript
type Edge = {
  id: EdgeId;
  from: PortRef;  // Output port
  to: PortRef;    // Input port
};
```

Combine behavior is on the **input port**, not the edge.

---

## Domain Declarations

Domains exist as resources, not runtime nodes:

```typescript
type DomainDecl =
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'fixed_count'; count: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'grid_2d'; width: number; height: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'voices'; maxVoices: number } }
  | { kind: 'domain_decl'; id: DomainId; shape: { kind: 'mesh_vertices'; assetId: string } };
```

**v0 invariant**: Every domain compiles to dense lanes 0..N-1.

---

## Type System in Compilation

### Where the Five-Axis Model Lives

1. **GraphNormalization**: Assigns initial SignalType coordinates (mostly with `AxisTag.default`)

2. **Compilation**:
   - Unifies axes (join rules)
   - Resolves defaults (DEFAULTS_V0, FRAME_V0)
   - Specializes schedules/loops based on resolved axes
   - Allocates state slots based on cardinality
   - **Erases axes from runtime IR**

### Type Propagation

Two passes:
1. **Propagation**: Infer missing structure
2. **Unification + Resolution**: Ensure agreement, resolve to concrete types

### Axis Unification Rules (v0)

```
default + default                → default
default + instantiated(X)        → instantiated(X)
instantiated(X) + instantiated(X) → instantiated(X)
instantiated(X) + instantiated(Y), X≠Y → TYPE ERROR
```

Applied to all five axes.

### Unification Points

- **Edge**: `from.type` must unify with `to.type`
- **Multi-input op**: Inputs unify for required axes
- **Combine point**: All incoming edges unify before combine mode applies

### Default Resolution (v0)

After unification, resolve all `AxisTag.default`:

```typescript
function resolveAxis<T>(
  tag: AxisTag<T>,
  semantics: DefaultSemantics<T>,
  frameValue: T,
): T {
  if (tag.kind === 'instantiated') return tag.value;
  return semantics.kind === 'canonical' ? semantics.value : frameValue;
}
```

Use `DEFAULTS_V0` and `FRAME_V0` to produce fully-instantiated "resolved types."

---

## Cycle Detection and Validation

### Algorithm: Tarjan's SCC

Detect strongly connected components (cycles) in the graph.

### Validation Rule

Every SCC must contain at least one stateful primitive:
- UnitDelay
- Lag
- Phasor
- SampleAndHold

### Error on Invalid Cycle

```typescript
interface CycleError {
  kind: 'invalid_cycle';
  cycle: NodeId[];           // Nodes in the cycle
  missingStateful: true;     // No stateful primitive found
  suggestion: 'Add UnitDelay to break feedback loop';
}
```

---

## Scheduling

### Schedule is Data (Invariant I9)

The execution schedule is an explicit, inspectable data structure:

```typescript
interface Schedule {
  steps: Step[];
  stateSlots: StateSlotDecl[];
  fieldSlots: FieldSlotDecl[];
  scalarSlots: ScalarSlotDecl[];
}
```

### Step Types

```typescript
type Step =
  | { kind: 'eval_scalar'; nodeId: NodeId; output: ScalarSlot }
  | { kind: 'eval_field'; nodeId: NodeId; domain: DomainId; output: FieldSlot }
  | { kind: 'eval_event'; nodeId: NodeId; output: EventSlot }
  | { kind: 'state_read'; stateId: StateId; output: SlotRef }
  | { kind: 'state_write'; input: SlotRef; stateId: StateId }
  | { kind: 'combine'; inputs: SlotRef[]; mode: CombineMode; output: SlotRef }
  | { kind: 'render'; sinkId: string; input: SlotRef };
```

> **Implementation Note**: Type and field naming conventions (e.g., snake_case vs camelCase) are not prescribed by this spec—implementations should follow standard conventions for their language and project.

### Scheduling Order

1. Read external inputs
2. Update time (tMs, phases)
3. Evaluate in topological order (respecting state reads/writes)
4. Process events
5. Write to render sinks

---

## Slot Allocation

### Slot-Addressed Execution (Invariant I8)

Names are for UI; runtime uses indices:

```typescript
type ScalarSlot = { kind: 'scalar_slot'; id: number };
type FieldSlot  = { kind: 'field_slot'; id: number; domain: DomainId };
type EventSlot  = { kind: 'event_slot'; id: number };
type StateSlot  = { kind: 'state_slot'; id: number };
```

> **Implementation Note**: Implementations may use a unified slot type (e.g., `ValueSlot`) with runtime metadata instead of distinct typed slots, provided slot semantics are preserved through type information stored elsewhere (such as `SlotMetaEntry`).

### Slot Allocation by Cardinality

| Cardinality | Slot Type |
|-------------|-----------|
| `zero` | Inlined constant (no slot) |
| `one` | ScalarSlot |
| `many(domain)` | FieldSlot |

### State Slot Allocation

For stateful blocks:
- `cardinality = one` → one state cell
- `cardinality = many(domain)` → N(domain) state cells

---

## Expression Forms (Implementation Note)

Before lowering to final Ops, the compiler may use intermediate expression forms that distinguish signal-path and field-path computations:

- **Signal path**: Map, Zip, StateRead over scalar values
- **Field path**: Map, Zip, ZipSig (field + signal operands), Broadcast (signal → field)

When a cardinality-generic block mixes Signal and Field inputs, the compiler represents broadcast explicitly in the IR (never implicit at runtime). The choice between "zip-with-signal" and "explicit broadcast then zip" is an implementation decision — both are valid as long as behavior is deterministic.

---

## CompiledProgramIR

The output of compilation - what the runtime executes.

### Storage Model (MVP)

```typescript
type ScalarSlot = { kind: 'scalar_slot'; id: number };
type FieldSlot  = { kind: 'field_slot'; id: number; domain: DomainId };
type EventSlot  = { kind: 'event_slot'; id: number };
type StateSlot  = { kind: 'state_slot'; id: number };
```

**No binding/perspective/branch at runtime.** These are erased.

### Lowered Operations

```typescript
type Op =
  // Scalar operations
  | { kind: 'scalar_unary'; op: UnaryOp; in: ScalarSlot; out: ScalarSlot }
  | { kind: 'scalar_binary'; op: BinaryOp; a: ScalarSlot; b: ScalarSlot; out: ScalarSlot }

  // Field operations
  | { kind: 'field_unary'; op: UnaryOp; in: FieldSlot; out: FieldSlot }
  | { kind: 'field_binary'; op: BinaryOp; a: FieldSlot; b: FieldSlot; out: FieldSlot }

  // Cardinality conversion
  | { kind: 'broadcast_scalar_to_field'; scalar: ScalarSlot; out: FieldSlot }
  | { kind: 'reduce_field_to_scalar'; op: ReduceOp; field: FieldSlot; out: ScalarSlot }

  // State operations
  | { kind: 'state_read'; state: StateSlot; out: ScalarSlot | FieldSlot }
  | { kind: 'state_write'; in: ScalarSlot | FieldSlot; state: StateSlot }

  // Event operations
  | { kind: 'event_read'; events: EventSlot; out: ScalarSlot | FieldSlot }
  | { kind: 'event_write'; in: ScalarSlot | FieldSlot; events: EventSlot }

  // Render
  | { kind: 'render_sink_write'; sinkId: string; in: ScalarSlot | FieldSlot };

type UnaryOp = 'sin' | 'cos' | 'abs' | 'clamp' | 'negate';
type BinaryOp = 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max';
type ReduceOp = 'min' | 'max' | 'sum' | 'avg';
```

### Loop Lowering

Field operations are emitted inside domain loops:

```typescript
// For FixedCount/Voices: single contiguous loop
for (let i = 0; i < domain.count; i++) {
  fieldSlot[i] = op(inputSlot[i]);
}

// For Grid2D: contiguous with optional helpers
for (let i = 0; i < domain.width * domain.height; i++) {
  const x = i % domain.width;
  const y = Math.floor(i / domain.width);
  fieldSlot[i] = op(inputSlot[i], x, y);
}
```

Loop bounds are compile-time constants.

---

## Runtime Erasure (MVP)

Hard constraints for 5-10ms performance budget:

1. **No axis tags** in runtime values
2. **No referent ids** in runtime values
3. **No domain objects** at runtime (only loop bounds + layout constants)
4. **Perspective/Branch** are v0 defaults only

Runtime sees only:
- Scalar values
- Dense arrays
- Event buffers
- Compiled schedules

---

## Structural Sharing

### Hash-Consing (Invariant I13)

Identical FieldExpr/SignalExpr subtrees share an ExprId:

```typescript
// Instead of creating duplicate expressions:
const expr1 = Add(a, b);  // ExprId: 1
const expr2 = Add(a, b);  // ExprId: 1 (same!)

// Hash-consing ensures:
assert(expr1.id === expr2.id);
```

Benefits:
- Cache hit rate increases as patches reuse structures
- Recompile doesn't explode expr count for unchanged semantics

---

## Cache Keys (Invariant I14)

Every cache depends on explicit keys:

```typescript
interface CacheKey {
  time: number;                    // tMs if time-varying
  domain?: DomainId;              // For field caches
  upstreamSlots: SlotRef[];       // Inputs
  params: Record<string, unknown>; // Block parameters
  stateVersion: number;           // If depends on state
}
```

Properties:
- Expresses "stable across frames" vs "changes each frame"
- Supports cross-hot-swap reuse when StepIds persist

---

## Error Handling

### Type Errors

```typescript
type TypeError =
  | { kind: 'axis_mismatch'; axis: string; expected: unknown; got: unknown; location: PortRef }
  | { kind: 'domain_mismatch'; domainA: DomainId; domainB: DomainId; location: EdgeRef }
  | { kind: 'invalid_phase_op'; operation: string; location: NodeRef }
  | { kind: 'unresolved_type'; location: PortRef };
```

### Graph Errors

```typescript
type GraphError =
  | { kind: 'invalid_cycle'; cycle: NodeId[]; suggestion: string }
  | { kind: 'missing_input'; port: PortRef }
  | { kind: 'invalid_edge'; from: PortRef; to: PortRef; reason: string };
```

### Error Attribution

Every error includes location info for UI display:
- Which node/port/edge is involved
- Suggested fix if applicable

---

## Polymorphism

### Generic Blocks

Blocks can be generic over (World, Domain) using constraints:

```typescript
// Add block: generic over cardinality and payload
const AddBlock: BlockSig = {
  name: "Add",
  buildTypes(env) {
    const A = env.tc.freshVar("A");
    const B = env.tc.freshVar("B");
    const O = env.tc.freshVar("O");

    return {
      inputs: { a: { kind: 'var', v: A }, b: { kind: 'var', v: B } },
      outputs: { out: { kind: 'var', v: O } },
      constraints: [
        { kind: "Typeclass", a, cls: "Numeric" },
        { kind: "SameDomain", a, b },
        { kind: "Promote", out: O, a: A, b: B, rule: "SignalField" },
      ],
    };
  },
};
```

### Monomorphization

Every block instance compiles to **concrete IR ops** with no runtime polymorphism:
- Type variables resolved at compile time
- Lowering selected by concrete `(world, domain)`
- One `Add` block works for `signal<float>`, `field<float>`, `signal<vec2>`, etc.

---

## See Also

- [01-type-system](./01-type-system.md) - Type definitions
- [02-block-system](./02-block-system.md) - Block structure
- [05-runtime](./05-runtime.md) - How IR executes
- [Glossary: NormalizedGraph](../GLOSSARY.md#normalizedgraph)
- [Invariant: I6](../INVARIANTS.md#i6-compiler-never-mutates-the-graph)
