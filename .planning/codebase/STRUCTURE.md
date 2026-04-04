# Codebase Structure

**Analysis Date:** 2026-04-05

## Directory Layout

```
src/
├── core/                         # Type system & constants (Layer 1)
│   ├── canonical-types/          # Single authority for CanonicalType
│   │   ├── CanonicalType.ts      # Type definition
│   │   ├── index.ts              # Public exports
│   │   └── ...
│   ├── color/                    # Color manipulation utilities
│   ├── ids.ts                    # Branded ID types (InstanceId, ValueExprId, etc.)
│   ├── domain-registry.ts        # Domain registration system
│   ├── canonical-name.ts         # Name normalization
│   └── inference-types.ts        # Type inference solver types
│
├── types/                        # Enums & UI control hints (Layer 1)
│   └── index.ts                  # BlockRole, EdgeRole, ValueSlot, etc.
│
├── graph/                        # User-facing graph (Layer 2)
│   ├── Patch.ts                  # User graph (Block, Edge, Endpoint, LensAttachment)
│   ├── index.ts                  # Public exports (normalize, adapters, edge-alias)
│   ├── edge-alias.ts             # Edge role derivation
│   ├── lens-id.ts                # Lens attachment ID generation
│   ├── normalize.ts              # Type-only normalizer (no mutations)
│   └── __tests__/
│
├── blocks/                       # V1 Block registry (LEGACY — Layer 3)
│   ├── registry.ts               # Block definitions, BLOCK_DEFS_BY_TYPE
│   ├── adapter-spec.ts           # Adapter insertion rules
│   ├── math/                     # Math blocks (Add, Multiply, Sin, Cos, etc.)
│   ├── time/                     # Time blocks (Time, Delay, UnitDelay, etc.)
│   ├── field/                    # Field ops (Broadcast, Reduce, StateField, etc.)
│   ├── layout/                   # Layout blocks (CircleLayout, GridLayout) — LEGACY
│   ├── shape/                    # Shape construction
│   ├── color/                    # Color ops
│   ├── io/                       # Input/output blocks
│   ├── instance/                 # Instance-related blocks
│   ├── domain/                   # Domain blocks (InstanceDomain, etc.)
│   ├── render/                   # Render sink blocks (RenderInstances2D — V1)
│   ├── composites/               # Composite/macro blocks
│   ├── adapter/                  # Adapter blocks (type coercion)
│   ├── event/                    # Event blocks
│   ├── lens/                     # Lens blocks
│   ├── dev/                      # Development/debug blocks
│   ├── scalar/                   # Scalar operation blocks
│   └── __tests__/
│
├── blocks-v2/                    # C1 Block registry (NEW — Layer 3)
│   ├── index.ts                  # C1 block registrations
│   ├── all.ts                    # Import all C1 blocks
│   ├── const.ts                  # Const block (C1)
│   ├── math-binary.ts            # Add, Subtract, Multiply, Divide (C1)
│   ├── math-unary.ts             # Sin, Cos, etc. (C1)
│   ├── time.ts                   # InfiniteTimeRoot/Time (C1)
│   ├── instance-index.ts         # InstanceIndex (C1)
│   ├── render-instances-2d.ts    # RenderInstances2D sink (C1)
│   └── __tests__/
│
├── compiler/                     # Compiler (Layers 4-6)
│   ├── index.ts                  # Public exports (compile, IR types)
│   ├── compile.ts                # V1 compile entry point
│   ├── compile-worker-protocol.ts # Worker protocol types
│   ├── types.ts                  # CompileResult discriminated union
│   ├── diagnostic-flags.ts       # Configurable severity levels
│   ├── partial.ts                # Partial compilation support
│   │
│   ├── ir/                       # Shared IR (Layer 4)
│   │   ├── patches.ts            # TypedPatch, TypeResolvedPatch, PortKey
│   │   ├── Indices.ts            # Dense indexing (BlockIndex, PortIndex, etc.)
│   │   ├── IRBuilderImpl.ts       # BlockIRBuilder, OrchestratorIRBuilder
│   │   ├── BlockIRBuilder.ts     # Expression-only builder for blocks
│   │   ├── lowerTypes.ts         # ValueRefExpr, ValueRefPacked, lowering value types
│   │   ├── program.ts            # CompiledProgramIR, ScheduleIR (V1 output)
│   │   ├── types.ts              # InstanceDecl, StableStateId, StorageClass
│   │   ├── NormalizedPatch.ts    # Dense-indexed patch after normalization
│   │   ├── naga-emitter/         # WGSL code generation (legacy, V1 only)
│   │   └── __tests__/
│   │
│   ├── frontend/                 # Frontend (Layer 5) — shared by both backends
│   │   ├── index.ts              # compileFrontend(), FrontendResult, FrontendOptions
│   │   ├── analyze-type-graph.ts # Type graph construction (TypedPatch)
│   │   ├── analyze-cycles.ts     # Feedback loop classification
│   │   ├── axis-validate.ts      # **Single enforcer** for axis invariants
│   │   ├── draft-graph.ts        # DraftGraph construction from Patch
│   │   ├── draft-graph-bridge.ts # Bridge to NormalizedPatch
│   │   ├── final-normalization.ts# Fixpoint loop (defaults, adapters, types, cardinality)
│   │   ├── composite-expansion.ts# Inline composite blocks
│   │   ├── fixpoint-diagnostic.ts# Diagnostic types (data-driven)
│   │   ├── frontendDiagnosticConversion.ts # Error conversion
│   │   │
│   │   ├── cardinality/          # Cardinality solver
│   │   │   ├── solve.ts          # Cardinality constraint solver
│   │   │   ├── propagate.ts      # Instance propagation
│   │   │   └── ...
│   │   │
│   │   ├── payload-unit/         # Payload/unit solver
│   │   │   ├── solve.ts          # Constraint solver (rewrite: single authority)
│   │   │   ├── extract-constraints.ts # BlockPayloadMetadata processing
│   │   │   └── ...
│   │   │
│   │   ├── policies/             # Frontend policies
│   │   │   ├── default-source-policy.ts  # Missing input handling
│   │   │   ├── adapter-insertion.ts      # Auto-insert type coercion blocks
│   │   │   └── ...
│   │   │
│   │   ├── normalize-indexing.ts # Normalize to NormalizedPatch with dense indices
│   │   └── __tests__/
│   │
│   ├── backend/                  # V1 Backend (Layer 6a) — **LEGACY**
│   │   ├── index.ts              # Legacy compile entry (not used for new work)
│   │   ├── lower-blocks.ts       # Block lowering orchestrator
│   │   ├── lower-rules.ts        # Special lowering rules
│   │   ├── binding-pass.ts       # Binding analysis
│   │   ├── render-materialization-pipeline.ts # V1 render block lowering
│   │   ├── compiled-runtime-install-contract.ts # V1 runtime contract
│   │   └── __tests__/
│   │
│   └── backend-v2/               # C1 Backend (Layer 6b) — NEW
│       ├── index.ts              # compileC1(), compileC1FromNormalized()
│       ├── types.ts              # C1CompileResult, C1CompileError
│       ├── topo-sort.ts          # Phase 1: Topological sort
│       ├── harvester.ts          # Phase 2: GPU resource manifest harvest
│       ├── sink-discovery.ts     # Phase 3: Find render sinks
│       ├── lowering.ts           # Phase 4: Backward walk + ExprIR lowering
│       ├── roster-assembly.ts    # Phase 5: Sort passes by precedence
│       ├── pass-scope-manager.ts # Multi-fanout caching per pass
│       └── __tests__/
│
├── render/                       # Rendering (Layers 7-8)
│   ├── rust/                     # Boundary layer (Layer 7)
│   │   ├── boundary-contract.ts  # Zod schemas (single source of truth)
│   │   │                         # — PipelineInstallPayload, ExprIR, StatementIR
│   │   ├── worker-protocol.ts    # Message types (BOOTSTRAP, INSTALL_PIPELINE, etc.)
│   │   ├── engine.worker.ts      # Worker bridge (message handling)
│   │   ├── fixtures/             # GPU-IR test fixtures
│   │   │   ├── index.ts          # Fixture exports
│   │   │   ├── spinning-ring.ts  # Minimal fixture (spinning ring)
│   │   │   └── ...
│   │   └── __tests__/
│   │
│   ├── gpu-ir/                   # GPU-IR DSL compiler (Layer 7)
│   │   ├── compile.ts            # DSL entry (gpu(), compute(), render(), etc.)
│   │   ├── walker.ts             # Arrow function parser (TS compiler API)
│   │   ├── ir-builders.ts        # Shared builders (DSL + reverse translator)
│   │   ├── ir-node-rules.ts      # Operator tables (forward + inverse)
│   │   ├── types.ts              # GPU-IR type definitions
│   │   ├── manifest.ts           # Manifest expansion
│   │   ├── deps.ts               # Dependency inference
│   │   ├── stdlib.ts             # Standard library functions
│   │   ├── reverse.ts            # Reverse translator (GPU-IR → block expressions)
│   │   ├── reverse-payload.ts    # Payload lifting
│   │   ├── shapes.ts             # Shape DSL helpers
│   │   ├── IR-REFERENCE.md       # GPU-IR documentation
│   │   ├── README.md             # Usage guide
│   │   └── __tests__/
│   │
│   ├── wasm/                     # WASM integration
│   │   ├── rust/                 # Rust renderer crate
│   │   │   └── oscilla-rust-renderer/ # Main renderer (Layer 8)
│   │   │       ├── src/
│   │   │       │   ├── main.rs           # Worker entry point
│   │   │       │   ├── translator.rs    # GPU-IR → naga::Module
│   │   │       │   ├── dsl.rs          # Naga DSL builders
│   │   │       │   ├── mmu.rs          # GPU memory manager
│   │   │       │   ├── scheduler.ts    # Pass execution
│   │   │       │   └── ...
│   │   │       ├── Cargo.toml
│   │   │       └── pkg/                # Generated WASM bindings
│   │   │
│   │   └── pkg/                   # WASM package output
│   │
│   ├── webgpu/                   # WebGPU facade (stub, being rebuilt)
│   │   ├── Canvas.ts
│   │   └── __tests__/
│   │
│   └── webgl/                    # WebGL (legacy, not actively used)
│
├── runtime/                      # V1 Runtime executor (LEGACY — Layer 9)
│   ├── index.ts                  # Public exports
│   ├── ScheduleExecutor.ts       # Frame executor
│   ├── RuntimeState.ts           # Execution state (slots, field buffers)
│   ├── kernels/                  # Runtime kernels
│   │   ├── field-kernel.ts       # Field operation executor
│   │   ├── scalar-kernel.ts      # Scalar operation executor
│   │   └── ...
│   ├── timeResolution.ts         # Time model resolution
│   ├── ExprAddressTable.ts       # Expression-to-address mapping
│   ├── __benchmarks__/           # Performance benchmarks
│   ├── __tests__/
│   └── README.md                 # Runtime architecture doc
│
├── services/                     # Orchestration (Layer 9)
│   ├── CompileOrchestrator.ts    # **Single compile path** (V1)
│   ├── AsyncCompilerService.ts   # Compile in web worker
│   ├── CompileWorkerClient.ts    # Worker communication bridge
│   ├── RuntimeService.ts         # Frame executor (V1)
│   ├── AnimationLoop.ts          # V1 playback loop
│   ├── DebugService.ts           # Runtime value observation
│   ├── LiveRecompile.ts          # Hot-swap orchestration
│   ├── ConstantValueTracker.ts   # Extract constants from eliminated blocks
│   ├── mapDebugEdges.ts          # Edge→slot mapping
│   ├── PatchPersistence.ts       # Patch serialization
│   └── __tests__/
│
├── stores/                       # MobX state (Layer 10)
│   ├── RootStore.ts              # Composition root
│   ├── PatchStore.ts             # User graph (canonical)
│   ├── FrontendResultStore.ts    # Compiler output (typed graph)
│   ├── PlaybackStore.ts          # Animation playback
│   ├── SettingsStore.ts          # Editor settings
│   ├── SelectionStore.ts         # Selection state
│   ├── DiagnosticsStore.ts       # Aggregated diagnostics
│   ├── DebugStore.ts             # Runtime value observation
│   ├── ViewportStore.ts          # Rendering viewport
│   ├── CameraStore.ts            # Camera state
│   ├── LayoutStore.ts            # Dockview panel layout
│   ├── HelpStore.ts              # Help panel state
│   ├── CompositeEditorStore.ts   # Composite editing state
│   ├── ExpressionEditorStore.ts  # Expression editing state
│   ├── DemoStore.ts              # Demo/fixture state
│   ├── PortHighlightStore.ts     # Port hover state
│   ├── configure.ts              # MobX configuration
│   └── __tests__/
│
├── compiler-tester/              # C1 test harness (Layer 11)
│   ├── index.html                # Entry point (`/compiler-tester.html`)
│   ├── CompilerTesterApp.tsx     # React app
│   ├── fixtures/                 # Test graphs
│   │   ├── spinning-ring.ts      # Minimal test (spinning ring, 64 dots)
│   │   ├── dynamic-ring.ts       # Full math test
│   │   └── index.ts
│   └── __tests__/
│
├── ui/                           # React UI (Layer 12)
│   ├── components/
│   │   ├── app/                  # Top-level App layout + sidebar
│   │   │   ├── App.tsx
│   │   │   ├── AppSidebar.tsx
│   │   │   └── ...
│   │   ├── common/               # Shared UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Dialog.tsx
│   │   │   └── ...
│   │   └── __tests__/
│   │
│   ├── reactFlowEditor/          # Graph visualization (ReactFlow)
│   │   ├── GraphEditor.tsx       # Main graph view
│   │   ├── nodes/                # Node rendering
│   │   ├── edges/                # Edge rendering
│   │   ├── menus/                # Context menus
│   │   ├── hooks/                # ReactFlow hooks
│   │   └── __tests__/
│   │
│   ├── graphEditor/              # Graph editing operations
│   │   ├── add-block.ts
│   │   ├── connect-edge.ts
│   │   ├── select-blocks.ts
│   │   └── ...
│   │
│   ├── dockview/                 # Dockview panel system
│   │   ├── DockviewPanel.tsx
│   │   ├── panels/               # Panel definitions
│   │   │   ├── GraphPanel.tsx
│   │   │   ├── PropertiesPanel.tsx
│   │   │   ├── DiagnosticsPanel.tsx
│   │   │   └── ...
│   │   └── __tests__/
│   │
│   ├── debug-viz/                # Live value visualization
│   │   ├── DebugViz.tsx
│   │   ├── charts/               # Chart renderers
│   │   ├── renderers/            # Value renderers
│   │   └── ...
│   │
│   ├── expression-editor/        # Expression value editing
│   │   ├── ExpressionEditor.tsx
│   │   └── ...
│   │
│   ├── authoring/                # User content creation tools
│   │   └── ...
│   │
│   ├── editorCommon/             # Shared editor utilities
│   │   ├── syntaxHighlight.ts
│   │   └── ...
│   │
│   ├── hooks/                    # React hooks
│   │   ├── useRootStore.tsx      # Store access
│   │   ├── usePatch.tsx          # Patch shorthand
│   │   └── ...
│   │
│   ├── hotkeys/                  # Keyboard shortcuts
│   │   ├── hotkey-registry.ts
│   │   └── ...
│   │
│   └── __tests__/
│
├── diagnostics/                  # Error/warning system
│   ├── types.ts                  # Diagnostic interface
│   ├── validators/               # Validation passes
│   │   ├── axis-validation.ts
│   │   └── ...
│   ├── DiagnosticHub.ts          # Event hub for diagnostics
│   ├── actionExecutor.ts         # Execute diagnostic actions
│   └── __tests__/
│
├── events/                       # Event system
│   ├── EventHub.ts               # Pub/sub event hub
│   └── ...
│
├── demo/                         # Demo/fixture content
│   ├── hcl/                      # HCL patch syntax
│   │   ├── parser.ts
│   │   ├── serializer.ts
│   │   ├── examples/             # Demo patches
│   │   │   ├── simple.hcl
│   │   │   ├── breathing-ring.hcl
│   │   │   └── ...
│   │   ├── features/             # Feature demonstration patches
│   │   ├── showcase/             # Showcase patches
│   │   ├── stress/               # Stress test patches
│   │   ├── integration/          # Integration test patches
│   │   └── __tests__/
│   └── __tests__/
│
├── patch-dsl/                    # Patch serialization
│   ├── index.ts                  # Parse/serialize HCL
│   └── __tests__/
│
├── shapes/                       # Shape utilities
│   ├── Shape.ts                  # Shape interface
│   ├── text/                     # Text shape rendering
│   └── __tests__/
│
├── expr/                         # Expression utilities
│   ├── Expression.ts
│   └── __tests__/
│
├── help/                         # Help/documentation
│   ├── index.ts
│   └── __tests__/
│
├── settings/                     # Settings management
│   ├── tokens/                   # Design tokens (colors, sizes)
│   └── index.ts
│
├── utilities/                    # General utilities
│   ├── id-generation.ts
│   ├── arrays.ts
│   ├── objects.ts
│   └── ...
│
├── test-utils/                   # Testing helpers
│   ├── create-patch.ts           # Patch builders
│   ├── create-fixture.ts         # Fixture builders
│   └── ...
│
├── testing/                      # Test infrastructure
│   ├── index.ts
│   └── __tests__/
│
├── payload-tester/               # Payload testing UI
│   └── ...
│
├── wasm/                         # WASM integration root
│   └── index.ts
│
├── index.ts                      # **Main entry point**
│   └── Exports: compile, graph, types, blocks
│
├── index.html                    # Main editor entry (`/`)
├── compiler-tester/index.html    # Compiler tester entry (`/compiler-tester.html`)
├── payload-tester/index.html     # Payload tester entry (`/payload-tester.html`)
│
└── __tests__/                    # Top-level tests
    ├── forbidden-patterns.test.ts # Architectural constraint enforcement
    └── ...

dist/                            # Build output (generated, not committed)
design-docs/                     # Specification & design documents
.planning/codebase/              # GSD codebase analysis documents
  ├── ARCHITECTURE.md            # This layer breakdown
  ├── STRUCTURE.md               # This file (directory guide)
  ├── STACK.md                   # Technology stack (if generated)
  ├── INTEGRATIONS.md            # External integrations (if generated)
  ├── CONVENTIONS.md             # Code style & naming (if generated)
  ├── TESTING.md                 # Testing patterns (if generated)
  └── CONCERNS.md                # Technical debt (if generated)
```

