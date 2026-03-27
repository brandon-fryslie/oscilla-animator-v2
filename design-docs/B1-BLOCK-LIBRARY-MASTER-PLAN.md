# Block Library Overhaul — Master Plan

**Status:** Draft
**Depends on:** `B1-Block-Library-RAW.md` (4-Pillar architecture), `DEMO-PATCHES.md` (validation targets)

---

## 1. Problem

The block library needs to support the 4-Pillar architecture (Generators, Modifiers, Materials, Render Intents) described in `B1-Block-Library-RAW.md`. But we cannot design blocks in isolation from the renderer — if the renderer doesn't conform to the expected payload contract, the blocks are fiction.

Three risks:
1. **Wrong abstractions** — we lock into block APIs that can't express the demo patches
2. **Unverified renderer** — we don't know if the Rust renderer handles the payloads we plan to emit
3. **Integration surprise** — the block→compiler→renderer pipeline has hidden coupling that only surfaces when everything is wired together

## 2. Strategy: Boundary-First, Verified Bottom-Up

Define immutable API contracts at each boundary layer. Verify each boundary independently before building the layer above it. The boundaries, from bottom to top:

```
                    ┌─────────────────────┐
                    │   Block Definitions  │  (Pillar 1-4 blocks)
                    │   & Lowering Fns     │
                    └─────────┬───────────┘
                              │ Boundary B: LoweredBlock records
                    ┌─────────▼───────────┐
                    │   Compiler Backend   │  (scheduling, pass roster)
                    │   & Naga Lowering    │
                    └─────────┬───────────┘
                              │ Boundary A: WASM payload
                    ┌─────────▼───────────┐
                    │   Rust Renderer      │  (GPU execution)
                    └─────────────────────┘
```

**We work bottom-up:** verify Boundary A first (renderer accepts payloads), then define Boundary B (blocks produce the right records), then implement blocks.

---

## 3. The Three Boundaries

### Boundary A: Compiler → WASM Renderer

**What crosses:** The `REBUILD_GPU_PIPELINES` message containing `RustRendererGpuPass[]` and `MemoryManifestIR`.

**Current state** (from `worker-protocol.ts`):
- `RustRendererGpuPass`: `{ passId, stage, entryPoint, wgsl, memoryManifest? }`
- `MemoryManifestIR`: symbolic resource descriptors (id, type, cardinality, packing, updateClass)
- Per-frame data flows via `SharedArrayBuffer` (input signals, shape bank, sink table)
- Rust `ComputeDispatcher` compiles WGSL → wgpu pipelines; `Engine` orchestrates per-frame dispatch

**What the 4-Pillar architecture adds:**
- Multiple compute pass *stages* per frame (not just one `compute_main`)
- Render passes (vertex/fragment) alongside compute passes
- Transient texture resources in the manifest (for solver blocks like Eulerian fluid)
- Symbolic arena field requests (e.g., `pool_01:pos_x`) resolved by Rust MMU
- `DrawIndirectArgs` buffer management for instanced rendering
- Pass ordering / dependency metadata

**Target state:** A payload schema that can express every demo patch in `DEMO-PATCHES.md`, from a single colored rectangle to a reaction-diffusion solver driving a fullscreen quad.

### Boundary A': Compiler → Naga Shim

**What crosses:** `NagaModuleIR` (types, constants, globals, functions, entry_points) with symbolic `load_symbolic` expressions.

**Current state** (from `ScheduleNagaLowering.ts` → `oscilla-naga-shim`):
- JS constructs `NagaModuleIR` with symbolic resource IDs
- Rust `SymbolResolver` maps `resourceId` → physical byte offset math
- Naga `wgsl-out` backend emits valid WGSL
- Currently targets a single `compute_main` entry point

**What the 4-Pillar architecture adds:**
- Multiple entry points per module (or multiple modules per frame)
- Vertex/fragment entry points (not just compute)
- Material AST injection into an "uber shader" template
- Texture sampling expressions (`textureSampleLevel`)

**Target state:** The Naga shim can compile any IR fragment the 4-Pillar blocks need to emit — compute kernels, vertex transforms, fragment shaders, texture samples.

