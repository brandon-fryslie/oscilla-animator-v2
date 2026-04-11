This is a massive step forward for the Oscilla architecture. Moving away from a "God Object" and enforcing a strict semantic boundary between data creation and presentation is exactly how you achieve that 120fps zero-allocation target while keeping the node graph ergonomic. 

Here is the comprehensive, standalone Architecture Reference Document (ARD). It extracts every rule, contract, and design pattern from our discussion so you have a single source of truth for the Blocks overhaul.

***

# Architecture Reference Document (ARD): The 4-Pillar Block Abstraction

**Project:** Oscilla
**Subject:** Core Graph Architecture, Block Library Overhaul, and `RenderIntent` Pipeline
**Status:** Canonical Reference

## 1. Executive Summary

As Oscilla evolves to support extreme procedural complexity—from Eulerian fluids and Type 2 parametric splines to math-heavy legacy preset formulas (e.g., Milkdrop)—the node graph compiler must elegantly handle massive parameter modulation without bottlenecking. 

This document formally deprecates the monolithic `RenderIntent` "God Object" model, which incorrectly coupled data generation with data presentation. It is replaced by the **4-Pillar Abstraction**. By strictly isolating block responsibilities into linguistic categories (Nouns, Adjectives, Verbs), the engine achieves **Total Modulation**, zero duplicate code, and deterministic, pre-allocated WebGPU execution.

### 1.1 Architectural Invariants (The Laws)
* `[LAW:dataflow-not-control-flow]` Variability is represented in compiled data arrays and compute dispatches, not ad hoc runtime `if/else` branching by feature type.
* `[LAW:one-source-of-truth]` The compiler's generated artifacts (Manifest + Pass Roster) are authoritative. The runtime never re-derives, parses, or guesses intended execution values.
* `[LAW:single-enforcer]` Invariants (like memory limits) are enforced exactly once at the compile/rebuild phase, never inside the per-frame hot loop.
* `[LAW:one-type-per-behavior]` There are no "parallel renderers" (e.g., a fluid path vs. a shape path). Everything compiles to the exact same primitive pass execution model.

---

## 2. Core Philosophy: Verbs, Nouns, and Adjectives

In signal processing and graphics pipelines, architectural terminology must be exact. The block library and compiler IR are categorized into four distinct, composable interfaces based on their semantic role:

* **A Source (Noun):** Produces raw data (Geometry, SDFs, Fluid Textures).
* **A Material (Adjective):** Describes surface visual properties (Color, Emission, Thickness).
* **An Intent (Verb):** An instruction to the execution engine (e.g., "Dispatch this pass," "Draw this data").

---

## 3. The 4-Pillar Architecture

### Pillar 1: Generators (The `RenderSource` Sum Type)
Generators introduce physical or mathematical data topology into the pipeline. They exclusively own their specific structural bindings and emit a generic proxy handle.

* **Responsibility:** Owns generation parameters (e.g., `radius`, `viscosity`, `t_step`).
* **Output:** `ResourceProxyId`
* **Sum Types:**
    * `TopologySource`: Static/indexed topology + per-instance param lanes.
    * `ParametricTemplateSource`: Type 2 continuous math (e.g., `CubicBezier`, `ClosedBlob`).
    * `FieldSource`: Continuous mathematical fields sampled at runtime.
    * `SolverResourceSource`: Products of a simulation pass (e.g., fluid textures).
* **IR Contract:**
    ```typescript
    interface RenderSource {
        kind: 'Topology' | 'Parametric' | 'Field' | 'SolverResource';
        // The generator exclusively owns its own parameter modulation
        sourceBindings: Map<SemanticId, ValueExprId>; 
        output: ResourceProxyId;
    }
    ```

### Pillar 2: Modifiers (Signal / Spatial Processors)
Modifiers sit strictly between Generators and Sinks. They take a proxy, apply a compute kernel, and output a modified proxy.

* **Responsibility:** Because the engine natively maps instances to compute threads, modifiers act as implicit vectorization maps to warp space or structure before rendering.
* **Examples:** `TwistGeometry`, `AdvectFluid`, `RemapFieldLUT`.
* **IR Contract:** Takes a `ResourceProxyId`, applies math via its own `paramBindings`, outputs a new `ResourceProxyId`.

### Pillar 3: Materials (Surface Evaluators)
Materials evaluate surface properties. They are entirely agnostic to whether they are painting a rigid mesh, a parametric ribbon, or a 2D fluid quad.

* **Responsibility:** Exclusively owns visual bindings (e.g., `hue`, `roughness`).
* **Examples:** `MatCap2.5D`, `FluidColorWarp`, `BasicUnlit`.
* **Output:** `MaterialProxyId`
* **IR Contract:**
    ```typescript
    interface Material {
        kind: 'ShaderAST' | 'ComputeComposite';
        materialBindings: Map<SemanticId, ValueExprId>; 
        output: MaterialProxyId;
    }
    ```

