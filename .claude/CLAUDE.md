# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Rules (NEVER BREAK)

- **NEVER use `git stash`**. Do not stash, pop, or manipulate the stash in any way. This is a destructive operation that can lose work and interact badly with linters. If you need to test old code, use `git diff` or `git show` to read it — never modify the working tree state.

## Project Overview

Oscilla Animator v2 is a clean rewrite of the Oscilla animation system. It's a browser-based animation editor for creating procedural, node-graph-based animations with precise continuity guarantees and hot-swappable live editing.

**Key pillars:**
- **Spec-driven**: All implementation conforms to `design-docs/CANONICAL-oscilla-v2.5-20260109/`
- **Single code path**: No dual implementations or legacy compatibility shims
- **Invariant enforcement**: Critical properties are mechanically enforced, not documented
- **Live editing**: Graph changes hot-swap without losing state

## Development Commands

```bash
npm run dev          # Start dev server (port 5174)
npm run build        # Type check with tsc, then Vite build
npm run typecheck    # Type check only
npm run test         # Run Vitest (all tests in single run)
npm run test:watch   # Run Vitest in watch mode
npm run test:coverage # Generate coverage report
npm run bench        # Run Vitest benchmarks
```

### Running Specific Tests

```bash
# Run a single test file
npx vitest run src/compiler/__tests__/compile.test.ts

# Run tests matching a pattern
npx vitest run --include "**/cardinality*.test.ts"

# Run with coverage for specific file
npx vitest run --coverage src/compiler/
```

## Architecture Overview

### Core Layers (Bottom-up)

1. **Types & Constants** (`src/types/`, `src/core/`)
   - `src/core/canonical-types/`: The canonical type system — `CanonicalType = { payload, unit, extent }`
   - `src/core/ids.ts`: Branded ID types (`InstanceId`, `CardinalityVarId`, etc.)
   - `src/core/domain-registry.ts`: Domain registration (Circle, Grid, etc.)
   - `src/core/types.ts`: Base type definitions, `Shape2D`, topologies
   - `src/types/`: Role enums (`BlockRole`, `EdgeRole`), `ValueSlot`

2. **Graph Representation** (`src/graph/`)
   - `Patch.ts`: User-facing graph model (Blocks and Edges)
   - `normalize.ts`: Canonicalize user graphs (barrel for all normalization passes)
   - `adapters.ts`: Domain transformation system
   - `passes/`: Graph transformation passes (e.g., default source resolution)

3. **Block Registry** (`src/blocks/`)
   - `registry.ts`: Central block definition database via `defineBlock()`
   - Block categories in subdirectories: `adapter/`, `color/`, `composites/`, `dev/`, `domain/`, `event/`, `field/`, `instance/`, `io/`, `layout/`, `lens/`, `math/`, `render/`, `shape/`, `signal/`, `time/`
   - `lower-utils.ts`: Shared lowering utilities for block IR emission

4. **Compiler** (`src/compiler/`)
   - **Frontend** (`compiler/frontend/`): Produces `TypedPatch` + `CycleSummary` for UI. Can succeed even when backend fails.
     - `index.ts`: Frontend entry point, orchestrates all frontend passes
     - Normalization: `normalize-composites.ts`, `normalize-default-sources.ts`, `normalize-adapters.ts`, `normalize-indexing.ts`, `normalize-varargs.ts`
     - Analysis: `analyze-type-constraints.ts` (union-find type solver + cardinality), `analyze-type-graph.ts` (TypedPatch), `axis-validate.ts` (axis invariants), `analyze-cycles.ts` (cycle classification)
     - `solve-cardinality.ts`: Cardinality constraint solver (union-find). See `DEBUGGING.md` for trace mode.
   - **Backend** (`compiler/backend/`): Produces `CompiledProgramIR` from `TypedPatch`.
     - `index.ts`: Backend entry point
     - `derive-time-model.ts`: Time signal generation (pass 3)
     - `derive-dep-graph.ts`: Execution dependency graph (pass 4)
     - `schedule-scc.ts`: SCC decomposition (pass 5)
     - `lower-blocks.ts`: Block-to-IR lowering (pass 6)
     - `schedule-program.ts`: Execution schedule (pass 7)
   - **IR** (`compiler/ir/`): `types.ts` (expression types), `IRBuilder.ts` (builder API), `lowerTypes.ts` (type lowering), `patches.ts` (`NormalizedPatch`, `TypedPatch`, `BlockIndex`)
   - **Main entry**: `compile.ts` orchestrates frontend + backend
   - **NOTE**: `compiler/passes-v2/` is **legacy and excluded from build**. All active passes are in `frontend/` and `backend/`.