---

## Directory Purposes

### Core Layer (`src/core/`)
**Purpose:** Type system, constants, branded IDs
**Key files:**
- `canonical-types/` — Single authority for CanonicalType = { payload, unit, extent }
- `ids.ts` — Branded ID types (InstanceId, ValueExprId, CardinalityVarId, etc.)
- `domain-registry.ts` — Domain registration (Shape, Circle, Grid, Control, Event)
- `inference-types.ts` — Type inference solver types (PayloadVar, UnitVar)

**Generated:** No
**Committed:** Yes
**Public API:** `src/types/index.ts` re-exports canonical exports

---

### Graph Layer (`src/graph/`)
**Purpose:** User-facing graph model (Patch)
**Key files:**
- `Patch.ts` — Block, Edge, Endpoint, LensAttachment definitions
- `normalize.ts` — Type-only export (no mutations)
- `edge-alias.ts` — Derive edge role from context
- `adapters.ts` — Adapter insertion rules

**Generated:** No
**Committed:** Yes
**Invariants:** Patch must NOT contain inferred types, compiled artifacts, or runtime caches

---

### Block Registry (`src/blocks/`, `src/blocks-v2/`)
**Purpose:** Register all blocks with metadata and lowering

**V1 (Legacy):** `src/blocks/`
- Each category (math, time, field, etc.) defines blocks via `defineBlock()`
- All export to `src/blocks/registry.ts` → `BLOCK_DEFS_BY_TYPE`
- **Do not extend further** — this is legacy code

