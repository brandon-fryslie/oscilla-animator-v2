# Unified Transforms Architecture: System Invariants

**Date**: 2026-01-01
**Author**: Gemini Agent
**Status**: Finalized

## 1. Core Principle: Statefulness Dictates Graph Representation

All operations in the system are strictly categorized based on their statefulness. This directly dictates their representation in the patch (editor data model) and the compiler's Intermediate Representation (IR).

### Invariant 1.1: Wires are Pure, Stateless Connections
*   A wire represents a directed flow of a signal from an output port to an input port.
*   Wires themselves are **stateless** and are purely topological definitions. They do not hold persistent data or perform computations that depend on past values.

### Invariant 1.2: Stateful Operations are Always Explicit Blocks
*   Any operation that requires memory (i.e., its output depends on its previous state) **must be a Block**.
*   This includes operations like `slew`, `delay`, `latch`, integrators, etc.
*   These "Infrastructure Blocks" are first-class citizens in the patch data (`patch.blocks`) and the compiler's IR. They own and manage their own state.
*   **Rationale**: This ensures that all state is explicitly declared, owned by a schedulable entity, and visible in the IR, satisfying the requirement for backend compilation to systems that do not tolerate implicit state (e.g., Rust).

### Invariant 1.3: Stateless Operations are "Stateless Transforms"
*   Any operation that is a pure function of its inputs (i.e., its output depends only on its current inputs and parameters, not past values) is a "Stateless Transform".
*   This includes operations like `scale`, `clamp`, `quantize`, `mapRange`, etc.
*   **Representation**: Stateless Transforms are stored as metadata (`Edge.transforms`) on the wire connection itself. They are **not** blocks.
*   **Execution**: The compiler can inline these operations directly into the data-flow expression of the receiving block. They do not introduce new nodes into the scheduled graph.

---

## 2. Editor Workflow (UI-Driven Graph Transformation)

The editor's role is to bridge the user's intuitive intent with the strict architectural invariants.

### Invariant 2.1: The `PaletteRegistry` as the Source of Truth
*   The UI's palette of available operations is driven by the `PaletteRegistry`.
*   Each `PaletteEntry` explicitly declares whether it represents a `stateless-transform` or a `stateful-block`.

### Invariant 2.2: Editor-Driven Graph Surgery
*   When a user applies an operation from the palette onto a wire, the Editor performs the necessary graph modification:
    *   **For `stateless-transform`**: The transform is added to the `Edge.transforms` array of that wire. The graph topology remains unchanged.
    *   **For `stateful-block`**: The Editor performs graph surgery:
        1.  A new block (e.g., `SlewBlock`) is created and inserted into the patch data.
        2.  The original wire `Source -> Destination` is removed.
        3.  Two new wires are created: `Source -> newBlock` and `newBlock -> Destination`.
        *   **Rationale**: This ensures that the patch data (and thus the compiler's IR) always reflects the true, explicit state ownership, even when the user's interaction felt like applying a "modifier" to a wire.

---

## 3. Compiler & Runtime Implications

### Invariant 3.1: No Compiler-Inserted Blocks
*   The compiler will **never** spontaneously generate blocks that are not explicitly present in the patch data.
*   All blocks in the IR are direct representations of blocks in the patch.

### Invariant 3.2: Explicit State Management
*   Every stateful operation (Block) in the IR will have its state explicitly declared and managed by the runtime.
*   Stateless transforms are inlined; they do not consume runtime state.

---

## 4. Relationship to Legacy Concepts

*   **"Publisher" and "Listener" Concepts**: These are deprecated and replaced by the explicit notion of block output ports and input ports, respectively. The scope terminology (`input`, `output`, `param`) in the `PaletteRegistry` reflects this.
*   **"LensStack" and "AdapterChain"**: These legacy mechanisms are replaced by the unified `Edge.transforms` array for stateless operations.
*   **"Hidden Blocks"**: This concept is explicitly **rejected**. All blocks that exist in the scheduled graph must exist in the editor's patch data. The UI's "graph surgery" ensures this.

---

## 5. References

*   `14-Stateful-Primitives.md`: Defines the canonical set of blocks (`UnitDelay`, `Lag`, `Phasor`, `SampleAndHold`) used for stateful operations.
