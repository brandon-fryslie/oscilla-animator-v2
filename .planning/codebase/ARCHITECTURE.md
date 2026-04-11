# Architecture

**Analysis Date:** 2026-04-05

## Pattern Overview

**Overall:** Strangler fig pattern with dual compilation backends, data-flow-driven execution, and spec-conformant invariant enforcement.

**Key Characteristics:**
- **Dual backends coexist** — V1 backend (legacy, scheduled for removal) and C1 backend (new, GPU-accelerated)
- **Spec-driven architecture** — All implementation conforms to `design-docs/CANONICAL-oscilla-v2.5-20260109/`
- **Single code path per pipeline** — Separate codepaths for V1 and C1, each self-contained with no feature flags
- **Dataflow, not control flow** — Variability lives in data (null/empty/discriminated unions), not in whether operations execute
- **Strict boundary enforcement** — Rust/WASM renderer separated via JSON protocol; type system crossing requires validation

## Layers (Bottom-up)

**[LAW:one-way-deps] Dependencies point upward; cycles forbidden**

### Layer 1: Core Types & Constants

**Purpose:** Define canonical data structures and typed ID system

**Location:** `src/core/`, `src/types/`

**Key files:**
- `src/core/canonical-types/` — CanonicalType = { payload, unit, extent }. Single authority for all typing
- `src/core/ids.ts` — Branded ID types (InstanceId, CardinalityVarId, ValueExprId, etc.)
- `src/core/domain-registry.ts` — Domain registration system (Circle, Grid, Shape, etc.)
- `src/types/index.ts` — Role enums (BlockRole, EdgeRole), UI control hints

**Exports:**
- `CanonicalType` with `PayloadType` (9 kinds: float, int, bool, vec2/3/4, shape2d/3d, color)
- `Axis<T, V>` for extent modeling (cardinality, temporality, binding, perspective, branch)
- Branded ID types (all values must be created via branded constructors, never strings)
- `deriveKind(type: CanonicalType): 'signal' | 'field' | 'event'` — derived from extent, not stored

**Invariants:**
- Every value has a CanonicalType; no parallel type systems allowed
- Axis vars (`kind: 'var'`) are inference-only; must not escape frontend into backend/runtime
- One UnitType per CanonicalType; unit resolution is deterministic

---

### Layer 2: Graph Model

**Purpose:** User-facing graph representation (Patch/Block/Edge)

**Location:** `src/graph/`

**Key files:**
- `src/graph/Patch.ts` — Patch (user intent), Block, Edge, Endpoint, LensAttachment
- `src/graph/index.ts` — Public exports (adapters, edge alias derivation)

**What Patch MUST represent:**
- Blocks with stable IDs and user-assignable instance params
- Edges with stable IDs and per-port endpoint properties
- Lens attachments (value transformations on ports)
- DefaultSource overrides (for ports requiring explicit defaults)

**What Patch MUST NOT represent:**
- Inferred types, resolved payloads, resolved units
- Constraint solver artifacts (type vars, cardinality vars)
- Compiled artifacts (slots, schedules, indices)
- Runtime caches

**Exports:**
- `Patch` — immutable user graph (Blocks Map, Edges array, obligations array)
- `Block` — id, type, instance params, instance domains, ports (inputs/outputs)
- `Edge` — id, from/to endpoints, role (signal/field/event)
- `LensAttachment` — user-applied value transformations per port

---

### Layer 3: Block Registry & Definition

**Purpose:** Register all blocks with metadata and lowering rules

**Location:** `src/blocks/` (V1 legacy), `src/blocks-v2/` (C1 new)

**Key files:**
- `src/blocks/registry.ts` — Block definition system, `BlockDef` interface, `defineBlock()` registration
- `src/blocks/adapter-spec.ts` — Adapter insertion rules (payload/unit coercion)
- `src/blocks-v2/index.ts` — C1 block registrations via `registerC1Block()`
- `src/blocks/{category}/` — V1 block definitions (math, time, field, layout, etc.) — **LEGACY**

**BlockDef structure:**
```typescript
interface BlockDef {
  readonly inputs: Record<PortId, InputDef>;      // Port metadata
  readonly outputs: Record<PortId, OutputDef>;
  readonly instanceParams: Record<string, ParamDef>;
  readonly lower: (ctx: LowerCtx, args: LowerArgs) => LowerResult;  // V1 lowering
  readonly capability?: 'render' | 'source' | 'adapter';           // Hints for frontend
  readonly blockPayloadMetadata?: BlockPayloadMetadata;             // For solver
  readonly unitBehavior?: 'preserve' | 'requireUnitless';           // Unit rules
}
```