**C1 (New):** `src/blocks-v2/`
- Blocks registered via `registerC1Block()` → C1 IR lowering
- Single `all.ts` imports all registrations (side-effect registration on module load)
- **New blocks go here**

**Generated:** No
**Committed:** Yes
**Rules:** One lowering path per block; never dual implementations

---

### Compiler Frontend (`src/compiler/frontend/`)
**Purpose:** Graph normalization + type inference (shared by both backends)
**Key subdirectories:**
- `cardinality/` — Instance propagation solver
- `payload-unit/` — Payload/unit constraint solver
- `policies/` — Default source insertion, adapter insertion
- Core passes: `composite-expansion.ts`, `draft-graph.ts`, `final-normalization.ts`, `analyze-type-graph.ts`, `axis-validate.ts`

**Generated:** No
**Committed:** Yes
**Critical:** All passes execute unconditionally; errors are data in FrontendResult

---

### Compiler Backends (`src/compiler/backend/`, `src/compiler/backend-v2/`)
**Purpose:** Lowering to executable IR

**V1 Backend** (`src/compiler/backend/`)
- **Legacy — do not extend**
- Produces CompiledProgramIR for JS runtime
- Only 4 files: index.ts, lower-blocks.ts, binding-pass.ts, etc.

**C1 Backend** (`src/compiler/backend-v2/`)
- **New — preferred path**
- 5-phase pipeline: topo-sort, harvest, sink-discovery, lowering, roster-assembly
- Produces PipelineInstallPayload for Rust/WASM renderer
- Requires C1 blocks in `blocks-v2/`

