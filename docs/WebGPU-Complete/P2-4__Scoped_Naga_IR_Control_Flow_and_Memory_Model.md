This is the comprehensive technical specification for **The Compiler Architecture: Scoped Naga IR Control Flow and Memory Model**.

This document defines the architectural shift from a flat data-flow lowering model to a scoped, recursive compute architecture with explicit control-flow blocks and dynamic memory primitives.

# The Compiler Architecture: Scoped Naga IR Control Flow and Memory Model

## Related Contracts

- `docs/WebGPU-Complete/IMPLEMENTATION-INDEX.md`
- `docs/WebGPU-Complete/P2-1_Async_Compiler_Service_Architecture.md`
- `docs/WebGPU-Complete/P2-2__Naga_Compiler_Lowering_Pipeline_Explained.md`
- `docs/WebGPU-Complete/P2-3__Naga_WASM_Compiler_Validation_Layer.md`
- `docs/WebGPU-Complete/P3-2_GPU_Compute_Dispatch_Explained.md`

**Objective:** Establish a deterministic, type-safe, hierarchical lowering boundary that supports loops, branches, dynamic indexing, and atomics without allowing direct WGSL string generation in lowering code.

**Invariant:** All user graph lowering enters the GPU through the constrained `NagaBuilder` API and scoped `WgslNagaCompiler` instruction model.

**Mechanism:** Recursive block compilation + lexical scope environments + centralized validation on expression and statement arenas.

## 1. Canonical Boundary
- [LAW:one-source-of-truth] Canonical lowering boundary: `src/compiler/ir/naga-emitter/*`.
- [LAW:single-enforcer] Semantic safety checks are enforced by `NagaBuilder` + `NagaValidator`.
- [LAW:dataflow-not-control-flow] Evaluation order is deterministic; variability is data-driven through typed handles and block contents.
- [LAW:no-string-math] Lowering logic must not concatenate WGSL source strings.

## 2. Recursive Instruction Model
Lowering targets a hierarchical instruction union that includes:
- scalar/vector/matrix constants and ALU ops
- dynamic memory ops (`bufferReadDynamic`, `bufferWriteDynamic`, `atomicAdd`)
- structured control flow (`loop`, `if`, `break`, `continue`)

Control-flow instructions contain nested bodies (`body`, `acceptBody`, `rejectBody`) that are recursively compiled into `NagaBlock` statement lists.

## 3. Lexical Scope and ID Lifetimes
`ScopeEnvironment` enforces block-local ID ownership:
- entering a block pushes a child scope
- exiting a block pops that scope
- lookups traverse parent scope chain only

Result: IDs produced in a child block are inaccessible after block exit, preventing scope leaks by construction.

## 4. Dynamic Memory and Hardware Safety
### 4.1 Mandatory bounds clamping for dynamic reads
For every `bufferReadDynamic` lowering path, the compiler injects:
1. `arrayLength(buffer)`
2. `maxIndex = length - 1`
3. `safeIndex = min(rawIndex, maxIndex)`
4. final read using `safeIndex`

### 4.2 Pointer model
Dynamic memory is represented via pointer-like expressions:
- `ArrayLength { expr }`
- `Access { base, index }`
- `Load { pointer }`

Stores use statement form:
- `Store { pointer, value }`

### 4.3 Atomics
Atomic operations are expression-level (`AtomicResult`) and return the prior value. Integer payload constraints are mandatory.

## 5. Upstream Graph and Lowering Implications
### 5.1 Control-flow edges are first-class
Topological data dependency alone is insufficient. Graph lowering must preserve execution structure and emit nested block bodies.

### 5.2 SSA and mutability boundaries
SSA expression handles are immutable. Mutable intra-dispatch state must flow through explicit memory constructs (e.g., pointer-backed stores) rather than back-edges.

### 5.3 zip/reduction behavior
When cardinality requires iterative reduction, lowering may emit explicit loops instead of assuming implicit element-wise execution.

## 6. Downstream Runtime and Rendering Implications
### 6.1 Deterministic serializer boundary
If WGSL text emission is required, it occurs once at a deterministic engine boundary from validated Naga IR, not in agent-authored lowering logic.

### 6.2 Pass ordering and synchronization
Render graph execution must preserve compute-before-render ordering when storage-written buffers become render inputs, honoring WebGPU visibility and usage contracts.

### 6.3 Layout correctness
Canonical type/stride contracts must remain consistent with GPU layout requirements; padding/alignment rules are enforced by compiler/runtime layout ownership.

### 6.4 Uber-shader integration
Graph-generated shader logic is integrated through explicit function/module boundaries into the rendering pipeline rather than ad hoc source mutation.

## 7. Verification Gates
The architecture is considered aligned only if all pass:
1. Typecheck is clean for emitter modules.
2. Emitter tests verify:
   - recursive block emission
   - lexical scope isolation failures are caught
   - dynamic-read clamp injection is present
   - atomic non-integer payload rejection
   - string interpolation exclusion in emitter lowering files
3. Validator reports expression vs statement failures with source mapping to `visualBlockId`.
4. Draw-prep metadata stays structured in compiler IR (`drawPrepProgram.sinks`); `compile.ts` must not assemble draw-prep WGSL source text.

## 8. Reference Documents
- `docs/compiler/ONE-TRUE-EMITTER.md`
- `src/compiler/ir/naga-emitter/naga-types.ts`
- `src/compiler/ir/naga-emitter/NagaBuilder.ts`
- `src/compiler/ir/naga-emitter/WgslNagaCompiler.ts`
- `src/compiler/ir/naga-emitter/NagaValidator.ts`
- `src/compiler/ir/naga-emitter/ScopeEnvironment.ts`
