# Evaluation: Block Library Overhaul Master Plan

**Status:** Technical Audit & Validation Specification
**Author:** Gemini CLI (Architectural Agent)
**Date:** March 24, 2026

---

## 1. Executive Summary

The "Boundary-First, Verified Bottom-Up" strategy is the correct architectural approach for this engine. By treating the transition between TypeScript and Rust as a formal **Foreign Function Interface (FFI)** with a serialized payload, we eliminate the primary failure mode of the current system: implicit memory management in JavaScript.

### Critical Technical Findings
*   **The Naga AST Firewall is the "Single Enforcer":** The plan correctly doubles down on `NagaModuleIR` as the currency for all passes. This prevents the "WGSL String Hack" observed in legacy fluid code.
*   **Symbolic Resolution is the MMU:** Delegating offset calculation to the Rust `SymbolResolver` is the only way to satisfy WebGPU's `std430` alignment invariants safely.
*   **The "Interactive Payload Tester" is Mandatory:** This tool is not just a helper; it is the **Ground Truth** for the renderer.

---

## 2. Machine-Verifiable Gates (Acceptance Criteria)

To ensure agents do not "shim and hack" their way through the implementation, we will enforce the following hard gates.

### GATE 1: The "String-Free Block" (Babel Enforcement)
**Verifies:** Boundary B integrity.
*   **Method:** A custom Babel plugin or ESLint rule scans `src/blocks/**/*.ts`.
*   **Verification:** It must throw a build error if any `lower()` function contains string literals or template literals that resemble WGSL code (e.g., regex matching `var<`, `fn `, `->`, `f32`, `atomic`).
*   **Target:** `0` instances of raw shader code in the block library.

### GATE 2: The "Pure Lowering" Gate (Dependency Cruiser)
**Verifies:** Architectural Layering.
*   **Method:** `dependency-cruiser` rule.
*   **Verification:** Blocks are forbidden from importing from `src/render/` or `src/services/`. They may only import from `src/core/` (canonical types) and `src/compiler/ir/`.
*   **Target:** Strict one-way dependency: `Blocks -> IR -> Compiler -> Renderer`.

### GATE 3: The "Schema Integrity" Gate (JSON Schema)
**Verifies:** Boundary A contract.
*   **Method:** `ajv` (TS) and `serde_json` (Rust) validation.
*   **Verification:** Every hand-written fixture in the Phase 0 tool must pass a formal JSON Schema validation. The TS and Rust schemas must be derived from the same source of truth.
*   **Target:** Zero "Unknown Field" or "Type Mismatch" errors during pipeline reconstruction.

### GATE 4: The "Fast-Path O(1)" Gate (Unit Test)
**Verifies:** Phase 1 Silicon completeness.
*   **Method:** Vitest execution.
*   **Verification:** A test must instantiate a `FastPathController`, simulate a `ParamChanged` event, and assert that the Wasm bridge `update_control` is called with the exact offset retrieved from `fastPathOffsets`.
*   **Target:** Verification that UI scrubs bypass the AST lowering logic.

---

## 3. Tooling Strategy

### 1. Babel (The Static Auditor)
Use Babel to enforce **Single Static Assignment (SSA)** invariants within blocks.
*   **Action:** Write a plugin that ensures every call to `ctx.b.opcode()` result is immediately assigned to a `const` and never mutated.
*   **Prohibited:** `let` variables and `re-assignment` inside `lower()` functions.

### 2. Dependency Cruiser (The Layer Guard)
Define a "Forbidden" matrix in `.dependency-cruiser.cjs`:
*   **Blocks:** Cannot touch the `SharedArrayBuffer` or `wgpu` bindings.
*   **Compiler:** Cannot import `React` or `MobX` stores.
*   **Renderer:** Cannot import `TypeScript` compiler utilities.

### 3. Headless WebGPU (The Ground Truth)
*   **Tool:** `wgpu-native` with a Deno or Node.js bridge.
*   **Action:** Run the Phase 0 fixtures in a headless CI environment.
*   **Verification:** Capture the frame buffer and assert that `pixel(x,y)` matches the expected color derived from the demo patch. This is the only way to verify the **4-Pillar payloads** are behaviorally correct.

### 4. Naga Validator (The Rust Firewall)
*   **Action:** The Rust `WgslNagaCompiler` must call `naga::valid::Validator` on every received `NagaModuleIR`.
*   **Verification:** Any IR that would produce invalid WGSL (type mismatch, out-of-bounds access) must be rejected with a `PipelineRebuildFailure` that maps back to the `visualBlockId`.

---

## 4. Immediate Corrective Actions

Before starting Phase 0 of the Block Library Plan, the following technical debt from the GPU-ARCHITECTURE-PLAN must be cleared:

1.  **Implement `update_control` in `lib.rs`:** The Wasm bridge is currently "open-ended." The `FastPathController` has nowhere to send its data.
2.  **Bezier Math in `ScheduleNagaLowering.ts`:** `SamplePath` lowering is currently a mock. The Cubic Bezier evaluation logic must be physically implemented in the Naga Emitter to satisfy Tier 3 of the Block Library Plan.
3.  **Texture2D in MMU:** Ensure `memory.rs` can allocate and bind `grid_2d` resources before attempting the Tier 4 Solver blocks.