**Generated:** No
**Committed:** Yes

---

### GPU-IR DSL (`src/render/gpu-ir/`)
**Purpose:** TS arrow function DSL for PipelineInstallPayload
**Key files:**
- `compile.ts` — DSL entry (gpu(), compute(), render(), draw())
- `walker.ts` — Arrow function parser (TS compiler API)
- `ir-builders.ts` — Shared builders (used by DSL + reverse translator)
- `ir-node-rules.ts` — Operator tables (forward direction + inverse lookup)
- `IR-REFERENCE.md` — Complete IR documentation

**Generated:** No
**Committed:** Yes
**Constraints:** No string parsing DSL; strict TS typing requirement

---

### Boundary Layer (`src/render/rust/`)
**Purpose:** TS ↔ Rust/WASM protocol
**Key files:**
- `boundary-contract.ts` — **Single source of truth** (Zod schemas)
- `worker-protocol.ts` — Message types (BOOTSTRAP, INSTALL_PIPELINE, etc.)
- `engine.worker.ts` — Worker bridge

**Generated:** No
**Committed:** Yes
**Critical:** All JSON payloads validated by Zod; no assumptions about shape

---

### Runtime (`src/runtime/`)
**Purpose:** V1 frame executor
**Status:** **LEGACY** — do not extend