5. **Runtime** (`src/runtime/`)
   - `RuntimeState.ts`: Frame-level state (value store, continuity)
   - `ScheduleExecutor.ts`: Execute compiled schedule frame-by-frame
   - `ValueExprMaterializer.ts`: Realize values into buffers
   - `RenderAssembler.ts`: Prepare render operations from runtime state
   - `FieldKernels.ts`: Signal processing kernels (sample, slew, lerp, etc.)
   - `ExternalChannel.ts`: Mouse/input event bridge
   - `StateMigration.ts`: State migration for hot-swap continuity
   - `ContinuityState.ts`: Continuity state management and pruning

6. **Services** (`src/services/`)
   - `CompileOrchestrator.ts`: **Single compile path** — handles frontend, backend, state migration, debug probe setup. Called for both initial and live recompile.
   - `AnimationLoop.ts`: Main animation loop (frame-by-frame execution)
   - `LiveRecompile.ts`: Hot-swap orchestration for graph changes
   - `DebugService.ts`: Runtime value observation for debug viz
   - `CompilationInspectorService.ts`: Inspect compiled IR snapshots per pass
   - `DomainChangeDetector.ts`: Detect domain changes requiring recompile
   - `PatchPersistence.ts` / `PatchExporter.ts`: Save/load/export patches
   - `mapDebugEdges.ts`: Build edge-to-slot and port-to-slot debug mappings

7. **Settings** (`src/settings/`)
   - `defineSettings.ts`: Token-based settings definition with UI hints
   - `tokens/`: Setting tokens — `app-settings.ts`, `compiler-flags-settings.ts`, `debug-settings.ts`, `editor-settings.ts`
   - `useSettings.ts`: React hook for consuming settings
   - Settings flow: `SettingsStore` owns all values, tokens define schema + defaults + UI controls

8. **Stores** (`src/stores/`) — MobX state management
   - `RootStore.ts`: Owns all other stores
   - `PatchStore.ts`: Patch (graph) state
   - `FrontendResultStore.ts`: Frontend compilation results for UI
   - `PlaybackStore.ts`: Play/pause/frame controls
   - `SelectionStore.ts`, `LayoutStore.ts`, `ViewportStore.ts`: Editor state
   - `DebugStore.ts`: Debug panel state (syncs with `debug-settings` token)
   - `DiagnosticsStore.ts`: Error/warning display
   - `ContinuityStore.ts`: Continuity state management
   - `SettingsStore.ts`: Application settings (token registry)
   - `CameraStore.ts`: 3D camera state

9. **Rendering** (`src/render/`)
   - `Canvas2DRenderer.ts`: 2D canvas rendering
   - `SVGRenderer.ts`: SVG export
   - `types.ts`: Render IR (DrawOp, PathStyle, etc.)

10. **Projection** (`src/projection/`)
    - `perspective-kernel.ts`, `ortho-kernel.ts`: 3D projection kernels
    - `layout-kernels.ts`: Layout kernel operations

11. **UI & Editor** (`src/ui/`)
    - `components/`: React components (graph editor, playback, debug panels, settings panel)
    - `reactFlowEditor/`: ReactFlow-based graph visualization
    - `dockview/`: Dockview panel layout system
    - `debug-viz/`: Live value visualization (hover ports to see values)

12. **Patch DSL** (`src/patch-dsl/`)
    - HCL-like text format for patches — enables text-based authoring and version control
    - `lexer.ts` → `parser.ts` → `ast.ts` → `patch-from-ast.ts`: Text-to-Patch pipeline
    - `serialize.ts` / `deserialize.ts`: Round-trip serialization
    - `composite-serialize.ts` / `composite-deserialize.ts`: Composite block serialization

13. **Demos** (`src/demo/`)
    - Pre-built demo patches (`simple.ts`, `golden-spiral.ts`, `mouse-spiral.ts`, etc.)
    - `index.ts`: Exports `patches` array used by the app on startup
    - `hcl/`: Demo patches written in the Patch DSL format

### Key Design Patterns

#### Single Source of Truth (Patch)
`Patch` (in `src/graph/Patch.ts`) is the authoritative user graph. It captures:
- Block definitions, ports, role metadata
- Edge connections and roles
- Per-instance port overrides (defaultSource, combineMode)

