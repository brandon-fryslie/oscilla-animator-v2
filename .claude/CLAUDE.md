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

1. **Types & Constants** (`src/types`, `src/core`)
   - Domain system (`DomainType`, `DomainIdentity`)
   - Shape types (`Shape2D`, topologies)
   - Role enums (`BlockRole`, `EdgeRole`)

2. **Graph Representation** (`src/graph`)
   - `Patch.ts`: User-facing graph model (Blocks and Edges)
   - `normalize.ts`: Canonicalize user graphs
   - `adapters.ts`: Domain transformation system
   - `passes/`: Graph transformation passes (e.g., default source resolution)

3. **Block Registry** (`src/blocks`)
   - `registry.ts`: Central block definition database
   - Intrinsic field definitions (index, position, randomId, etc.)
   - Per-block validation and metadata

4. **Compiler** (`src/compiler`)
   - **IR (Intermediate Representation)**:
     - `ir/types.ts`: Signal, Field, Event expression types
     - `ir/IRBuilder.ts`: Safe builder API for IR construction
     - `ir/lowerTypes.ts`: Type lowering to concrete payloads
   - **Passes** (`compiler/passes-v2/`):
     - `pass1-type-constraints.ts`: Type inference & constraint gathering
     - `pass2-types.ts`: Type solver
     - `pass3-time.ts`: Time model resolution
     - `pass4-depgraph.ts`: Build dependency graph
     - `pass5-scc.ts`: Detect cycles, compute SCC
     - `pass6-block-lowering.ts`: Compile blocks to IR operations
     - `pass7-schedule.ts`: Produce execution schedule
   - **Main entry**: `compile.ts` orchestrates all passes

5. **Runtime** (`src/runtime`)
   - `RuntimeState.ts`: Frame-level state (value store, continuity)
   - `Materializer.ts`: Realize intrinsics and initial values into buffers
   - `ScheduleExecutor.ts`: Execute compiled schedule frame-by-frame
   - `ExternalChannel.ts`: Mouse/input event bridge
   - `RenderAssembler.ts`: Prepare render operations from runtime state
   - `FieldKernels.ts`: Signal processing kernels (sample, slew, lerp, etc.)

6. **Rendering** (`src/render`)
   - `Canvas2DRenderer.ts`: 2D canvas rendering
   - `SVGRenderer.ts`: SVG export
   - `types.ts`: Render IR (DrawOp, PathStyle, etc.)

7. **UI & Editor** (`src/ui`)
   - `components/`: React components (graph editor, playback, debug panels)
   - `reactFlowEditor/`: ReactFlow-based graph visualization
   - `dockview/`: Dockview panel layout system
   - `stores/`: MobX state management

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

#### Compiler as Multi-Pass Pipeline
Compilation follows a strict staged pipeline (no back-edges):
1. Normalization (transform Patch to canonical form)
2. Type inference & constraints (pass1-2)
3. Time resolution (pass3)
4. Dependency tracking & cycle detection (pass4-5)
5. Block lowering & IR emission (pass6)
6. Schedule generation (pass7)

Each pass produces new data without mutating inputs. Errors are collected, not thrown on first occurrence.

#### Hot Swap via State Continuity
When the graph changes (live editing):
1. New graph is compiled to new IR + schedule
2. New schedule is validated against old state
3. If valid, `advanceFrame()` seamlessly transitions
4. If invalid, old state rolls back (no corruption)

State continuity is the responsibility of `StateMigration.ts`.

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
UI/React ←── Stores (MobX) ←── Compiler + Runtime
          ↓
        Graph ←── Patch (user-facing)
                    ↓
                  Blocks Registry
                    ↓
                  Types & Core
```

**One-way rule**: No upward calls. UI may call Stores, Stores may call Compiler/Runtime, but never the reverse.

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
- **Pattern**: Test the *interface*, not the implementation

Example:
```typescript
// Tests verify behavior (what); implementation can change (how)
describe('compile', () => {
  it('produces a valid schedule for a simple graph', () => {
    const result = compile(patch);
    expect(result.ok).toBe(true);
    expect(result.value.schedule.steps.length).toBeGreaterThan(0);
  });
});
```

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
- `src/compiler/index.ts`: Compiler API (compile, IR types)
- `src/runtime/index.ts`: Runtime API (createRuntimeState, executeFrame, etc.)
- `src/stores/index.ts`: Store API (only public store classes exported)

### Debug & Inspection
- `src/ui/debug-viz/`: Live value visualization (hover ports to see values)
- `src/diagnostics/DiagnosticHub.ts`: Error/warning collection and display
- `src/services/CompilationInspectorService.ts`: Inspect compiled IR (useful for debugging)
- `src/runtime/DebugTap.ts`: Tap into signal values for inspection

### Hot Swap & State Migration
- `src/runtime/StateMigration.ts`: Validate new schedule against old state
- `src/runtime/RuntimeState.ts`: State container (frame cache, value store)
- `src/stores/PatchStore.ts`: Graph change orchestration

### Domain System
- `src/core/domain-registry.ts`: Register custom domains (Circle, Grid, etc.)
- `src/runtime/DomainIdentity.ts`: Track domain binding per instance

## Common Tasks

### Adding a New Block Type
1. Define block in `src/blocks/` (e.g., `src/blocks/math-blocks.ts`)
2. Export and register in `src/blocks/registry.ts` via `defineBlock()`
3. Add tests in `src/blocks/__tests__/`
4. Blocks automatically get intrinsic fields (index, position, etc.) via instance declarations
5. Verify with: `npm run test -- blocks`

### Adding a Compiler Pass
1. Create `src/compiler/passes-v2/passN-name.ts`
2. Implement the pass function (takes IR, returns IR or result)
3. Add to pipeline in `src/compiler/passes-v2/index.ts`
4. Add tests in `src/compiler/passes-v2/__tests__/`
5. The pass must not mutate input (return new IR)

### Fixing a Compilation Error
1. Check `src/compiler/diagnosticConversion.ts` (error formatting)
2. Errors may originate from any pass; search for `compileError()` calls
3. Add source context (block ID, port ID) to the error
4. Add a test to `src/compiler/__tests__/` that reproduces the error

### Debugging Runtime State
1. Enable debug output: Check `src/ui/debug-viz/` and open the Debug panel
2. Hover over a port to see its current value
3. Set breakpoints in `ScheduleExecutor.ts` to step through frame execution
4. Use `DebugTap.ts` to log signal values mid-frame
5. Check `RuntimeState.ts` to understand the state layout

### Modifying the Graph Model
1. Changes to `Patch.ts` affect serialization and normalization
2. Update `src/graph/normalize.ts` if new fields affect normalization
3. Update `src/graph/passes/` if passes need to handle new fields
4. Update tests in `src/graph/__tests__/`
5. **Do NOT add compiled artifacts to Patch** (types, slots, schedules)

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