**Key files:**
- `ScheduleExecutor.ts` — Step-by-step execution
- `RuntimeState.ts` — Slot storage, field buffers
- `kernels/` — Operation kernels (scalar, field)

**Generated:** No
**Committed:** Yes

---

### Services (`src/services/`)
**Purpose:** Orchestrate compilation, runtime, and state management
**Key files:**
- `CompileOrchestrator.ts` — **Single compile path** (V1 → runtime)
- `AsyncCompilerService.ts` — Compile in web worker
- `RuntimeService.ts` — Frame executor wrapper
- `DebugService.ts` — Runtime value observation (slot → value mappings)
- `LiveRecompile.ts` — Hot-swap orchestration

**Generated:** No
**Committed:** Yes

---

### Stores (`src/stores/`)
**Purpose:** MobX reactive state
**Key stores:**
- `PatchStore` — User graph (canonical)
- `FrontendResultStore` — Compiler output
- `PlaybackStore` — Animation playback
- `SettingsStore` — Editor preferences
- `DiagnosticsStore` — Aggregated diagnostics
- `DebugStore` — Runtime value visualization

**Generated:** No
**Committed:** Yes
**Rules:** Stores are the ONLY modules that import `mobx`; UI uses `mobx-react-lite`

---

### UI (`src/ui/`)
**Purpose:** React-based editor interface
**Key subdirectories:**
- `components/app/` — Top-level layout
- `reactFlowEditor/` — Graph visualization (ReactFlow)
- `dockview/` — Panel layout system
- `debug-viz/` — Live value charts
- `graphEditor/` — Graph editing operations
- `expression-editor/` — Value editing

