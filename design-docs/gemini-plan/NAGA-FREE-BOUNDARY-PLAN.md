# Naga-Free Boundary Plan: Logical Graph Serialization

**Status:** Proposed Architecture
**Goal:** Purge Naga AST construction from JavaScript. Move all shader-generation logic to Rust.
**Boundary:** TypeScript emits a high-level `OscillaGraphIR`; Rust transforms it into a validated Naga `Module`.

---

## 1. The Core Thesis: "What" vs. "How"

The current architecture suffers from **leaky abstractions**: JavaScript is forced to manage Naga Handles, Arena indices, and low-level expression types. This creates a tight coupling that breaks whenever the Rust Naga version changes or the GPU alignment rules shift.

### The New Partition
| Concern | Owner | Responsibility |
|---------|-------|----------------|
| **Logic** | JavaScript | Topological sorting, high-level instruction emission (`Add`, `PathSample`). |
| **Silicon** | Rust | Naga Arena management, type-checking, `std430` padding, WGSL emission. |

---

## 2. Boundary A' Currency: `OscillaGraphIR`

We replace the low-level `NagaModuleIR` with a high-level logical schema. JavaScript never sees a "Handle" or an "Arena."

### JS-Side Instruction Schema
```typescript
type OscillaInstruction = 
  | { op: 'Literal'; value: number; output: string }
  | { op: 'Binary'; operator: 'Add' | 'Mul' | 'Sub'; inputs: [string, string]; output: string }
  | { op: 'Unary'; operator: 'Sin' | 'Cos' | 'Abs'; input: string; output: string }
  | { op: 'PathSample'; mode: 'position' | 'tangent'; t: string; cp: string; output: string }
  | { op: 'StateRead'; resourceId: string; lane: string; output: string }
  | { op: 'StateWrite'; resourceId: string; lane: string; value: string };
```

---

## 3. The Rust Transformer (The Instruction MMU)

A new module in the Rust renderer (`transformer.rs`) will act as the native compiler.

### Responsibilities:
1.  **Arena Ownership:** It owns the `naga::Module` and its `Arena<Expression>`.
2.  **Instruction Expansion:** It maps one high-level instruction (e.g., `PathSample`) to many low-level Naga expressions.
3.  **Handle Mapping:** It maintains a `HashMap<String, Handle<Expression>>` to resolve JS output IDs into Rust handles.
4.  **Native Validation:** It runs `naga::valid::Validator` on the completed module before passing it to `wgpu`.

---

## 4. High-Level Intrinsics (The Bezier/MSDF Solvers)

Instead of JavaScript attempting to lower complex math into a forest of Naga nodes, Rust provides **Intrinsic Macros**.

### Example: Cubic Bezier Expansion
When Rust receives a `PathSample` instruction:
1.  The Transformer executes a Rust-side function: `expand_cubic_bezier(t_handle, p0_handle, ...)`.
2.  This function appends the ~20 binary expressions required for the formula directly into the Rust arena.
3.  **Result:** JS stays clean; the math is implemented once in Rust where it can be unit-tested.

---

## 5. The Fast-Path Steering Sink

We will establish the `update_control` WASM entry point correctly, following the zero-allocation hot-path rules.

*   **Location:** `src/render/wasm/rust/oscilla-rust-renderer/src/lib.rs`
*   **Implementation:**
    ```rust
    #[wasm_bindgen]
    pub fn update_control(offset_bytes: u32, value: f32) -> Result<(), JsValue> {
        ENGINE.with(|engine| {
            engine.borrow().as_ref()?.update_control(offset_bytes, value)
        })
    }
    ```
*   **Validation:** This bypasses the Transformer and the Compiler entirely, satisfying Phase 1.4 of the GPU architecture plan.

---

## 6. Execution Phases

### Phase 1: The Instruction Purge (TS)
*   Delete `Interner`, `NagaExpressionIR`, and `NagaTypeIR` from `ScheduleNagaLowering.ts`.
*   Refactor `LoweringCtx` to emit a flat list of `OscillaInstruction`.

### Phase 2: The Native Transformer (Rust)
*   Implement `transformer.rs` in Rust.
*   Update `lib.rs` to receive the new `OscillaGraphIR` JSON.
*   Map `Binary` and `Unary` instructions to Naga expressions.

### Phase 3: The Intrinsic Upgrade (Rust)
*   Implement `expand_cubic_bezier` in Rust.
*   Implement `expand_msdf_median` in Rust.

---

## 7. Machine-Verifiable Gates

1.  **Instruction Density:** `grep -r "naga" src/compiler` must return **ZERO** hits (excluding the shim boundary).
2.  **Schema Validation:** The Rust `OscillaInstruction` enum must use `#[serde(deny_unknown_fields)]` to ensure JS and Rust never drift.
3.  **Visual Ground Truth:** The **Payload Tester** must render a Sine Wave using the new `OscillaGraphIR` instruction set.
4.  **O(1) Check:** A unit test must prove that `update_control` takes < 0.1ms and does not trigger a re-compile of the `naga::Module`.