**Exports:**
- `BLOCK_DEFS_BY_TYPE` — Global registry mapping type name to BlockDef
- `getBlockDefinition(type: string): BlockDef | undefined`
- `requireBlockDef(type: string): BlockDef` — throws if not found

**Rules:**
- V1 blocks: All blocks with `lower()` impl for V1 backend — do not extend further
- C1 blocks: New blocks in `blocks-v2/` registered via `registerC1Block()` — preferred path
- One lowering path per block; no branching on pipeline version

---

### Layer 4: Compiler Shared Infrastructure

**Purpose:** Shared IR types and builders used by both backend pipelines

**Location:** `src/compiler/ir/`

**Key files:**
- `src/compiler/ir/patches.ts` — TypedPatch, TypeResolvedPatch, PortKey
- `src/compiler/ir/Indices.ts` — Dense indexing schemes for blocks, ports, values, slots
- `src/compiler/ir/IRBuilderImpl.ts` — BlockIRBuilder, OrchestratorIRBuilder (expression/statement construction)
- `src/compiler/ir/program.ts` — CompiledProgramIR, Schedule (V1 output)
- `src/compiler/ir/lowerTypes.ts` — ValueRefExpr, ValueRefPacked (lowering value types)
- `src/compiler/ir/types.ts` — InstanceDecl, StableStateId, StorageClass

**Invariants:**
- BlockIRBuilder: Constructs expressions only (no schedule steps) — blocks cannot allocate slots
- OrchestratorIRBuilder: Full program construction (expressions, slots, steps, instances)
- TypedPatch: Read-only artifact from frontend; never mutated downstream
- PortKey format: `${blockIndex}:${portName}:${'in'|'out'}` (dense indices, used internally)

---

### Layer 5: Compiler Frontend

**Purpose:** Graph normalization, type inference, and validation — **SHARED** by both backends

**Location:** `src/compiler/frontend/`

**Pipeline (7 passes with fixpoint loop):**

1. **Composite Expansion** (`composite-expansion.ts`) — Inline composite blocks into primitive graph
2. **Draft Graph Building** (`draft-graph.ts`) — Create normalized graph representation from Patch
3. **Fixpoint Normalization** (`final-normalization.ts`) — Iterate until convergence:
   - Default source insertion (fill missing inputs)
   - Adapter insertion (auto-insert type coercion blocks)
   - Port indexing
   - Type solving (payload/unit constraint solver)
   - Cardinality solving (signal/field/event cardinality inference)
4. **Bridge** (`draft-graph-bridge.ts`) — Convert to NormalizedPatch (dense indices) and TypeResolvedPatch
5. **Type Graph** (`analyze-type-graph.ts`) — Derive TypedPatch (read-only UI artifact)
6. **Axis Validation** (`axis-validate.ts`) — Enforce cardinality/temporality/binding invariants
7. **Cycle Analysis** (`analyze-cycles.ts`) — Classify legal vs. illegal feedback loops

**Key components:**
- `src/compiler/frontend/cardinality/solve.ts` — Cardinality solver (instance propagation)
- `src/compiler/frontend/payload-unit/solve.ts` — Payload and unit constraint solver
- `src/compiler/frontend/policies/` — Default source policies, adapter insertion rules
- `src/compiler/frontend/axis-validate.ts` — **Single enforcer** for axis invariants

**Output:** `FrontendResult` with:
- `typedPatch` — User-facing typed graph (read-only reference)
- `normalizedPatch` — Backend-ready normalized graph (dense indices)
- `cycleSummary` — Cycle classification for UI display
- `backendReady` — Boolean flag; true if backend can proceed
- `errors[]` — Diagnostics (data, not control flow)

**[LAW:dataflow-not-control-flow] All 7 passes execute unconditionally; errors are data in FrontendResult.errors**

---

### Layer 6a: V1 Backend (Legacy)

**Purpose:** Lowering to JS runtime execution — **DEPRECATED, do not extend**

**Location:** `src/compiler/backend/`

**Pipeline (4 phases):**

1. **Dependency Graph** (`backend/index.ts`) — Build reverse dependency DAG
2. **Strongly Connected Components** — Identify feedback groups
3. **Lowering** (`lower-blocks.ts`) — Walk SCC order, lower each block via `BlockDef.lower()`
4. **Schedule Assembly** (`schedule-assembly.ts`) — Emit ScheduleIR (ordered steps for frame executor)