**Generated:** No
**Committed:** Yes
**Rules:** UI reads from stores (read-only); dispatches actions to stores (write-only)

---

### Compiler Tester (`src/compiler-tester/`)
**Purpose:** Standalone test harness for C1 backend
**Key files:**
- `CompilerTesterApp.tsx` — React app
- `fixtures/` — Test graph definitions (spinning-ring.ts, dynamic-ring.ts)
- Entry: `/compiler-tester.html`

**Generated:** No
**Committed:** Yes
**Used by:** Screenshot validation scripts

---

### Demo & HCL (`src/demo/hcl/`)
**Purpose:** Demo patches in HCL text format
**Key files:**
- `examples/` — Simple demos (simple.hcl, breathing-ring.hcl)
- `showcase/` — Feature showcase patches
- `stress/` — Stress test patches
- `integration/` — Integration test scenarios

**Generated:** No
**Committed:** Yes

---

## Key File Locations

### Entry Points

**Application entry:**
- `src/index.ts` — Main exports (compile, graph, types, blocks)
- `src/index.html` — Main editor (`/`)

**Compiler entry:**
- `src/compiler/index.ts` — compile() function (V1)
- `src/compiler/frontend/index.ts` — compileFrontend() (shared)
- `src/compiler/backend-v2/index.ts` — compileC1(), compileC1FromNormalized()

**Compiler tester:**
- `src/compiler-tester/index.html` — Compiler tester (`/compiler-tester.html`)

**Rust renderer:**
- `src/render/wasm/rust/oscilla-rust-renderer/src/main.rs` — Worker entry

