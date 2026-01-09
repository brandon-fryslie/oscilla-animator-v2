# Generative animation UX design

**User:** Brandroid Frizzle (brandroid@vast.wang)  
**Created:** 12/14/2025 1:58:34 PM  
**Updated:** 1/7/2026 8:47:52 PM  
**Exported:** 1/7/2026 10:59:49 PM  
**Link:** [https://chatgpt.com/c/693f24f8-52f8-8328-a8e4-deeef6fca047](https://chatgpt.com/c/693f24f8-52f8-8328-a8e4-deeef6fca047)  

## Response:
Steps 5–9, fully specified: passes, module layout, concrete shapes
------------------------------------------------------------------

### Pass boundaries (compiler pipeline)

#### Pass 5 — NormalizePatch → NormalGraph

**Input:** `PatchIR`  
**Output:** `NormalGraph`

**Responsibilities (all mandatory):**

1.  **Multi-writer resolution becomes explicit nodes**
    *   For every input port `(blockId, inPort)` that has ≥1 writer edge **or** a default source, create exactly one `CombineNode`.
    *   All incoming writers become edges into that `CombineNode`.
    *   `CombineNode` output is the _only_ writer into the target block input.
2.  **Default sources become ordinary writer nodes**
    *   Every port has an implicit “default writer” edge from its default-source block instance (even if user didn’t set one; then it’s an auto-created “DefaultConst” block).
    *   This edge always exists, always has lowest priority.
3.  **Buses become ordinary globally-addressed junction nodes**
    *   Any “bus UI” entity is normalized into:
        *   `BusJunctionNode(busName)` with ordinary in/out ports
        *   ordinary edges to/from it
4.  **State-on-wire becomes explicit state block node**
    *   Any edge-role indicating a managed stateful modifier is expanded into a `StateNode` inserted between upstream and downstream.

**Determinism rules:**

*   Writer order is deterministic and stored on the combine node as an ordered `writers[]` list computed by `(priorityIndex asc, edgeId asc)`.

* * *

#### Pass 6 — TypeSolve on NormalGraph

**Input:** `NormalGraph`  
**Output:** `TypedNormalGraph` (same topology + concrete types per port + per node output)

**Responsibilities:**

*   Every node port and node output has a `TypeDesc` (no unknowns remain).
*   Every combine node validates `SupportsCombine(type, mode)`.

**Hard rule:** if a type is not solvable, compilation fails with a single, structured error object (no partial programs).

* * *

#### Pass 7 — LowerTypedGraph → BuilderIR

**Input:** `TypedNormalGraph`  
**Output:** `BuilderIR` (expr tables + “proto schedule” + slot allocations + debug/source map)

**Responsibilities:**

*   Allocate slots for **every** node output (including combine nodes and structural nodes).
*   Emit `SignalExpr` / `FieldExpr` / `EventExpr` nodes.
*   Emit state reads/writes as explicit schedule steps.
*   Emit materialization + render-assemble steps as explicit schedule steps.

**Hard rule:** slot allocation happens here (during lowering), not later.

* * *

#### Pass 8 — BuildSchedule (topological schedule + deps)

**Input:** `BuilderIR`  
**Output:** `ScheduleIR` with `steps[]` and `deps[]` resolved, plus `initialSlotValues`

**Responsibilities:**

*   Ensure all step deps are explicit and acyclic.
*   Resolve stateId→offset mapping here (because stateLayout is finalized here or earlier; pick one place and never duplicate).

* * *

#### Pass 9 — FinalizeProgram (BuilderIR → CompiledProgramIR)

**Input:** `BuilderIR + ScheduleIR`  
**Output:** `CompiledProgramIR` (the only runtime contract)

**Responsibilities:**

*   Freeze tables, slot meta, constants, state layout, schedule, render sinks, source map.

* * *

Concrete shapes (the stuff you actually implement first)
--------------------------------------------------------

### PatchIR (input)

```ts
type Role = { kind: string; meta: Record<string, unknown> };

type PatchIR = {
  patchId: string;
  blocks: BlockInstanceIR[];
  edges: EdgeIR[];
};

type BlockInstanceIR = {
  blockId: string;
  typeId: string;               // refers to block library definition
  role: Role;                   // always present
  params: Record<string, unknown>;
};

type EdgeIR = {
  edgeId: string;
  role: Role;                   // always present
  from: { blockId: string; port: string };
  to: { blockId: string; port: string };
  combineMode: CombineMode;     // always present (even if ignored for single-writer)
  priorityIndex: number;        // always present
};
```

### NormalGraph (output of normalization)

This is a compiler-only graph where multi-writer ports are replaced by explicit combine nodes and structural expansions are done.

```ts
type NormalGraph = {
  nodes: NormalNode[];
  edges: NormalEdge[];
};

type NormalNode =
  | { kind: "block"; nodeId: string; blockId: string; typeId: string; role: Role; params: Record<string, unknown> }
  | { kind: "combine"; nodeId: string; target: { blockId: string; port: string }; mode: CombineMode; role: Role; writers: WriterRef[] }
  | { kind: "busJunction"; nodeId: string; busName: string; role: Role }
  | { kind: "state"; nodeId: string; stateId: string; stateKind: StateKind; role: Role; params: Record<string, unknown> }
  | { kind: "defaultSource"; nodeId: string; forPort: { blockId: string; port: string }; role: Role; sourceBlockId: string };

type WriterRef = { edgeId: string; from: { nodeId: string; port: string } };

type NormalEdge = {
  edgeId: string;
  role: Role;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
};
```

### TypeDesc (no optional fields)

```ts
type TypeWorld = "signal" | "field" | "event" | "scalar" | "config";
type TypeDomain = "number" | "bool" | "trigger" | "phase" | "vec2" | "vec3" | "color";

type TypeDesc = {
  world: TypeWorld;
  domain: TypeDomain;
  arity: number;              // 1,2,3,4...
  packing: { kind: "slots"; lanes: number }; // lanes === arity, always explicit
};
```

### CombineMode (canonical set you can implement immediately)

Keep this minimal-but-complete for “whole system” wiring; domain-specific legality is enforced by `SupportsCombine`.

```ts
type CombineMode =
  | "priority_last"        // writer wins (ordered)
  | "sum"                  // numeric add / vector component add
  | "min"
  | "max"
  | "mul"                  // numeric multiply / component-wise multiply
  | "or"                   // bool
  | "and"                  // bool
  | "xor"                  // bool
  | "blend_over";          // colors (premultiplied alpha over), fields supported
```

### BuilderIR (the lowering output that precedes schedule finalization)

```ts
type ValueSlot = number;
type SigExprId = number;
type FieldExprId = number;
type EventExprId = number;
type StepId = number;

type SlotMetaEntry = {
  slot: ValueSlot;
  storage: "f64" | "f32" | "i32" | "u32" | "object";
  offset: number;           // always present, dense layout = slot
  type: TypeDesc;
  debugName: string;        // always present (empty string allowed)
};

type BuilderIR = {
  patchId: string;
  compiledAt: number;
  irVersion: string;
  seed: number;

  types: TypeDesc[];        // or a richer table, but single source of truth
  slotMeta: SlotMetaEntry[];

  signalExprs: SignalExprTableIR;
  fieldExprs: FieldExprTableIR;
  eventExprs: EventExprTableIR;

  stateLayout: StateLayoutIR;

  // schedule skeleton (unordered or partially ordered), resolved in Pass 8
  steps: StepIR[];

  // render wiring (sinks bind to slots produced by renderAssemble)
  render: RenderIR;

  sourceMap: SourceMapIR;
};
```

### StepIR (minimal set you need for feedback + render wiring)

```ts
type StepIR =
  | StepTimeDerive
  | StepSignalEval
  | StepFieldEval
  | StepEventEval
  | StepStateRead
  | StepStateWrite
  | StepMaterializeColor
  | StepMaterializePath
  | StepRenderAssemble;

type StepBase = { id: StepId; deps: StepId[] };

type StepStateRead = StepBase & {
  kind: "stateRead";
  stateOffset: number;
  outSlot: ValueSlot;
};

type StepStateWrite = StepBase & {
  kind: "stateWrite";
  stateOffset: number;
  inSlot: ValueSlot;
};

// The key feedback rule is: stateRead always reads previous committed state (t-1)
// stateWrite is committed after the schedule completes for the frame.
```

* * *

Module layout (so engineers don’t invent structure)
---------------------------------------------------

```
src/compiler/
  patch/
    PatchIR.ts                 // PatchIR + Role + EdgeIR + BlockInstanceIR
    normalize/
      normalizePatch.ts        // Pass 5
      NormalGraph.ts
      expandCombine.ts
      expandDefaultSources.ts
      expandStateModifiers.ts
      expandBuses.ts
  types/
    TypeDesc.ts                // TypeDesc, worlds, domains, arity/packing
    constraints.ts             // typevars + constraint types + solver
    blockDefs.ts               // canonical block library + constraint emitters
  lowering/
    lowerGraph.ts              // Pass 7
    slotAllocator.ts
    emitExpr.ts
    emitSteps.ts
  schedule/
    buildSchedule.ts           // Pass 8 (deps + topo)
  program/
    CompiledProgramIR.ts       // Pass 9 output schema (single file)
    finalizeProgram.ts

src/runtime/
  state/
    RuntimeState.ts
    StateBuffer.ts
    EventStore.ts
    FrameCache.ts
  executor/
    ScheduleExecutor.ts
    steps/
      executeTimeDerive.ts
      executeSignalEval.ts
      executeFieldEval.ts
      executeEventEval.ts
      executeStateRead.ts
      executeStateWrite.ts
      executeMaterializeColor.ts
      executeMaterializePath.ts
      executeRenderAssemble.ts
  render/
    Canvas2DRenderer.ts        // renderFrame(RenderFrameIR, runtime.values)
```

* * *

Step 5–9 implementation order (what to code first)
--------------------------------------------------

1.  **Normalization (Pass 5) with CombineNode expansion**  
    Implement: `groupIncomingEdgesByInputPort()` → `emitCombineNode()` → rewrite edges.
2.  **Type system skeleton (Pass 6)**  
    Implement TypeDesc + solver with just `Eq`, `WorldIs`, `DomainIs`, `ArityIs`, `SupportsCombine`.  
    Add `SupportsCombine` legality table per `(world,domain,mode)`.
3.  **Slot allocator + SlotMeta emission (Pass 7)**  
    Deterministic slot assignment: incrementing counter, allocate `arity` slots per output, record SlotMetaEntry for each lane.
4.  **State feedback core (Pass 7 + 8 + runtime)**  
    Implement `stateRead/stateWrite` steps + runtime commit semantics.
5.  **Schedule deps (Pass 8)**  
    For each step, deps are the steps that write the slots it reads plus any required ordering constraints (e.g., stateWrite after computations).
6.  **FinalizeProgram (Pass 9)**  
    Freeze everything into `CompiledProgramIR` and delete all other schema entry points.

That is the plan for Steps 5–9 as a single mandatory architecture path.



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)