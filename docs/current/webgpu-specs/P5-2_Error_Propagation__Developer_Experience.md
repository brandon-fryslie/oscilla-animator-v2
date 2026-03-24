> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/current/webgpu-specs/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Developer Experience & Migration Strategy: Error Propagation**.

This document defines the "immune system" of the application. It details how raw, cryptic error messages from the Rust/WASM compiler are captured, translated, and surgically mapped back to the specific node in the UI that caused them, ensuring the user never sees a black screen or a console panic.

# The Developer Experience: Error Propagation

## Related Contracts

- `docs/current/webgpu-specs/IMPLEMENTATION-INDEX.md`
- `docs/current/webgpu-specs/P2-1_Async_Compiler_Service_Architecture.md`
- `docs/current/webgpu-specs/P2-3__Naga_WASM_Compiler_Validation_Layer.md`
- `docs/current/webgpu-specs/P5-3__Phased_Rollout__Engine_Migration_Strategy.md`

**Objective:** Transform compiler failures into actionable UI feedback (Red Borders).

**Invariant:** A compilation error must **never** crash the running audio/visual engine. The previous valid program must continue to run until the error is resolved.

**Mechanism:** A SourceMap registry that links generated IR instructions back to their originating UI Block IDs.

## 1. The "Safety Valve" Architecture (Runtime Behavior)

The most critical part of error handling is what happens to the *active* experience.

### 1.1 The "Stale State" Rule

When the user makes an invalid connection (e.g., connecting a vec3 to a float input):

1.  **Compiler:** Detects the error in the new graph.

2.  **Action:** The compiler **rejects** the update.

3.  **Runtime:** Continues running the *old* pipeline (the state from 100ms ago).

4.  **UI:** Displays the error on the new graph.

**Result:** The music doesn't stop. The visuals don't freeze. The user can fix the mistake without losing their "flow."

### 1.2 The "Crash" Scenario (Runtime Errors)

If the compiler *passes* (valid types) but the shader crashes at runtime (e.g., Infinite Loop or Out-of-Bounds Read causing a GPU reset):

1.  **Detector:** The device.lost promise resolves, or a GPUPipelineError is thrown during dispatch.

2.  **Action:** The Runtime Executor enters **Safe Mode**.

    - It stops dispatching the compute shader.

    - It clears the screen to a "Sad Mac" color (e.g., Dark Red).

    - It creates a "Recovery" pipeline (a simple pass-through) if possible.

3.  **UI:** Locks the editor with a "GPU Reset Detected" modal.

## 2. The Source Map (The Rosetta Stone)

Naga doesn't know about "Oscilla Blocks." It only knows about Expression Handle \[42\]. We must bridge this gap.

### 2.1 The Mapping Structure

During the **Lowering Phase** (TS \$\to\$ IR), we populate a sidecar data structure.

TypeScript

// compiler/SourceMap.ts\
\
export class SourceMap {\
// Maps a Naga Expression ID (u32) to a Block ID (string)\
private exprToBlock = new Map\<number, string\>();\
\
// Maps a Naga Statement Index (u32) to a Block ID (string)\
private stmtToBlock = new Map\<number, string\>();\
\
// Called during lowering\
recordExpr(exprId: number, blockId: string) {\
this.exprToBlock.set(exprId, blockId);\
}\
\
recordStmt(stmtIndex: number, blockId: string) {\
this.stmtToBlock.set(stmtIndex, blockId);\
}\
\
// Called during error handling\
lookup(location: NagaErrorLocation): string \| null {\
if (location.kind === 'Expression') {\
return this.exprToBlock.get(location.handle);\
}\
if (location.kind === 'Statement') {\
return this.stmtToBlock.get(location.index);\
}\
return null;\
}\
}

### 2.2 Populating the Map

In the LoweringCtx:

TypeScript

// Inside lowerStep(step, ctx)\
const exprId = ctx.addExpr({ kind: 'Binary', op: 'Add', ... });\
ctx.sourceMap.recordExpr(exprId, step.blockId); // \<--- The Link

## 3. The Naga Error Parser (The Translation)