### Boundary B: Block Definitions → Compiler Backend

**What crosses:** `LowerResult` (currently: `outputsById`, `effects`, `instanceContext`, `stateKey`, `warnings`).

**Current state** (from `registry.ts`, `lowerTypes.ts`):
- Blocks return `ValueRefExpr` outputs and `LowerEffects` (stateDecls, stepRequests, slotRequests)
- `LowerEffects` already has `memoryResources` and `dispatchInstructions` fields
- Builder interface (`BlockIRBuilder`) provides pure expression construction
- All lowering is referentially transparent

**What the 4-Pillar architecture adds:**
- `ResourceProxyId` and `MaterialProxyId` as first-class output types
- Arena field requests (symbolic SoA allocations)
- Compute pass specs (multiple passes from a single block, e.g., fluid solver)
- Render intent specs (terminal blocks that produce draw commands)
- Texture requests (transient GPU textures for solvers)

**Target state:** A `LoweredBlock` record type that can express every block in every demo patch. The compiler backend consumes these records and produces Boundary A payloads.

---

## 4. Phases of Work

### Phase 0: Interactive Payload Tester

**Goal:** A minimal tool that lets a human submit a raw WASM boundary payload to the Rust renderer and visually verify the result.

**What it is:**
- A simple page with a text field (or code editor) and a submit button
- Paste or type a JSON payload conforming to the `REBUILD_GPU_PIPELINES` schema
- Click submit → the payload goes directly to the Rust renderer worker
- The renderer draws whatever the payload describes
- Visual inspection: "it works" or "it doesn't"

**Why this is Phase 0:**
- The renderer is the bottom of the stack. If it doesn't work, nothing above it matters.
- Automated pixel-comparison tests are fragile and slow to write. A human looking at the output catches categories of bugs that assertions miss.
- This tool becomes the primary iteration loop for Phases 1-2: change the payload, see what happens, adjust the boundary contract.

**Implementation sketch:**
- Can be a route/panel within the existing app, or a standalone HTML page that loads the WASM renderer
- Needs: the renderer worker, a canvas, a JSON text area, a submit button
- Does NOT need: the compiler, the block registry, the graph editor, MobX stores
- Bonus: a library of saved payloads (the demo patch payloads become fixtures)

**Acceptance criteria:**
- Can submit a payload that renders a single colored triangle
- Can submit a payload that renders 100 instanced quads at different positions
- Can edit the payload, re-submit, and see the change immediately

### Phase 1: Renderer Conformance & Boundary A Definition

**Goal:** Iterate on the WASM payload schema and the Rust renderer until both are correct and well-defined.

**Method:**
1. Start with the simplest possible payload (one compute pass, one render pass, one quad)
2. Hand-write the payload JSON
3. Submit via the Phase 0 tool
4. If the renderer doesn't handle it → fix the renderer
5. If the payload schema is awkward → revise the schema
6. Repeat with progressively more complex payloads from `DEMO-PATCHES.md`

**Deliverables:**
- A TypeScript type definition for the WASM payload schema (the Boundary A contract)
- A corresponding Rust type (serde-deserializable)
- A set of hand-written payload fixtures, one per demo patch tier:
  - Tier 0: Single quad, solid color (hello world)
  - Tier 1: Instanced quads with per-instance position/color from compute pass
  - Tier 2: Multiple compute passes (parameter eval + transform)
  - Tier 3: Render intent with blendMode variations
  - Tier 4: Transient textures (solver path)
- A Rust renderer that correctly handles all fixtures

**Boundary A schema (target shape, to be refined during this phase):**
```
interface WasmRenderPayload {
  manifest: {
    arenaRequirements: {
      globalCapacity: number
      scalars: string[]           // symbolic scalar IDs
      fields: string[]            // symbolic field IDs (SoA lanes)
    }
    transientTextures: {
      id: string
      width: number
      height: number
      format: string              // e.g., 'rgba16float'
    }[]
  }
  computePasses: {
    passId: string
    dispatch: [number, number, number]
    astPayload: NagaModuleIR      // symbolic, resolved by Rust
    textureBindings?: { group: number, binding: number, resourceId: string }[]
  }[]
  renderPasses: {
    passId: string
    topologyType: string          // e.g., 'RectangleQuad', 'CircleTopology'
    pipelineState: {
      blend: string               // e.g., 'normal', 'additive'
      depthWrite: boolean
    }
    astPayload: NagaModuleIR      // vertex+fragment shader IR
  }[]
}
```

