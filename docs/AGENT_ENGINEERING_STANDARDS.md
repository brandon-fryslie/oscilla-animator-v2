# Agent Engineering Standards

This document defines the hard technical invariants for the Oscilla Animator engine. All autonomous agents MUST adhere to these standards. Failure to follow these rules constitutes a structural defect, even if the code passes tests.

## 1. Zero-Allocation Hot Path
The engine operates on a strict zero-allocation requirement for all "hot path" operations.
- **Hot Paths Include:**
  - `src/compiler/backend/compiled-runtime-install-contract.ts` (Installation loops)
  - `src/runtime/` (Any frame-level processing)
  - `src/render/` (Hot renderer dispatch)
- **Rules:**
  - **NO** `new Uint32Array()`, `new Float32Array()`, or `new Array()` inside loops.
  - **NO** `Array.map()` or `Array.filter()` if they produce new arrays inside loops.
  - **DO** use pre-allocated buffers passed as arguments.
  - **DO** write directly into target buffers using `target[offset] = value` or `target.set(source, offset)`.

## 2. ABI & Enum Safety
Memory layouts (ShapeBank, TopologyBank, Uniforms) are governed by strict ABI contracts.
- **Rule:** Never use hardcoded integer offsets for memory indexing.
- **Enforcement:**
  - Use the `ShapeBankHeaderWord` enum for all ShapeBank access.
  - If you need Word 6, use `ShapeBankHeaderWord.BaseVertex`.
  - Always cross-reference `src/runtime/RuntimeState.ts` or `src/shapes/types.ts` to ensure enum values match the intended hardware word.

## 3. Memory Addressing: Absolute vs. Relative
Offsets in the engine often come in two flavors. Misidentifying them causes catastrophic rendering failures.
- **Relative Offsets:** Word offsets from the *start of a specific record* (e.g., `FirstIndex` in a ShapeBank header is usually relative to the start of that shape's memory block).
- **Absolute Offsets:** Word/Byte offsets from the *start of the entire buffer* (e.g., WebGPU `drawIndexedIndirect` expects `first_index` to be an absolute offset into the bound index buffer).
- **Transformation:** To convert Relative to Absolute, you must add the record's base offset:
  `absolute_offset = record_base_offset + relative_offset_from_header`

## 4. Naga AST over String Concatenation
The WGSL compiler boundary is a hard firewall.
- **Rule:** Strictly NO string concatenation for generating shader code.
- **Enforcement:**
  - Use `NagaBuilder` or the equivalent Rust AST constructors.
  - Logic must be constructed using `Statement::If`, `Expression::Binary`, etc.
  - If you find yourself writing ``const code = `...```, you are violating the architecture.

## 5. [LAW:dataflow-not-control-flow]
Software structure mirrors data flow, not control flow.
- **Rule:** Side effects are unconditional.
- **Enforcement:**
  - Avoid `if` statements that skip entire operations. Use `select()` or bitwise masking.
  - The same operations must execute in the same order every invocation; variability lives in the data values.

## 7. SoA (Structure of Arrays) Addressing
The engine uses SoA layout for high-performance memory access. You MUST use the following canonical addressing formula in all shaders (WGSL/Naga).
- **Inputs from Header:** `base_offset`, `lane_stride`, `component_stride`.
- **Indices:** `lane_index` (e.g., `gid.x` or `instance_index`), `component_index` (0, 1, 2...).
- **The Formula:**
  `physical_index = base_offset + (lane_index * lane_stride) + (component_index * component_stride)`
- **Rule:** Never assume `lane_stride` is 1 or that `component_stride` is `laneCount`. Always read them from the canonical ShapeBank header.

## 9. Purge Mandate: Deletion over Refactoring
During a 'Purge' or 'Hardening' task, your goal is to physically remove code, not to preserve functionality.
- **Rule:** If a test breaks because you deleted a block, you MUST delete the test. 
- **DO NOT** attempt to 'fix' the test by building a simpler graph or restructuring the code.
- **DO NOT** create shims or placeholders to keep the build green.
- **THE GOAL:** A smaller, cleaner codebase that strictly adheres to the target architecture. If existing tests prevent this, they are incorrect and must be deleted.
