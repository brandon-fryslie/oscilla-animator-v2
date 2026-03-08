---
parent: ../INDEX.md
topic: compilation
order: 4
---

# Compilation Pipeline

> How patches become validated Naga IR and WebGPU-native execution artifacts.

**Related Topics**: [01-type-system](./01-type-system.md), [02-block-system](./02-block-system.md), [05-runtime](./05-runtime.md)
**Key Terms**: [NormalizedGraph](../GLOSSARY.md#normalizedgraph), [CompiledProgramIR](../GLOSSARY.md#compiledprogramir), [Scoped Naga IR](../GLOSSARY.md#scoped-naga-ir)
**Relevant Invariants**: [I6](../INVARIANTS.md#i6-compiler-never-mutates-the-graph), [I7](../INVARIANTS.md#i7-explicit-cycle-semantics), [I8](../INVARIANTS.md#i8-slot-addressed-execution), [I9](../INVARIANTS.md#i9-schedule-is-data)

---

## Overview

The compilation pipeline transforms user patches into efficient, validated GPU code:

```
RawGraph → GraphNormalization → NormalizedGraph → Naga Lowering → Shader Artifacts
```

Key principles:
- **Compiler never mutates the graph** (Invariant I6)
- **Scoped Naga IR** - Lowering to structured IR with recursive blocks and lexical scopes
- **Async Compiler Service** - Asynchronous validation and pipeline linking
- **Runtime erasure** - No type info at runtime; CPU is a scheduler, GPU is the computer

---

## Pipeline Stages

### Stage 1: RawGraph

The user-authored patch before any processing:
- User blocks and wires
- May have unconnected inputs
- Types may be partial (AxisTag.default)

### Stage 2: GraphNormalization (Fixpoint)

Makes all structure explicit through a **fixpoint loop**:
- Iteratively inserts default sources based on type information
- Solves types after each insertion
- Repeats until the graph is stable (no new insertions)

**Output**: NormalizedGraph

### Stage 3: Naga Lowering (TS → Scoped IR)

Transforms NormalizedGraph into a strictly-typed **Scoped Naga IR**:
- **Recursive Scoped Walk**: Traverses execution edges and emits nested block bodies (`loop`, `if`).
- **Address Resolution**: Queries the `GpuLayout` map to resolve slot IDs into concrete Arena offsets.
- **Constrained Builder**: Emits Naga expressions through a typed builder API (no WGSL string concatenation).

**Output**: NagaModule (Structured IR)

### Stage 4: Validation & Linking (Async)

The `AsyncCompilerService` manages the asynchronous build lifecycle:
- **Naga Validation (WASM)**: Validates the IR module for type-safety and memory invariants.
- **Pipeline Linking**: Uses `createComputePipelineAsync` to link the validated IR into executable hardware pipelines.
- **Hot-Swap Arming**: Prepares the atomic swap for the next frame boundary.

**Output**: Shader Artifacts (Pipelines + GpuLayout + Draw-Prep Metadata)

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
- **Typed ports**: Every port has a CanonicalType
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
  type: CanonicalType;       // 5-axis coordinate
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

1. **GraphNormalization**: Assigns initial CanonicalType coordinates (mostly with `AxisTag.default`)

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

### Cardinality Constraint Extraction (CT/ICT-First)

Cardinality constraints are extracted from per-port CT/ICT declarations:
- Shared cardinality var IDs define port groups
- Var `relation` defines group propagation (`uniform` or `promoteToMany`)
- Var `acceptance` defines per-port bounds (`oneOnly`, `manyOnly`, `oneOrMany`)
- Var `instanceBinding` defines instance source (`inherit` vs `create(domainType)`)
- Block-level mode metadata is compatibility-only; the frontend never treats it as a type authority.
- Canonical source for cardinality behavior is the port type axis declaration.

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

## Pure Lowering Contract (T2)

Block lowering is a pure function. `lower()` takes resolved types, parameters, inputs, and a constrained builder context, and returns expression outputs plus declarative effects.

### LowerSandbox

The `LowerSandbox` is a capability-based IR builder that enforces lowering purity:
- Provides: `emitConst`, `emitOp`, `emitKernel`, `emitExtract`, `emitConstruct`, `readRail`
- Prevents: graph mutation, global state access, scheduling side effects
- Used for both regular block lowering and macro lowering (invoking other blocks' `lower()` as IR libraries)

### Effects-as-Data

Lowerers return `exprOutputs + effects?` — effects are declarative data (state cell requests, kernel registrations, intrinsic dependencies). A separate compiler stage consumes effects. Lowerers never schedule directly.

### Macro Lowering

Existing blocks' `lower()` functions can be invoked through a LowerSandbox to produce IR without creating graph nodes. Used by DefaultSource to compose defaults from existing block semantics. Keeps block semantics as single source of truth.

### Purity Enforcement

- Determinism: same inputs → same outputs (no random, no timestamps)
- No mutation: lowerers cannot modify graph or global state
- Forbidden imports: no direct access to runtime or store modules

---

## Scoped Naga IR & Control Flow

The compiler targets a hierarchical instruction model that supports recursive blocks and explicit lexical scopes.

### Recursive Block Lowering

Graph lowering traverses the NormalizedGraph and emits nested `Statement::Block` bodies:
- **Loops**: Represented as recursive Naga blocks with internal lexical scopes.
- **Branches**: `if/else` logic represented as accept/reject Naga blocks.
- **Lexical Environment**: The `ScopeEnvironment` ensures expression handles produced in a child block are inaccessible after block exit.

### Dynamic Memory & Safety

The compiler enforces hardware safety during IR emission:
- **Mandatory Clamping**: All dynamic buffer reads (`arena_in`) are injected with `min(index, arrayLength - 1)` guards to prevent GPU page faults.
- **Pointer Model**: Lowering uses explicit `Access` and `Load/Store` primitives to interact with the Arena.

---

## Arena Layout & GpuLayout

The compiler owns the memory map of the instrument, resolving abstract ports into physical offsets.

### Slot-Addressed Execution (Invariant I8)

Names are for UI; runtime uses hardcoded byte offsets resolved by `GpuLayout`.

| Cardinality | Storage Type | Allocation Strategy |
|-------------|--------------|----------------------|
| `zero` | Constant | Inlined into Naga module |
| `one` | Scalar | Fixed offset in Scalar Zone |
| `many(instance)` | Array | Stride-aware range in Lane Zone (SoA) |

### SoA Layout Rules

The `GpuLayout` resolves abstract Slot IDs into concrete offsets:
- **Stride**: `payloadStride(payload)` is the only source of truth.
- **Coalescing**: Components are stored in channel-separated contiguous arrays (SoA).
- **Alignment**: Every channel block is padded to 256-byte alignment.

---

## CompiledProgramIR

The output of compilation - what the engine executes.

### Storage & Pipelines

```typescript
interface CompiledProgramIR {
  // Hard-linked GPU pipelines
  pipelines: {
    compute: GPUComputePipeline;
    drawPrep: GPUComputePipeline;
    render: GPURenderPipeline;
  };

  // Memory Map
  gpuLayout: GpuLayout;
  arenaTotalFloats: number;

  // Sink Metadata (for Draw Prep)
  drawPrepProgram: {
    sinks: DrawPrepSinkRecord[];
  };
}
```

### Parallel Lowering

Operations over many lanes are lowered into highly optimized compute kernels:
- **Lane Calculation**: Each thread computes its `lane_idx` (0..N-1) from `GlobalInvocationID`.
- **Parallel Dispatch**: The GPU executes thousands of lanes in parallel via workgroups.

---

## Error Handling & Source Mapping

Since Naga is a "Black Box," the compiler maintains a **SourceMap** to translate Rust-style errors back to the user graph.

### The Rosetta Stone

During lowering, we record every generated Naga expression or statement index:
- `SourceMap.recordExpr(nagaExprId, blockId)`
- `SourceMap.recordStmt(nagaStmtIndex, blockId)`

### Propagation

When validation fails, the `CompilerService` parses the Naga error report, looks up the index in the `SourceMap`, and highlights the offending block in the UI.

---

## See Also

- [01-type-system](./01-type-system.md) - Type definitions
- [05-runtime](./05-runtime.md) - How artifacts execute
- [06-renderer](./06-renderer.md) - Render sinks
- [Invariant: I8](../INVARIANTS.md#i8-slot-addressed-execution)