This is a starting point. Phase 1 is where the schema gets battle-tested and revised.

### Phase 2: Block → Compiler Boundary (Boundary B Definition)

**Goal:** Define the `LoweredBlock` record type that block lowering functions return.

**Method:**
1. For each demo patch, work backwards from the Phase 1 payload to determine what each block needs to contribute
2. Design the `LoweredBlock` type such that the compiler backend can mechanically reduce a list of `LoweredBlock` records into a Boundary A payload
3. Write pseudo-code lowering functions for the demo patch blocks
4. Verify that the reduction is pure (no hidden state, no ordering dependencies beyond the DAG)

**Deliverables:**
- TypeScript type definition for `LoweredBlock` (or extension of existing `LowerResult`)
- Pseudo-code lowering functions for: `InstanceDomain`, `RectangleTopology`, `TransformInstances`, `UnlitMaterial`, `DrawInstances`, `ColorHSL`
- A written description of the compiler backend reduction: how `LoweredBlock[]` becomes `WasmRenderPayload`
- Compatibility analysis: what in the existing `LowerResult` / `LowerEffects` / `BlockIRBuilder` can be reused vs. what needs new types

**Key design question:** Do the new proxy types (`ResourceProxyId`, `MaterialProxyId`) extend the existing `ValueRefExpr` system, or are they a parallel output channel? The existing system already has `shapeRef` and `memoryResources` — the 4-Pillar types may be expressible as extensions of those.

### Phase 3: Architect Designs the Blocks

**Goal:** The architect (external, e.g., Gemini) produces complete block specifications for each demo patch.

**What the architect receives:**
- The locked Boundary A schema (from Phase 1)
- The locked Boundary B type (from Phase 2)
- The demo patch catalog (`DEMO-PATCHES.md`)
- The existing block definition format (`defineBlock()`, `LowerArgs`, `LowerResult`)

**What the architect produces per demo patch tier:**

*Tier 0-1 (full detail, establishes all patterns):*
1. Block inventory — every block with pillar classification, port names, port types
2. Edge type annotations — what flows on each connection, where Scalar→Field promotion occurs
3. LoweredBlock record — the exact pure return value of each block's lowering function
4. Symbolic manifest — the JSON fragment this patch contributes to the WASM payload
5. Pass roster — ordered list of passes with dispatch sizes and dependencies
6. WASM payload — the complete Boundary A JSON