### Configuration Files

**Build:**
- `package.json` — Dependencies, scripts
- `tsconfig.json` — TypeScript configuration
- `vite.config.ts` — Vite build configuration
- `vitest.config.ts` — Vitest test configuration
- `.eslintrc.cjs` — ESLint rules

**Type checking:**
- `.env` — Environment variables (secrets, never committed)
- `.nvmrc` — Node version specification

### Core Logic

**Type system:**
- `src/core/canonical-types/CanonicalType.ts` — Single authority
- `src/core/ids.ts` — Branded ID definitions
- `src/core/domain-registry.ts` — Domain system

**Graph:**
- `src/graph/Patch.ts` — User graph model
- `src/graph/index.ts` — Normalization & adapter exports

**Compiler:**
- `src/compiler/frontend/index.ts` — Frontend pipeline entry
- `src/compiler/frontend/axis-validate.ts` — **Single enforcer** for invariants
- `src/compiler/backend-v2/index.ts` — C1 backend entry
- `src/compiler/ir/patches.ts` — Typed graph types

**Rendering:**
- `src/render/rust/boundary-contract.ts` — **Single source of truth** (Zod)
- `src/render/gpu-ir/compile.ts` — GPU-IR DSL entry
- `src/render/gpu-ir/ir-builders.ts` — Shared builders

**UI:**
- `src/stores/RootStore.ts` — Store composition root
- `src/ui/components/app/App.tsx` — Top-level component
- `src/ui/reactFlowEditor/GraphEditor.tsx` — Graph visualization

### Testing

**Architectural constraints:**
- `src/__tests__/forbidden-patterns.test.ts` — Enforces "no V1 bugs" rule, "no feature flags" rule

**Frontend tests:**
- `src/compiler/frontend/__tests__/` — Normalization, type solving, cardinality

**Backend tests:**
- `src/compiler/backend-v2/__tests__/` — C1 compilation, lowering

**Runtime tests:**
- `src/runtime/__tests__/` — Frame execution
- `src/runtime/__benchmarks__/` — Performance benchmarks

**Integration tests:**
- `src/demo/hcl/__tests__/` — HCL parsing + compilation
- Tests that compile full patches via compiler pipeline

---

## Naming Conventions

### Files

**Pattern:** `kebab-case.ts` for most files
- `src/render/gpu-ir/ir-builders.ts`
- `src/compiler/frontend/axis-validate.ts`
- `src/services/compile-orchestrator.ts`

**Exceptions:**
- React components: `PascalCase.tsx` (e.g., `App.tsx`, `GraphEditor.tsx`)
- Stores: `PascalCase.ts` (e.g., `RootStore.ts`, `PatchStore.ts`)
- Test files: `*.test.ts`, `*.spec.ts`

**Snapshot & generated:**
- `*.generated.ts` — Tool-generated code
- `__snapshots__/` — Jest snapshot files
- `.d.ts` — Generated type definitions

### Directories

**Pattern:** `lowercase` (no hyphens)
- `src/core/`
- `src/blocks/`
- `src/compiler/`
- `src/stores/`

**Exceptions:**
- `__tests__/` — Test directory
- `__benchmarks__/` — Benchmark directory
- `__snapshots__/` — Snapshot directory

### Block Names

**V1 block:** `NameOfBlock` (PascalCase in block type)
- Block type: `"Add"`, `"Multiply"`, `"Broadcast"`
- File: `src/blocks/math/add.ts`, `src/blocks/field/broadcast.ts`

**C1 block:** Same naming as V1 (NameOfBlock)
- File: `src/blocks-v2/math-binary.ts` (exports `Add`, `Subtract`)
- File: `src/blocks-v2/render-instances-2d.ts` (exports `RenderInstances2D`)

---

## Where to Add New Code

### New Feature (high-level)

1. **Understand the architecture**: Which layer(s) will this touch?
   - UI only? → `src/ui/`
   - Type system? → `src/core/`
   - Compilation? → `src/compiler/`
   - Rendering? → `src/render/`

2. **Update appropriate layer(s)** in order:
   - Core types (if needed): `src/core/`
   - Graph representation (if needed): `src/graph/`
   - Block definition (if needed): `src/blocks-v2/` (new), register in `blocks-v2/all.ts`
   - Compiler passes (if needed): `src/compiler/frontend/` or `src/compiler/backend-v2/`
   - UI (if needed): `src/ui/`
   - Store state (if needed): `src/stores/`