**Output:** `CompiledProgramIR` (JS-compatible IR for `src/runtime/` executor)

**Rules:**
- **Never fix bugs** in V1 backend — it's dead code being replaced by C1
- **Never add features** to V1 backend
- **Tests only:** Use V1 for backward-compat tests; prefer C1 for new work
- All lowering uses V1 `BlockDef.lower()` method

---

### Layer 6b: C1 Backend (New, ~5% block coverage)

**Purpose:** GPU-accelerated rendering via Rust/WASM — replaces V1

**Location:** `src/compiler/backend-v2/`

**Pipeline (5 phases):**

```
FrontendResult
    ↓
Topological Sort (topoSort.ts)
    ↓
Manifest Harvest (harvester.ts) — Blocks declare GPU resources
    ↓
Sink Discovery (sink-discovery.ts) — Find render sinks
    ↓
Lower & Fuse (lowering.ts) — Backward walk from sinks, multi-pass caching
    ↓
Roster Assembly (roster-assembly.ts) — Sort passes by precedence
    ↓
PipelineInstallPayload → Rust/WASM
```

**Key files:**
- `src/compiler/backend-v2/index.ts` — `compileC1()`, `compileC1FromNormalized()` entry points
- `src/compiler/backend-v2/types.ts` — `C1CompileResult` (ok/error discriminated union)
- `src/blocks-v2/` — C1 block implementations via `registerC1Block(type, { lower, ... })`

**C1 blocks (migrated so far):**
Const, Add, Subtract, Multiply, Divide, Sin, Cos, InfiniteTimeRoot (Time), InstanceIndex, RenderInstances2D (sink)

**Output:** `PipelineInstallPayload` with:
- `manifest` — GPU memory layout (globals, domains, fields, textures)
- `roster` — Passes (compute/render) with ExprIR/StatementIR bodies
- `functions?` — Optional WGSL function definitions

**[LAW:one-source-of-truth] C1 blocks use `registerC1Block()` in `blocks-v2/`; V1 uses `defineBlock()` in `blocks/`**

---

### Layer 7: Boundary Layer (TS ↔ Rust/WASM)

**Purpose:** Protocol and validation between TypeScript compiler and GPU renderer

**Location:** `src/render/rust/`

**Key files:**
- `src/render/rust/boundary-contract.ts` — Zod schemas (single source of truth)
  - `PipelineInstallPayload`, `MemoryManifest`, `ComputePassSpec`, `RenderPassSpec`
  - `ExprIR`, `StatementIR` — GPU-IR AST nodes
  - All Zod schemas; TS types derived via `z.infer<>`
- `src/render/rust/worker-protocol.ts` — Message types (BOOTSTRAP, INSTALL_PIPELINE, etc.)
- `src/render/gpu-ir/` — GPU-IR DSL compiler (TS arrow fns → ExprIR AST)
  - `src/render/gpu-ir/compile.ts` — DSL entry (`gpu()`, `compute()`, `render()`, etc.)
  - `src/render/gpu-ir/walker.ts` — Arrow function parser (uses TS compiler API)
  - `src/render/gpu-ir/ir-builders.ts` — Shared builders (DSL + reverse translator)
  - `src/render/gpu-ir/ir-node-rules.ts` — Operator tables (forward + inverse direction)

**Protocol (TS → Worker):**
- BOOTSTRAP — Initialize renderer with WASM + OffscreenCanvas
- INSTALL_PIPELINE — Deploy PipelineInstallPayload (JSON-serialized)
- PAUSE/RESUME — Playback control

**Protocol (Worker → TS):**
- BOOTSTRAP_SUCCESS — Renderer ready
- INSTALL_PIPELINE_SUCCESS/FAILURE — Deployment receipt
- SCHEDULER_HEARTBEAT — Health status (frame count, FPS)
- ENGINE_ERROR — GPU validation or OOM

**[LAW:one-source-of-truth] `boundary-contract.ts` is the single authority; Rust uses serde to deserialize**

---

### Layer 8: Rust/WASM Renderer

**Purpose:** GPU compute + render execution on WebGPU

**Location:** `src/render/wasm/rust/oscilla-rust-renderer/`

**Key responsibilities:**
- Deserialize `PipelineInstallPayload` from TS
- Translate GPU-IR AST → naga::Module (WGSL IR)
- Compile naga modules → WGSL source → WebGPU pipelines
- Manage GPU memory (MMU with ArenaAlloc + StrictAllocator)
- Execute compute/render passes (zero-allocation hot path)