*Tier 2-3 (highlight what's new):*
1. Block inventory (always)
2. Structural novelty (e.g., modifier chaining, FieldSource as input to modifier)
3. New IR constructs or manifest entries not needed in Tier 1

*Tier 4-5 (focus on scheduling):*
1. Block inventory
2. Pass roster (critical for multi-domain and solver sub-graphs)
3. New WASM payload structures (transient textures, multiple arena regions)

### Phase 4: Implementation

**Goal:** Implement the blocks, compiler backend changes, and renderer extensions.

**Method:**
1. For each demo patch (simplest first), implement the blocks
2. Compiler output tests: assert that compiling the demo patch produces the expected Boundary A payload
3. Visual validation: submit the payload via the Phase 0 tool and verify rendering
4. Automated regression: save the payload as a fixture, add a test that compilation produces it

**Ordering within Phase 4:**
1. Minimum viable block set (InstanceDomain, PointTopology/RectangleTopology, TransformInstances, UnlitMaterial, DrawInstances)
2. Math blocks that the demo patches need (Multiply, Add, Modulo, Floor, Sin, Cos, etc.) — many of these already exist
3. Advanced sources (ParametricTemplate, SolverResource)
4. Modifiers (TwistGeometry, DisplaceModifier, StretchModifier)
5. Advanced materials (ColorHSL, GradientMaterial, texture-sampling materials)
6. Advanced intents (DrawFullScreenQuad, additive blending)

---

## 5. What Changes vs. What Stays

### Stays (existing infrastructure to preserve)
- `SharedArrayBuffer` per-frame data plane (input signals, shape bank, sink table)
- `NagaModuleIR` as the serializable shader IR (extended, not replaced)
- `oscilla-naga-shim` as the WGSL emission boundary
- `MemoryManifestIR` resource descriptor format (extended)
- `LowerResult` / `LowerEffects` pattern (extended with new effect kinds) — or replaced if the new `LoweredBlock` record supersedes it
- Worker message protocol structure (new message types added, existing ones preserved)

### Changes (new or significantly modified)
- `REBUILD_GPU_PIPELINES` payload gains structured pass roster with ordering and render passes
- `MemoryManifestIR` gains transient texture descriptors and symbolic SoA field requests
- `NagaModuleIR` gains vertex/fragment entry points and texture sampling expressions
- New IR types: `ResourceProxyId`, `MaterialProxyId`, `RenderIntentSpec`, `ComputePassSpec`
- New `LowerEffects` fields: `arenaRequests`, `computePassSpecs`, `renderIntentSpecs`
- Block registry gains pillar classification metadata
- Compiler backend gains a pass roster builder (reduces `LoweredBlock[]` → payload)
- New: interactive payload tester tool

### Renderer Assumptions (unvalidated — to be verified in Phase 1)
- **Multi-pass compute dispatch:** The Rust `ComputeDispatcher` stores passes in a `Vec<CompiledComputePassPipeline>` and loops over them in order with ping-pong double buffering (`encode_simulation_and_assembly`). The code structure supports N ordered compute passes per frame, but this has not been validated with real multi-pass payloads via the interactive tester. Phase 1 Tier 2 is the first test.

### Open Questions (to be resolved during Phase 1-2)
- How do render passes (vertex/fragment) integrate with the existing rAF loop in `Engine`? The compute path exists but the render pass path likely needs new work.
- Should transient textures be managed by the Rust `GpuMemoryArena` or a new allocator?
- `ResourceProxyId` / `MaterialProxyId` are compile-time resource handles, not runtime-evaluated values. They are a separate tracking system in the compiler — resolved.
- `DrawPrepProgramIR` / `DrawPrepSinkIR` have no relationship to `RenderIntent`. They are part of the current shape bank / sink table pipeline, which the new architecture replaces entirely. New IR will be written — resolved.

---

## 6. Demo Patch Tiers (Validation Targets)

Each phase uses progressively complex demo patches from `DEMO-PATCHES.md` as validation targets. The tiers map to the phases:

| Tier | Patches | Validates |
|------|---------|-----------|
| 0 | (not in catalog — single quad, solid color) | Renderer accepts minimal payload |
| 1 | Grid of Squares, Kaleidoscope | Basic InstanceDomain + Field math + instanced draw |
| 2 | Mouse-Reactive Field, Conditional Visibility, Additive Ripple Rings | Scalar↔Field promotion, blendMode, external input |
| 3 | Noise-Displaced Grid, Velocity-Stretched Particles, Twisted Ribbon | Modifier pipeline, FieldSource as input, ParametricTemplate |
| 4 | Fill and Outline, Two-Domain Scene | Multi-intent fan-out, multi-domain scheduling |
| 5 | Reaction-Diffusion Surface, Strange Attractor | SolverResource, transient textures, DrawFullScreenQuad |

A patch at tier N is not attempted until all tier N-1 patches render correctly.

---

## 7. Success Criteria

The overhaul is complete when:
1. Every demo patch in `DEMO-PATCHES.md` can be expressed as a block graph
2. Every block graph compiles to a Boundary A payload that matches the hand-written fixture from Phase 1
3. Every payload renders correctly when submitted via the interactive tester
4. The Boundary A and B type definitions are documented and tested
5. No block lowering function contains validation logic (all validation is in the frontend compiler)
6. No block lowering function performs side effects (all lowering is pure)