**Critical constraint**: Patch MUST NOT contain compiled artifacts (resolved types, units, slots, schedules). These belong in the IR or runtime state only.

#### Block Registry as Central Database
`src/blocks/registry.ts` defines all block types. Each block has:
- Input/output slot definitions
- Intrinsic fields (for array instances)
- Type constraints and defaults
- Metadata for editor rendering

Blocks register themselves at module load time via `defineBlock()`.

#### Compiler as Frontend/Backend Pipeline
Compilation is split into two independent stages:

**Frontend** (`src/compiler/frontend/index.ts` → `compileFrontend()`):
1. Normalization — composites, default sources, adapters, indexing, varargs
2. Type constraints — union-find solver for payload/unit/cardinality
3. Type graph — produce `TypedPatch`
4. Axis validation — enforce axis invariants
5. Cycle classification — for UI display

**Backend** (`src/compiler/backend/index.ts`):
3. Time model — derive time signals
4. Dependency graph — build execution DAG
5. SCC — detect cycles, compute strongly connected components
6. Block lowering — compile blocks to IR operations
7. Schedule — produce execution order

Each pass produces new data without mutating inputs. Errors are collected, not thrown on first occurrence. The frontend can succeed independently (UI gets `TypedPatch` even if backend fails).

**Orchestration**: `src/services/CompileOrchestrator.ts` is the single compile path. It runs frontend, stores the snapshot for UI, then runs backend if frontend succeeds.

#### Hot Swap via State Continuity
When the graph changes (live editing):
1. New graph is compiled to new IR + schedule
2. New schedule is validated against old state
3. If valid, `advanceFrame()` seamlessly transitions
4. If invalid, old state rolls back (no corruption)

State continuity is the responsibility of `src/runtime/StateMigration.ts`.

#### Runtime as Frame-by-Frame Executor
The main loop:
1. `executeFrame()` runs the schedule for one frame
2. Results accumulate in `RuntimeState.frameCache`
3. `assembleRenderFrame()` converts cache to render operations
4. Canvas renders the operations
5. Next frame starts fresh (cache is cleared)

No persistent rendering state—everything derives from runtime state.

#### Two-Phase Execution Model
The runtime executes each frame in two phases: **Phase 1** evaluates all signals and reads from the previous frame's state, while **Phase 2** writes new state values for the next frame. This separation is non-negotiable—it ensures stateful blocks (like `UnitDelay`, `Lag`, `Phasor`) maintain proper delay semantics and prevents causality loops. Without phasing, feedback loops would read their own writes within the same frame, breaking the one-frame-delay guarantee. Phase boundaries also enable safe hot-swap by providing clean state migration points. See `docs/runtime/execution-model.md` for full technical details, examples, and maintenance guidelines.

### Module Dependency Arrows (Simplified)

```
UI/React ←── Stores (MobX) ←── Services ←── Compiler + Runtime
                                                  ↓
                                                Graph ←── Patch (user-facing)
                                                            ↓
                                                          Blocks Registry
                                                            ↓
                                                          Types & Core
```

**One-way rule**: No upward calls. UI may call Stores, Stores may call Services/Compiler/Runtime, but never the reverse.

## Spec Reference & Invariants

### How to Read the Spec

**Essential spec first** (all new work):
- `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` (~25k tokens)
- Contains all T1 concepts, invariants, core glossary

**Domain-specific docs** (when working in that area):
- Diagnostics: `07-diagnostics-system.md`, `08-observation-system.md`
- UI: `09-debug-ui-spec.md`, `14-modulation-table-ui.md`, `15-graph-editor-ui.md`
- Continuity: `11-continuity-system.md`
- Events: `12-event-hub.md`, `13-event-diagnostics-integration.md`
- Design disputes: `RESOLUTION-LOG.md`

See `design-docs/CANONICAL-oscilla-v2.5-20260109/INDEX.md` for full navigation.

### Core Invariants (from spec `00-invariants.md`)

These are NON-NEGOTIABLE. Violations are bugs, not edge cases.

Key invariants (examples):
- Every block input has a canonical default source (no ambiguity)
- Continuity state is preserved across graph hot-swaps (no glitches)
- Type inference is deterministic and complete
- Field expressions form a DAG (no cycles)

See `.claude/rules/spec/invariants.md` for the full list and enforcement strategies.

## Code Organization

### Tests