3. **Write tests** alongside code:
   - Tests in `__tests__/` in the same directory
   - Pattern: `feature.test.ts` for feature-level, `feature.spec.ts` for behavior specs

4. **Update public exports**:
   - If new public API: add to appropriate `index.ts`
   - Example: new block in `blocks-v2/my-block.ts` → import in `blocks-v2/all.ts`

### New Block (C1)

1. Create `src/blocks-v2/my-block.ts`:
   ```typescript
   import { registerC1Block } from '../..'; // wherever registry is
   registerC1Block('MyBlock', {
     inputs: { /* port defs */ },
     outputs: { /* port defs */ },
     lower: (ctx, inputs) => { /* GPU-IR lowering */ }
   });
   ```

2. Import in `src/blocks-v2/all.ts`:
   ```typescript
   import './my-block';
   ```

3. Write test in `src/blocks-v2/__tests__/my-block.test.ts`

4. Validate visually:
   - Add to compiler-tester fixture
   - Run screenshot script: `./scripts/get-screenshot-of-compiler-tester.sh`

### New Frontend Pass

1. Create `src/compiler/frontend/my-pass.ts`
2. Export function: `export function myPass(graph: DraftGraph): DraftGraph { ... }`
3. Wire into pipeline: `src/compiler/frontend/final-normalization.ts` (fixpoint loop)
4. Add tests in `src/compiler/frontend/__tests__/my-pass.test.ts`

### New Compiler Test Fixture

1. Create `src/demo/hcl/examples/my-feature.hcl` (HCL syntax)
2. Or create `src/compiler-tester/fixtures/my-fixture.ts` (TS fixture for C1 tester)
3. Run screenshot script to validate

### New GPU-IR Fixture (for rendering)

1. Create `src/render/rust/fixtures/my-fixture.ts`
2. Use GPU-IR DSL:
   ```typescript
   import { gpu, compute, render, exact } from '../../gpu-ir/compile';
   export const myFixture = gpu({
     manifest: { /* ... */ },
     roster: [
       compute({ /* ... */ }),
       render({ /* ... */ })
     ]
   });
   ```
3. Export from `src/render/rust/fixtures/index.ts`
4. Validate: `./scripts/get-screenshot-of-payload-tester.sh my-fixture --no-headless`

### New Store (UI state)

1. Create `src/stores/MyStore.ts`:
   ```typescript
   import { makeObservable, observable, action } from 'mobx';
   export class MyStore {
     myValue = initialValue;
     constructor() {
       makeObservable(this, { myValue: observable, updateMyValue: action });
     }
     updateMyValue(v) { this.myValue = v; }
   }
   ```
2. Wire into `src/stores/RootStore.ts`:
   ```typescript
   export class RootStore {
     readonly myStore = new MyStore();
   }
   ```
3. Use in UI via `useRootStore().myStore.myValue`

---

## Special Directories

### `src/__tests__/`
**Purpose:** Top-level architectural constraint tests
- `forbidden-patterns.test.ts` — Enforces "do not fix V1 bugs", "no feature flags"

### `design-docs/`
**Purpose:** Specification & design documents
- `CANONICAL-oscilla-v2.5-20260109/` — Main spec (topics, appendices)
- `block-migration/` — Migration progress docs
- `naga-migration/` — WGSL/Naga migration docs
- `lit/` — Literature & references

### `.planning/codebase/`
**Purpose:** GSD codebase analysis documents
- `ARCHITECTURE.md` — This file (layer breakdown)
- `STRUCTURE.md` — Directory guide
- `STACK.md` — Technology stack (if generated)
- `INTEGRATIONS.md` — External services (if generated)
- `CONVENTIONS.md` — Code style (if generated)
- `TESTING.md` — Test patterns (if generated)
- `CONCERNS.md` — Technical debt (if generated)

### `dist/`
**Status:** Generated, not committed
**Contents:** Build output from Vite
- `dist/blocks/` — Built block definitions
- `dist/ui/` — Built UI components
- `dist/compiler/` — Built compiler
- `index.html` — Bundled app entry

### `src/render/wasm/rust/oscilla-rust-renderer/`
**Purpose:** Rust/WASM renderer crate
**Build:** `npm run build:rust-renderer` → produces `src/render/wasm/pkg/`
**Note:** Separate Cargo.toml; treated as monorepo subdirectory

---

*Structure analysis: 2026-04-05*