### Pillar 4: The Render Sink (`RenderIntent`)
This is the *only* block that generates a `RenderIntent`. It is an incredibly thin instruction that simply zips a Source and a Material together for the backend's pass roster.

* **Responsibility:** Presentation and rasterizer layout logic only.
* **Examples:** `DrawInstances`, `DrawFullScreenQuad`.
* **IR Contract:**
    ```typescript
    interface RenderIntent {
        source: ResourceProxyId;
        material: MaterialProxyId;
        // Intent bindings are ONLY for presentation/rasterizer logic
        intentBindings: Map<'blendMode' | 'depthTest', ValueExprId>; 
    }
    ```

---

## 4. System Capabilities & Validation

### 4.1 Total Modulation
By isolating parameter ownership to the block that actually uses the data, users can ergonomically modulate everything in the graph without overwhelming the compiler. 
* *Example:* Wire an `Oscillator` to `FluidSolver.viscosity` (**Source Binding**), a `SimplexNoise` field to `FluidColor.hue` (**Material Binding**), and a `Constant` to `Draw.blendMode` (**Intent Binding**). 

### 4.2 Zero Duplicate Code
This abstraction eliminates parallel render blocks. There is no need for `RenderFluid`, `RenderRibbon`, or `RenderMesh` blocks. A single `Draw` block accepts any `ResourceProxyId` and `MaterialProxyId`, executed blindly by an Uber Shader based on the `RenderSource.kind` metadata.

### 4.3 Future-Proofing for Complex Formulas
Math-heavy legacy systems (like Milkdrop) with dozens of per-vertex equations do not break the engine. The raw math formulas simply become **Modifier** blocks manipulating a `ResourceProxyId`, processed natively by downstream Materials and Sinks.

---

## 5. Global Context & Hard Boundaries

The architecture handles core engine state via pre-allocated Structure of Arrays (SoA) memory, imposing strict but highly performant boundaries.

### 5.1 The Cardinality Boundary (Instance Counts)
Instance counts are dictacted by the `InstanceDomain` block prior to Pillar 1. 
* **Compile-Time (Allocation):** The compiler builds a `MemoryManifest` based on the maximum possible value (e.g., 10,000 slots of SoA memory).
* **Run-Time (Modulation):** The exact evaluated count is written to the `active_lanes` uniform. The renderer executes an indirect draw call for the active instances, leaving the tail end of the VRAM untouched.

### 5.2 Global Context (The Camera)
Cameras are not Nodes, Materials, or Intents; they are **Global Context Writers**.
* A `PerspectiveCamera` block maps its outputs directly to the `FrameHeader` Uniform Buffer Object (UBO).
* During the initial compute pass, the GPU calculates any modulations (e.g., an Oscillator wired to `PositionX`) and writes the View/Projection matrix directly into global memory.

### 5.3 Hard Constraints (Triggering a Rebuild)
Crossing these boundaries requires an expensive `REBUILD_GPU_PIPELINES` operation:
1.  **Dynamic Topology Resolution:** Cannot smoothly modulate the segment count of a compiled Type 2 Parametric shape mid-frame (index buffers are baked at compile-time).
2.  **Data-Dependent Spawning:** Variable-length arrays (e.g., dynamic `push()` for particles) are prohibited to maintain the SoA memory contract.
3.  **Graph Topology Modulation:** Cannot dynamically route signals to bypass or inject blocks via `if/else` logic. WebGPU compute passes are statically compiled sequentially.

---

## 6. Official Design Pattern: Eulerian-to-Lagrangian Spray

To achieve variable-looking particle spawning (like a fluid breaking into spray) without violating the "No Data-Dependent Spawning" constraint, the architecture utilizes **Deterministic Object Pooling with Stochastic Sampling**.

1.  **The Pool (Source A):** An `InstanceDomain` block allocates a massive, fixed pool of particles (e.g., 50,000 instances) at compile time. All ages start at `-1.0` (dead).
2.  **The Fluid (Source B):** The `EulerianFluidSolver` outputs transient textures (velocity, dye).
3.  **The Bridge (Modifier):** An `EjectFluidSpray` modifier block bridges the two. Every frame, all 50,000 compute threads run. "Dead" particles randomly sample the fluid grid. If the sampled velocity exceeds a threshold, the particle "wakes up," snaps to that coordinate, and inherits the velocity.

This keeps the memory footprint permanently locked while achieving complex, collision-based generative interactions.

***

Would you like me to map out the exact compiler IR generation steps for that `EjectFluidSpray` modifier so we can solidify how the JS/TS compiler writes the `MemoryManifest` for these dual-source compute passes?