- **Unit tests**: Live alongside code as `__tests__/` directories
- **Test framework**: Vitest with jsdom for React components
- **Fixtures**: `src/compiler/__tests__/fixtures/` for reusable test data
- **Cross-cutting tests**: `src/__tests__/forbidden-patterns.test.ts` enforces architectural constraints (no banned type aliases, no deprecated patterns)
- **Test helpers**: `src/__tests__/runtime-test-helpers.ts`, `src/__tests__/type-test-helpers.ts`
- **Pattern**: Test the *interface*, not the implementation

### Module Structure

- **Public exports**: From `src/*/index.ts` (or specific modules)
- **Internal modules**: Prefixed with `_` or live in `internal/` (not re-exported)
- **Type definitions**: Colocated with implementation (same file or adjacent `.types.ts`)

### Naming Conventions

- **Classes**: PascalCase, descriptive nouns (e.g., `RuntimeState`, `IRBuilder`)
- **Functions**: camelCase, verb-first for actions (e.g., `createRuntimeState`, `executeFrame`)
- **Types**: PascalCase, nullable types use `| null` (not `?` for clarity)
- **Constants**: UPPER_SNAKE_CASE for true constants; camelCase for runtime-computed values

## Project Rules (from `.claude/rules/`)

### Type System Invariants (`TYPE-SYSTEM-INVARANTS.md`)
- `CanonicalType = { payload, unit, extent }` is the single type authority
- `deriveKind()` derives signal/field/event from axes — never store kind directly
- Axis vars (`kind: 'var'`) must not escape frontend into backend/runtime
- One enforcement gate for axis validation (`axis-validate.ts`)
- See the full 17-rule guardrail document for complete rules

### Compilation Pipeline Rules (`compiler/compilation.md`)
- Stages are independent and testable
- IRs have explicit ownership; no ambient shared state
- Validation errors include source context
- Normalization is total (handles all input forms)

### Runtime Rules (`runtime/runtime.md`)
- Frame loop is the single execution authority
- No side effects outside frame boundaries
- Hot swap must preserve continuity (checked before apply)
- State transitions are explicit and traceable

### Block System Rules (`compiler/intrinsics.md`)
- Intrinsics (index, position, randomId) are instance-bound
- Type `IntrinsicPropertyName` is a closed union (exhaustively checked)
- New intrinsics require materializer case + type update (one place each)
- The "never pattern" enforces completeness at compile time

### Spec Conformance Rules (`spec/invariants.md`)
- All code must respect spec invariants
- Invariants should be mechanically enforced (types, assertions)
- Runtime violations fail fast and loud
- No "temporary" workarounds that violate invariants

## Important Files & Patterns

### Key Entry Points
- `src/index.ts`: Main public API (exports types, graph, compiler, blocks)
- `src/compiler/index.ts`: Compiler API (`compile()`, IR types)
- `src/compiler/frontend/index.ts`: Frontend API (`compileFrontend()`)
- `src/compiler/backend/index.ts`: Backend API
- `src/runtime/index.ts`: Runtime API (createRuntimeState, executeFrame, etc.)
- `src/stores/index.ts`: Store API (only public store classes exported)
- `src/services/CompileOrchestrator.ts`: Single compile path (initial + live recompile)

### Debug & Inspection
- `src/compiler/frontend/DEBUGGING.md`: Cardinality solver trace mode docs
- `src/ui/debug-viz/`: Live value visualization (hover ports to see values)
- `src/diagnostics/DiagnosticHub.ts`: Error/warning collection and display
- `src/services/CompilationInspectorService.ts`: Inspect compiled IR (useful for debugging)
- `src/runtime/DebugTap.ts`: Tap into signal values for inspection
- Settings → Debug → "Trace Cardinality Solver" toggle: Logs solver phases to browser console

### Hot Swap & State Migration
- `src/runtime/StateMigration.ts`: Validate new schedule against old state
- `src/runtime/RuntimeState.ts`: State container (frame cache, value store)
- `src/runtime/ContinuityState.ts`: Continuity state and pruning
- `src/stores/PatchStore.ts`: Graph change orchestration

### Domain System
- `src/core/domain-registry.ts`: Register custom domains (Circle, Grid, etc.)
- `src/runtime/DomainIdentity.ts`: Track domain binding per instance

## Common Tasks

### Adding a New Block Type
1. Define block in `src/blocks/<category>/` (e.g., `src/blocks/math/`)
2. Export and register in `src/blocks/registry.ts` via `defineBlock()`
3. Add tests in `src/blocks/__tests__/`
4. Blocks automatically get intrinsic fields (index, position, etc.) via instance declarations
5. Verify with: `npm run test -- blocks`