**Constraints:**
- **Zero-allocation hot path:** StrictAllocator lock/unlock for frame-to-frame execution
- **Pre-allocated VRAM:** GpuMemoryArena — sizes declared in manifest
- **Indirect draw:** GPU determines instance count (no CPU read-back loop)

---

### Layer 9: Services & Orchestration

**Purpose:** Wire compilation, runtime, and state management together

**Location:** `src/services/`

**Key files:**
- `src/services/CompileOrchestrator.ts` — **Single compile path**
  - Runs frontend (V1 blocks) → V1 backend → runtime state migration
  - Sets up debug probe (slot→value mappings)
  - **LEGACY:** Only used for V1 pipeline; C1 has own test harness
- `src/services/AsyncCompilerService.ts` — Compile in web worker
- `src/services/CompileWorkerClient.ts` — Compile worker bridge
- `src/services/RuntimeService.ts` — Runtime frame executor
- `src/services/AnimationLoop.ts` — **LEGACY:** V1 frame loop
- `src/services/DebugService.ts` — Debug value observation
- `src/services/LiveRecompile.ts` — Hot-swap orchestration

---

### Layer 10: MobX Stores (State Management)

**Purpose:** Reactive state container; single owner of all application state

**Location:** `src/stores/`

**Key stores:**
- `RootStore` — Composition root; owns all child stores
- `PatchStore` — User graph (canonical; UI reads/writes here)
- `FrontendResultStore` — Frontend output (typed graph, diagnostics)
- `PlaybackStore` — Playback state (time, speed, recording)
- `SettingsStore` — Editor settings (debug flags, UI preferences)
- `SelectionStore` — Selected blocks/edges for UI
- `DiagnosticsStore` — Collected diagnostics from all compilation phases
- `DebugStore` — Runtime value observation
- `ViewportStore`, `CameraStore` — Rendering viewport/camera state
- `HelpStore`, `ExpressionEditorStore`, `CompositeEditorStore` — Feature-specific stores

**Architecture:**
- **One-way dependency:** UI → Stores (via `useRootStore()` hook)
- **MobX reaction system:** Auto-triggers re-render on observable changes
- **Single instance:** Created in `RootStore`, accessed via React Context

---

### Layer 11: Compiler Tester

**Purpose:** Standalone test harness for C1 backend (bypasses V1 frontend)

**Location:** `src/compiler-tester/`

**Key files:**
- `src/compiler-tester/CompilerTesterApp.tsx` — React app at `/compiler-tester.html`
- `src/compiler-tester/fixtures/` — Test graphs (spinning-ring.ts, dynamic-ring.ts, etc.)

**Flow:**
1. Graph fixture → `compileC1FromNormalized()` (direct, no frontend)
2. PipelineInstallPayload → Rust renderer
3. Visual output to canvas

**Used by:** Screenshot validation scripts (`scripts/get-screenshot-of-compiler-tester.sh`)

---

### Layer 12: UI & Editor

**Purpose:** React-based user interface for graph editing

**Location:** `src/ui/`

**Key components:**
- `src/ui/components/app/` — Top-level App layout + sidebar
- `src/ui/reactFlowEditor/` — ReactFlow-based graph visualization
- `src/ui/dockview/` — Dockview panel layout system
- `src/ui/debug-viz/` — Live value visualization (hover ports to see values)
- `src/ui/graphEditor/` — Graph editing operations (add/remove blocks, rewire edges)
- `src/ui/expression-editor/` — Expression value editing

**Data flow:**
- UI read from `RootStore.patchStore.patch` (canonical user intent)
- UI dispatch actions to stores (via MobX `action()`)
- Stores trigger re-renders (MobX reactions)
- **Never:** UI writes directly to compiled artifacts or inferred types

---

## Data Flow

### V1 Pipeline (Legacy)

```
User patches Patch
        ↓
RootStore.patchStore.patch (canonical)
        ↓
CompileOrchestrator.compile(patch)
    ├─ compileFrontend(patch) → FrontendResult
    │  ├─ Composite expansion
    │  ├─ Draft graph build
    │  ├─ Fixpoint normalization
    │  └─ Type solving
    │
    └─ Backend (V1)
       ├─ Dependency graph + SCC
       ├─ Block lowering
       └─ Schedule assembly → CompiledProgramIR
           ↓
       RuntimeService.execute(program, state)
           ↓
       Slot values updated (state.slots[])
           ↓
       Debug probe maps slot→edge for UI visualization
           ↓
       Canvas rendered by V1 stub renderer (displays frame count)
```

