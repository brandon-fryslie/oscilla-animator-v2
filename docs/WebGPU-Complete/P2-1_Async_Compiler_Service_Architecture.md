> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Compiler Architecture: The Async Compiler Service**.

This document defines the lifecycle of the compilation process. It addresses the challenge of integrating a synchronous human workflow (drag-and-drop) with an asynchronous build pipeline (WASM validation + Driver shader compilation), ensuring the UI remains responsive even when the GPU driver is crunching heavily optimized shader binaries.

# The Compiler Architecture: The Async Compiler Service

**Objective:** Isolate the high-latency compilation tasks from the UI thread and the Render loop.

**Invariant:** The CompilerService never blocks the main thread for more than 5ms.

**Mechanism:** A dedicated "Build Agent" that manages a queue of compilation requests, handling debounce logic, WASM interop, and asynchronous GPU pipeline creation.

## 1. The Necessity of Async

In the Canvas2D era, compilation was just "iterating an array." It was synchronous and instant (\$\<1\$ms).

In the WebGPU era, compilation involves two heavy, blocking operations:

1.  **Naga Validation (WASM):** The serialized IR must be marshalled into WASM memory, validated by Rust logic, and serialized back. While fast (\$~5-10\$ms), it is synchronous work that can drop a frame if done on the UI thread during an animation.

2.  **Pipeline Linking (Driver):** Calling device.createComputePipeline() triggers the GPU driver's shader compiler (Vulkan/Metal/DX12). This can take **20ms to 500ms** depending on shader complexity and driver quirks. Doing this synchronously (createComputePipeline) freezes the browser.

**The Solution:** We effectively move the "Build" process to a background timeline using Promise chains and createComputePipelineAsync.

## 2. The Compiler State Machine

The Service is not a function; it is a **State Machine**. The UI binds to this state to show "Spinner" icons or "Error" borders.

### 2.1 The States

| **State** | **Description** | **Transitions To** |
|----|----|----|
| **IDLE** | System is stable. The active pipeline matches the graph. | DIRTY |
| **DIRTY** | User modified the graph. A **Debounce Timer** is running. | COMPILING, IDLE (if reverted) |
| **COMPILING** | Debounce expired. TS lowering emits scoped Naga IR and runs validator checks. | LINKING, ERROR |
| **LINKING** | IR is validated. Serializer + driver pipeline compilation runs (`create*PipelineAsync`). | READY, ERROR |
| **READY** | New artifacts are prepared. Waiting for the **Hot-Swap** signal. | IDLE (after swap) |
| **ERROR** | Compilation failed (Logic or Driver error). | DIRTY (on next edit) |

### 2.2 The "Stale" Handling (Concurrency)

A critical edge case: The user edits the graph (Trigger A). The compiler starts. 100ms later, while *still compiling A*, the user edits again (Trigger B).

- **The Rule:** The current compilation (A) is **abandoned**.

- **Mechanism:** The Service holds a cancellation_token. When Trigger B fires, Token A is cancelled. The createPipelineAsync promise for A will resolve, but the result is discarded because the token doesn't match the current latest_token.

## 3. The Interface Definition

The Compiler Service exposes a strictly typed API to the UI and Runtime.

TypeScript

type CompilerState = 'idle' \| 'dirty' \| 'compiling' \| 'linking' \| 'ready' \| 'error';\
\
interface CompilationResult {\
program: CompiledProgram; // The IR\
pipelines: {\
compute: GPUComputePipeline; // The executable Physics Engine\
draw: GPUComputePipeline; // The Draw Prep kernel\
render: GPURenderPipeline; // The Final Sink\
};\
layout: GpuLayout; // The Memory Map (SoA offsets)\
}\
\
class CompilerService {\
// The Public Signal\
readonly state: Value\<CompilerState\>;\
readonly errors: Value\<CompilerError\[\]\>;\
\
// The Input\
scheduleCompile(graph: NormalizedGraph): void;\
\
// The Output (polled by Runtime)\
tryGetNewPipeline(): CompilationResult \| null;\
}

## 4. The Build Pipeline Stages

When scheduleCompile is called and the debounce timer (e.g., 50ms) expires, the **Build Pipeline** begins.

### Stage 1: The IR Lowering (Synchronous - CPU)

- **Action:** TypeScript converts NormalizedGraph into scoped `NagaEmitterInstruction` blocks, then emits Naga-like arenas via constrained builder APIs.

- **Performance:** Extremely fast (\$\<2\$ms).

- **Output:** Typed IR artifact (expressions/statements/blocks/source map), no ad-hoc WGSL source generation.

### Stage 2: The WASM Validation (Synchronous - Worker?)

- **Action:** The Naga artifact is validated (expression + statement invariants) and prepared for deterministic WGSL serialization.

- **Validation:** Naga checks types (vec3 + float errors).

- **Emission:** Serializer boundary produces WGSL from validated IR when linking artifacts.

- **Optimization:** We can run this in a WebWorker to keep the UI silky smooth, but main-thread execution is acceptable for v3.0 if the graph is small (\<500 nodes).

- **Failure:** If Naga returns Err, transition to ERROR state immediately. Parse the Rust error string to find the Node ID.

### Stage 3: The Driver Linking (Asynchronous - GPU)

- **Action:** We call async pipeline creation using serializer-produced WGSL.

- **Wait:** We await this promise. The browser yields to the main thread.

