> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Compiler Architecture: The Lowering Pipeline (TS \$\to\$ Naga)**.

This document defines the core transformation logic of the compiler. It details how we convert high-level graph IR into a structured, strictly-typed **scoped Naga Intermediate Representation (IR)** with recursive control-flow blocks and explicit memory/pointer operations.

# The Compiler Architecture: The Lowering Pipeline

**Objective:** Transform graph operations into a concrete, strictly-typed scoped IR that mirrors Naga-style expression/statement arenas and block bodies.

**Invariant:** The output must be a valid NagaModule JSON object (or structurally identical AST) that is guaranteed to pass Naga’s validation.

**Mechanism:** Recursive block lowering with lexical scope environments, interned types/constants, and SSA expression handles.

## 1. The Naga IR Schema (The Target)

We do not generate strings. We generate a **Tree of Objects**. This tree mirrors the Rust structs found in the naga crate. We define these interfaces in TypeScript to ensure 1:1 compatibility.

### 1.1 The Root Module

TypeScript

interface NagaModule {\
types: NagaType\[\]; // Arena of unique types (f32, vec3, struct...)\
constants: NagaConstant\[\]; // Arena of compile-time constants (0.0, 1.0, 3.14)\
global_variables: NagaGlobal\[\]; // Bindings (Arena, Uniforms)\
functions: NagaFunction\[\]; // The code (compute_main, helpers)\
entry_points: NagaEntryPoint\[\]; // { stage: 'compute', function: 'compute_main', ... }\
}

### 1.2 The Function Anatomy

A Naga function is not just a list of lines. It is split into **Expressions** (pure values) and **Statements** (side effects/flow).

- **expressions (Arena):** A flat list of every value computed.

  - *Example:* \[0: Load(x), 1: Load(y), 2: Add(0, 1)\]

- **body (Block):** Nested statement blocks (`Loop`, `If`) referring to expression handles.

  - *Example:* \[ Store { pointer: GlobalZ, value: Expr(2) } \]

## 2. The Lowering Context (LoweringCtx + ScopeEnvironment)

The lowering process is stateful. We need a class to manage the "Arenas" (Interning) and track variable scopes.

TypeScript

class LoweringCtx {\
// 1. Interning Tables (Deduplication)\
// If we need 'f32' ten times, we return the same TypeID '1'.\
types: Interner\<NagaType\>;\
constants: Interner\<NagaConstant\>;\
\
// 2. Lexical Scoping (SSA Mapping)\
// Maps IR IDs to Naga expression handles with parent-scope lookup.\
private currentScope: ScopeEnvironment;\
\
// 3. Helpers\
addGlobal(binding: number, name: string, type: NagaType): number;\
addExpr(expr: NagaExpression): number; // Returns new ID\
addStmt(stmt: NagaStatement): void;\
}

## 3. Phase 1: Preamble & Global setup

Before walking the schedule, we must define the "World" (Memory Layout) in Naga terms.

### 3.1 Defining Types

We pre-populate the types arena with primitives.

- Type\[0\]: Scalar { kind: 'f32', width: 4 }

- Type\[1\]: Scalar { kind: 'u32', width: 4 }

- Type\[2\]: Vector { size: 2, kind: 'f32' }

- ...

- Type\[N\]: Array { base: Type\[0\], size: Dynamic } (The Arena Array)

### 3.2 Defining Globals (The Bindings)

We generate NagaGlobal entries for our buffers.

- **arena_in**: Var { class: 'Storage', binding: { group: 0, binding: 0 }, type: Type\[Array_f32\] }

- **arena_out**: Var { class: 'Storage', binding: { group: 0, binding: 1 }, type: Type\[Array_f32\] }

- **uniforms**: Var { class: 'Uniform', ... type: Type\[Struct_Uniforms\] }

### 3.3 Defining the main Function

We create the compute_main function and inject standard preambles.

1.  **Arguments:** Define input global_id: vec3\<u32\>.

2.  **Lane Calculation:**

    - Inject Expr: AccessIndex { base: global_id, index: 0 } (Get .x).

    - Store this as lane_idx in the Context. Used by all subsequent Field operations.

## 4. Phase 2: The Recursive Block Walk

We recursively iterate instruction blocks. For each instruction, we execute a **Lowering Strategy** in the active lexical scope.

### 4.1 Address Resolution (The Access Pattern)

Before generating math, we must fetch the data.

- **Input:** SlotID (e.g., 5).