The Rust Shim returns a structured error object. We need to parse it.

### 3.1 The Rust Output

Naga's ValidationError usually looks like this (serialized):

JSON

{\
"kind": "Function",\
"name": "main",\
"error": {\
"kind": "Expression",\
"handle": 42,\
"message": "Type mismatch: \[1\] != \[2\]"\
}\
}

### 3.2 The Parsing Logic

The CompilerService processes the failure.

TypeScript

// CompilerService.ts\
\
private handleError(nagaError: any, sourceMap: SourceMap) {\
// 1. Extract Location\
// Naga errors are nested. We drill down to find the handle.\
const handle = nagaError.error?.handle;\
\
// 2. Lookup Source\
const blockId = sourceMap.lookup({ kind: 'Expression', handle });\
\
if (blockId) {\
// 3. Dispatch to Global Error Store\
this.errorStore.add({\
blockId: blockId,\
message: this.humanizeMessage(nagaError.error.message),\
severity: 'error'\
});\
} else {\
// Fallback: Global Toast\
this.notificationService.error("Unknown Compiler Error: " + nagaError.message);\
}\
}

### 3.3 The "Humanizer"

Naga says: The expression \[1\] may only be indexed by a constant.

We translate: Arrays must use a fixed number as an index.

- **Implementation:** A regex-based dictionary of common Naga error patterns mapped to musician-friendly text.

## 4. The UI Integration (The Feedback Loop)

The UI layer subscribes to a runtime-scoped error store.

### 4.1 The Block Component

Every node in the graph checks if it has active errors.

TypeScript

// Block.tsx\
const Block = ({ id }) =\> {\
// Selective Subscription: Only re-render if \*this\* block has an error\
const error = useStore(state =\> state.runtimeErrors\[id\]);\
\
return (\
\<div className={classNames("block", { "has-error": !!error })}\>\
{/\* The Node Content \*/}\
\<div className="header"\>...\</div\>\
\
{/\* The Feedback Tooltip \*/}\
{error && (\
\<div className="error-tooltip"\>\
\<Icon name="alert" /\>\
{error.message}\
\</div\>\
)}\
\</div\>\
);\
};

### 4.2 The Mini-Map Visualization

For large graphs, the user might not see the error off-screen.

- **Feature:** The Mini-Map renders a bright red dot at the coordinates of the failing block.

- **Interaction:** Clicking the error notification in the sidebar "Teleports" the viewport to the failing block.

## 5. Handling "Cascading" Errors

If Block A has a type error, Block B (connected to A) will also fail because its input is invalid. This creates a "Sea of Red."

### 5.1 The Root Cause Analysis

We want to highlight Block A, not Block B.

- **Strategy:** Topological Filtering.

- **Logic:**

  1.  The Compiler returns a list of *all* errors.

  2.  The UI sorts them by the **Topological Sort Order** of the blocks.

  3.  **Display Rule:** Only show the error for the *first* block in the execution chain that failed.

  4.  **Gray Out:** Mark downstream blocks as "Disabled/Unreachable" rather than "Error."

## 6. Connection-Time Validation Policy

Type validation should be enforced before compile where possible.

1. Invalid links are rejected at interaction time.
2. Compiler still validates full graph and emits source-mapped diagnostics.
3. No implicit cast insertion in canonical mode unless an explicit cast node exists in graph IR.

## 7. Summary of Implementation

1.  **Create SourceMap Class:** Implement the registry for ExprID -\> BlockID.

2.  **Update Lowering:** Inject calls to ctx.sourceMap.record() for every generated instruction.

3.  **Update Rust Shim:** Ensure ValidationError structs are serialized fully (not just the message string).

4.  **Create Runtime Error Store:** A runtime-scoped state container for validation issues.

5.  **Update UI:** Add the "Red Border" CSS and Tooltip logic to the Block component.

6.  **Safety Valve:** Ensure the CompilerService wraps the compilation in a try/catch block that preserves the *previous* pipeline on failure.

This system turns the compiler from a "Black Box of Doom" into a helpful pair programmer, guiding the user to fix their logic without interrupting the performance.