### Adding a Compiler Pass
Frontend passes go in `src/compiler/frontend/`, backend passes in `src/compiler/backend/`.
1. Create the pass file (e.g., `src/compiler/frontend/analyze-foo.ts`)
2. Implement the pass function (takes previous pass output, returns new data — no mutation)
3. Wire into the pipeline in the appropriate `index.ts`
4. Add tests in the corresponding `__tests__/` directory

### Fixing a Compilation Error
1. Check `src/compiler/frontend/frontendDiagnosticConversion.ts` (error formatting)
2. Errors may originate from any pass; search for error-producing calls in `frontend/` or `backend/`
3. Add source context (block ID, port ID) to the error
4. Add a test to `src/compiler/__tests__/` that reproduces the error

### Debugging Runtime State
1. Enable debug output: Check `src/ui/debug-viz/` and open the Debug panel
2. Hover over a port to see its current value
3. Set breakpoints in `ScheduleExecutor.ts` to step through frame execution
4. Use `DebugTap.ts` to log signal values mid-frame
5. Check `RuntimeState.ts` to understand the state layout
6. For cardinality bugs: Enable "Trace Cardinality Solver" in Settings → Debug (see `src/compiler/frontend/DEBUGGING.md`)

### Modifying the Graph Model
1. Changes to `Patch.ts` affect serialization and normalization
2. Update `src/graph/normalize.ts` if new fields affect normalization
3. Update `src/graph/passes/` if passes need to handle new fields
4. Update tests in `src/graph/__tests__/`
5. **Do NOT add compiled artifacts to Patch** (types, slots, schedules)

### Adding a New Setting
1. Add field to the appropriate token in `src/settings/tokens/` (or create a new token with `defineSettings()`)
2. Add UI hints in the token's `ui.fields` section
3. If a store needs to react, add a `reaction()` in the store's `setupSettingsSync()`
4. Read the setting value via `store.settings.get(token)`

## TypeScript Configuration & Strictness

- **Target**: ES2022 (modern features OK)
- **Strict mode**: Enabled (no `any` without `// @ts-ignore` comment + rationale)
- **Exclude**: `compiler/passes-v2` (legacy, excluded from build)
- **Path alias**: `@/*` → `src/*` (use `@/blocks` not `../../blocks`)

## Performance Considerations

- **Runtime hot loop** (`ScheduleExecutor.ts`): Runs every frame, must be fast
- **Buffer reuse** (`BufferPool.ts`): Preallocates buffers to avoid GC pauses
- **Signal kernels** (`FieldKernels.ts`): Vectorized where possible (SIMD-friendly)
- **IR is immutable**: Every pass produces a new IR (no mutation of old)

Benchmark with: `npm run bench`

## Useful References

### Within the Codebase
- **v1 reference**: `~/code/oscilla-animator_codex` (for block patterns, graph normalizer)
- **Block/Edge roles**: `design-docs/final-System-Invariants/15-Block-Edge-Roles.md` (v1 reference doc)
- **Agent planning**: `.agent_planning/` contains RCA docs, sprint plans, and archived work context

### External Tools
- **React Flow docs**: Used for graph visualization (`src/ui/reactFlowEditor/`)
- **MobX docs**: State management in stores (`src/stores/`)
- **Vitest docs**: Testing framework
- **Canvas API**: Rendering backend

## Code Review Guidelines

When reviewing code (or asking for review), check:

1. **Spec conformance**: Does it respect the spec and invariants?
2. **Single source of truth**: Is there one canonical representation for each concept?
3. **No back-edges**: Do imports follow the dependency arrow?
4. **Type safety**: Are `any` casts or assertions justified and commented?
5. **Test coverage**: Are invariants and edge cases tested?
6. **Performance**: Does it avoid unnecessary allocations in hot loops?

## Notes

- MobX stores are the ONLY modules that import `mobx`. UI components use `mobx-react-lite`.
- The spec is the source of truth. When in doubt, consult `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md`.
- Invariants are non-negotiable. See `.claude/rules/spec/invariants.md` for the full list.
- Hot swap must preserve state. Read `StateMigration.ts` before making runtime changes.
- Every concept has exactly one authoritative representation. No caches, caches are derived.
- `src/__tests__/forbidden-patterns.test.ts` enforces architectural constraints via grep — if CI fails on a forbidden pattern, the code must be restructured, not the test.