- **Action:** Query GpuLayout.getOffsets(5).

- **Logic:**

  - **If Scalar:** Generate Expr::Constant(Offset).

  - **If Field:** Generate Expr::Binary { op: 'Add', left: Constant(Offset), right: lane_idx }.

  - *Result:* An Expression ID representing the **Index** in the Arena array.

### 4.2 The Dynamic Load Operation

We generate the load instruction.

- **Expression:** `ArrayLength` + clamp math + `Access` + `Load`.

  - *SoA:* Since arena_in is a flat f32 array, this is essentially Access { base: arena_in, index: Expr(Index) }.

  - *Optimization:* We immediately cache this Expression ID in slotToExpr.

### 4.3 The Math Generation (Kernel Injection)

Now we have the inputs as Naga Expressions. We generate the logic.

**Example: Add(Slot A, Slot B)**

1.  **Retrieve:** lhs = slotToExpr.get(A), rhs = slotToExpr.get(B).

2.  **Type Check (Compiler Validation):**

    - If Type(lhs) is f32 and Type(rhs) is f32:

      - Generate Expr::Binary { op: 'Add', left: lhs, right: rhs }.

    - If Type(lhs) is vec3 (SoA tuple) and Type(rhs) is vec3:

      - *Special Handling:* We actually have 3 separate Expressions for A (x,y,z) and 3 for B.

      - Generate 3 separate Add expressions: x' = Ax + Bx, y' = ...

      - Store 3 result IDs.

### 4.4 The Store Operation (Output)

If the step writes to a field (most do):

1.  **Resolve Output Address:** Just like input resolution (Offset + Lane).

2.  **Generate Statement:** Store { pointer: Access(arena_out, OutIndex), value: ResultExpr }.

## 5. Handling Control Flow, State, and Dynamic Memory

Naga IR requires strict structure for branching, loops, and pointer-based memory operations.

### 5.1 Select / Mix (Logic)

- **Input:** Select(TrueVal, FalseVal, Condition).

- **Naga:** Expr::Select { condition: C, accept: T, reject: F }.

- *Note:* This handles the "No branching" rule. It compiles to a hardware select instruction, not an if/else.

### 5.2 Structured Control Flow

- **Loop:** Lower to `Statement::Loop { body: NagaBlock }` with lexical scope push/pop.
- **If:** Lower to `Statement::If { condition, accept: NagaBlock, reject: NagaBlock }`.
- **Break/Continue:** Valid only inside loop scope.

### 5.3 Helper Functions (Library IR)

For complex blocks (like SimplexNoise), we don't inline the logic.

1.  **Registry:** We check ctx.functions for `"snoise"`.

2.  **Injection:** If missing, we append a pre-defined helper function in structured IR form (not WGSL source text concatenation).

3.  **Call:** In compute_main, we generate function-call expressions with typed handle arguments.

## 6. Dynamic Memory, Atomics, and Handles

How do we lower the **Shape Handles** (u32) discussed in Phase 0?

- **Type:** The context treats Handles as u32 (interned Type 1).

- **Storage:** They live in the Scalar Zone of the Arena.

- **Casting:**

  - The Arena is f32.

  - When reading a Handle, we must generate Expr::As { kind: 'Uint', expr: LoadExpr, width: 4 }. This emits a bitcast\<u32\>(val) in WGSL.

  - When writing, we cast back: Expr::As { kind: 'Float', expr: HandleExpr, width: 4 }.

## 7. The Output Artifact

The result of this pipeline is a fully populated NagaModule object.

TypeScript

const artifact = {\
module: {\
types: \[ ... \],\
functions: \[\
{\
name: "main",\
expressions: \[ ... 500 exprs ... \], // The DAG\
body: \[ ... 200 stores ... \] // The Effect\
}\
\]\
},\
// Map for Error Highlighting\
sourceMap: {\
"Expr_42": "Block_ID_10",\
"Expr_43": "Block_ID_10"\
}\
};

### 7.1 Why this wins

1.  **Zero Syntax Errors:** It is impossible to generate "missing semicolon" or "unbalanced brace" errors because we aren't writing text. We are building a graph.

2.  **Validation Ready:** Expression + statement arenas are validated before serialization/linking.

3.  **Optimization:** We can run a trivial "Dead Code" pass on the expressions array before emission (remove IDs that are never referenced by a Statement).

This pipeline converts your graph into a **Math Essence**. It strips away all the UI fluff, objects, and names, leaving only the raw, typed operations that the GPU devours.