### C1 Pipeline (New, GPU-Accelerated)

```
User patches Patch
        ↓
RootStore.patchStore.patch (canonical)
        ↓
compileFrontend(patch) → FrontendResult
    ├─ Composite expansion
    ├─ Draft graph build
    ├─ Fixpoint normalization
    └─ Type solving + cardinality solving
        ↓
compileC1(frontendResult)
    ├─ Topo sort
    ├─ Manifest harvest
    ├─ Sink discovery
    ├─ Lower & fuse → ExprIR/StatementIR passes
    └─ Roster assembly → PipelineInstallPayload
        ↓
    JSON-serialize payload
        ↓
    Send INSTALL_PIPELINE message to Rust worker
        ↓
    Rust translator: ExprIR/StatementIR → naga::Module
        ↓
    Naga compiler: WGSL code → WebGPU pipelines
        ↓
    GPU execution: Compute passes → Render passes
        ↓
    Canvas displayed (direct WebGPU rendering)
```

---

## State Management Strategy

**[LAW:one-source-of-truth] Patch is canonical; everything else is derived**

- **Patch** — User intent, read from `RootStore.patchStore.patch`, written only by UI
- **FrontendResult** — Compiler output, cached in `FrontendResultStore`
- **RuntimeState** — V1 execution state, managed by `RuntimeService`
- **Debug mappings** — Edge→Slot and Port→Slot, maintained by `DebugService`

**No dual representation:** If a fact is stored in two places, one is derived from the other (explicitly marked as such).

---

## Error Handling

**Strategy:** Collect as data, propagate without throwing (except at boundaries)

**Patterns:**
- Frontend: All errors collected in `FrontendResult.errors[]` — compilation always completes
- Backend: `C1CompileResult = { kind: 'ok', payload } | { kind: 'error', errors[] }`
- Services: Errors logged to `DiagnosticsStore` for UI display
- Runtime: Errors reported via debug probe; no silent failures

**[LAW:dataflow-not-control-flow] Error presence is data (in errors array), not control flow that stops execution**

---

## Cross-Cutting Concerns

**Logging:** `debugService`, `DiagnosticsStore`, console (dev only)

**Validation:**
- Type system: `axis-validate.ts` (single gate)
- Block definitions: `requireBlockDef()` enforces registry completeness
- Boundary contract: Zod schemas validate at TS/Rust crossing

**Authentication:** Not applicable (single-user editor)

**Caching:**
- Frontend: TypedPatch cached in FrontendResultStore
- Compiler: Pass outputs cached during backend compilation
- Runtime: Frame cache (FrameCache) — transient per-frame allocations

---

## Key Abstractions

**CanonicalType:**
- Single authority for type representation
- Payload (what value) + Unit (semantics) + Extent (cardinality/temporality)
- Never parallel type systems
- Example: `{ payload: 'vec3', unit: 'unitNone()', extent: { cardinality: many(...) } }`

**ExprIR / StatementIR:**
- GPU-IR AST nodes (cross TS/Rust boundary)
- ExprIR: Pure expressions (no side effects)
- StatementIR: Imperative statements (loop, if, etc.)
- Defined via Zod schemas in boundary-contract.ts

**BlockDef / C1Block:**
- V1: `BlockDef` with `lower()` method → JS IR
- C1: `registerC1Block()` → GPU IR lowering
- One lowering path per block; choose pipeline, not both

**PipelineInstallPayload:**
- Manifest (GPU memory layout) + Roster (passes with AST bodies)
- JSON-serializable; single source of GPU execution intent

---

## Entry Points

**Application:**
- `src/index.ts` — Top-level exports (compile, graph, types, blocks)

**Compilation:**
- `src/compiler/index.ts` — `compile()` entry (V1 path)
- `src/compiler/frontend/index.ts` — `compileFrontend()` (shared frontend)
- `src/compiler/backend-v2/index.ts` — `compileC1()`, `compileC1FromNormalized()` (C1 new)

**Rendering:**
- `src/render/rust/worker-protocol.ts` — Message protocol definition
- `src/render/gpu-ir/compile.ts` — GPU-IR DSL (`gpu()`, `compute()`, `render()`)
- `src/render/wasm/rust/oscilla-rust-renderer/src/main.rs` — Rust worker entry

**UI:**
- `src/ui/components/app/index.ts` — App component
- `src/index.html` — Main editor entry (`/`)
- `src/compiler-tester/index.html` — Compiler tester entry (`/compiler-tester.html`)

---

*Architecture analysis: 2026-04-05*