- **Reality:** The GPU driver is now compiling optimized machine code for the shader.

- **Failure:** If the promise rejects (rare, usually a driver bug or resource limit), transition to ERROR.

### Stage 4: The Artifact Packaging

- **Action:** Bundle the new GPUComputePipeline, the GpuLayout (offsets), and the ShapeTable into a CompilationResult.

- **State:** Transition to READY.

## 5. The Hot-Swap Protocol

We have a new pipeline ready. When do we switch?

**Do NOT switch immediately.** Switching pipelines mid-frame causes tearing or stutter.

1.  **Compiler:** Sets pendingResult = newArtifact. State becomes READY.

2.  **Runtime Loop:**

    - At the *top* of the frame (before dispatch), checks compiler.tryGetNewPipeline().

    - If valid:

      - **Stop** the old execution.

      - **Migrate State:** Run the "State Migration" compute pass (copying Old Arena \$\to\$ New Arena).

      - **Bind:** Bind the new GPUComputePipeline.

      - **Resume:** Continue execution with the new logic.

3.  **Compiler:** Sets state to IDLE.

## 6. Error Propagation (The "Red Border")

Since Naga is a "Black Box," error messages come back as strings.

- **Naga Error:** "Type mismatch at Expression [42]" or "Invalid condition at Statement [7]"

- **Source Map:** The Compiler must maintain a map of StatementIndex \$\to\$ BlockID.

- **The "Mangler":** When generating the IR, we attach metadata (comments or auxiliary maps) that links generated instruction indices back to the user's BlockID.

- **UI Update:** The Service parses the error, finds the BlockID, and pushes an error object to the global ErrorState. The UI component for that block subscribes to this state and renders a red border.

## 7. Caching Strategy (The Optimization)

Re-compiling the *entire* graph when moving a single "Math Add" node is wasteful. However, solving "Incremental Compilation" for global optimization is hard.

**The v3.0 Compromise: The Module Cache.**

- **Key:** Hash of the NagaModule JSON.

- **Value:** The generic GPUComputePipeline.

- **Logic:**

  1.  Lower the graph to NagaModule.

  2.  Calculate Hash(NagaModule).

  3.  Check Cache.get(Hash).

  4.  If hit: Return existing pipeline immediately (skip WASM, skip Driver).

  5.  If miss: Compile and store.

**Why this helps:** Undo/Redo operations become instant. Toggling a bypass on/off (if it generates the same shader structure) becomes instant.

## 8. Summary of Requirements

1.  **Service Class:** Implement AsyncCompilerService using RxJS (Observables) or standard Promises/EventEmitters.

2.  **Debounce:** Implement a trailing debounce (e.g., 50-100ms) on scheduleCompile.

3.  **WASM Loader:** Ensure naga.wasm is fetched and instantiated *before* the service accepts requests.

4.  **Pipeline Async:** strictly use createComputePipelineAsync, never the synchronous version.

5.  **Cancellation:** Implement a token/version check to discard stale compilation results.

This architecture ensures that no matter how complex the shader becomes, the UI remains responsive, capable of 60fps animations even while the compiler is churning in the background.

## 9. Completion Note

**Status:** Complete for runtime integration requirements in this phase (1, 2, 4, 5), including startup.

**Evidence:**

1. `createComputePipelineAsync` is now the exclusive path for all compute pipeline creation in `WebGPURenderer`:
   - `WebGPUComputeRuntime.create()` (static async factory) — simulation pipeline
   - `WebGPUDrawPrepRuntime.create()` (static async factory) — draw-prep pipeline
   - `WebGPUDrawPrepRuntime.useShader()` — live shader hot-swap fires async creation

2. `createRenderPipelineAsync` is now the exclusive path for the render (path) pipeline:
   - `WebGPURenderer.createPathPipelineAsync()` (static async factory)

3. `WebGPURenderer.create()` awaits all three async factories in parallel via `Promise.all` before constructing the renderer.

4. Hot-swap protocol implemented: `WebGPUDrawPrepRuntime.commitPendingPipeline()` is called at the top of each render frame to atomically swap in any resolved async pipeline.

5. Generation counter prevents stale pipeline commits when multiple shader updates fire in rapid succession.

6. Startup compile now flows through `AsyncCompilerService` + `CompileWorkerClient` and applies precomputed artifacts through `compileAndSwap(..., isInitial=true, precomputed)` in `RuntimeService`.
   - The synchronous startup `compileAndSwap(..., isInitial=true)` compile path was removed from `RuntimeService.init()`.
   - Startup and live recompiles share one canonical compile-request shape (`buildCompileRequest`) and one swap queue (`flushPendingSwap`).
   - Worker compile failures do not fall back to synchronous compile.

**Remaining boundary:** Requirement 3 (Naga WASM boot/loader ownership) remains tracked by P2-2/P2-3.

**Verification commands:**

```bash
pnpm -s typecheck
pnpm -s vitest run src/services/__tests__/RuntimeService.test.ts src/services/__tests__/AsyncCompilerService.test.ts src/render/webgpu/__tests__/WebGPURenderer.test.ts
```

**Changed files:**
- `src/render/webgpu/WebGPURenderer.ts`
- `src/render/webgpu/__tests__/WebGPURenderer.test.ts`
- `src/services/RuntimeService.ts`
- `src/services/__tests__/RuntimeService.test.ts`
