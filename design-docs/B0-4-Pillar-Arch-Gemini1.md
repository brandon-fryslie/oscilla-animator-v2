Here is the complete, standalone Architecture Reference Document (ARD) for the Oscilla v3.0 Blocks Overhaul. I have synthesized the scattered technical decisions, constraints, and contracts into a single source of truth.

***

# Architecture Reference Document (ARD): The 4-Pillar Node Abstraction

**Subject:** Overhaul of the Block Library and Compilation Pipeline (Oscilla v3.0)
**Status:** Canonical Reference

## 1. Executive Summary

As Oscilla evolves into a Generalized Relational Dataflow Engine—capable of supporting Type 2 parametric splines, multi-pass Eulerian fluids, and complex legacy procedural math (e.g., Milkdrop)—the node graph compiler must elegantly handle massive parameter modulation at 120fps.

Previous architectural iterations relied on a monolithic `RenderIntent` that managed both the generation parameters of a shape and its presentation state. This "God Object" anti-pattern coupled the *creation* of data with the *presentation* of data, leading to unmanageable compiler IR (Intermediate Representation) and tangled user interfaces.

This document formally deprecates the monolithic `RenderIntent` and establishes the **4-Pillar Abstraction**. By strictly isolating block responsibilities into precise linguistic categories (Nouns, Adjectives, Verbs), the engine achieves **Total Modulation**, zero duplicate code, and strict adherence to zero-allocation WebGPU constraints.

---

## 2. Architectural Invariants (The Laws)

The compiler (JS/TS) acts as the domain-aware brain, while the WebGPU Runtime (Rust) acts as a blind, highly optimized execution orchestrator. To maintain this boundary, the following invariants are absolute:

* **`[LAW:dataflow-not-control-flow]`**: Variability is represented in compiled data arrays and compute dispatches, not ad hoc runtime `if/else` branching by feature type. Dynamic shader branching at the block-routing level is prohibited.
* **`[LAW:one-source-of-truth]`**: The compiler's generated artifacts (Manifest + Pass Roster) are authoritative. The Rust runtime must never re-derive, parse, or use heuristics to guess intended execution values or source kinds.
* **`[LAW:single-enforcer]`**: Invariants (like memory limits or routing maps) are enforced exactly once at the system boundary (install/rebuild phase), never inside the per-frame hot loop.
* **`[LAW:one-type-per-behavior]`**: There are no "parallel renderers" (e.g., a fluid path vs. a shape path). Everything compiles to the exact same primitive pass execution model.

---

## 3. The 4-Pillar Abstraction

To solve the "God Object" trap, pipeline stages are strictly defined by their linguistic role.

### Pillar 1: Generators (The Nouns)
Generators introduce physical or mathematical data topology into the pipeline. They exclusively own their specific structural bindings and emit a generic proxy handle.

* **Sum Types (`RenderSource`):**
    * `TopologySource`: Static/indexed topology + per-instance param lanes.
    * `ParametricTemplateSource`: Type 2 continuous math (e.g., `CubicBezierRibbon2D`).
    * `FieldSource`: Continuous mathematical fields sampled at runtime.
    * `SolverResourceSource`: Products of a simulation pass (e.g., 2D Textures from Eulerian Fluid).
* **Responsibility:** The generator block owns its generation parameters (e.g., `resolution`, `viscosity`, `radius`).
* **IR Contract:**
    ```typescript
    interface RenderSource {
        kind: 'Topology' | 'Parametric' | 'Field' | 'SolverResource';
        // The generator exclusively owns its own parameter modulation!
        sourceBindings: Map<SemanticId, ValueExprId>; 
        output: ResourceProxyId;
    }
    ```

### Pillar 2: Modifiers (The Signal/Spatial Processors)
Modifiers sit strictly between Generators and Sinks. Because WebGPU naturally maps instance cardinality to compute threads, these act as implicit vectorization maps to warp space or structure before rendering.

* **Examples:** `TwistGeometry`, `AdvectFluid`, `RemapFieldLUT`.
* **Responsibility:** They take a `ResourceProxyId`, apply a compute kernel using their own modulated `paramBindings`, and output a new or modified `ResourceProxyId`.

### Pillar 3: Materials (The Adjectives)
Materials evaluate surface visual properties. They are entirely agnostic to the underlying topology (whether they are painting a rigid mesh, a parametric ribbon, or a 2D fluid quad).

* **Examples:** `MatCap2.5D`, `FluidColorWarp`, `BasicUnlit`.
* **Responsibility:** The material block exclusively owns its visual bindings (e.g., `hue`, `roughness`).
* **IR Contract:**
    ```typescript
    interface Material {
        kind: 'ShaderAST' | 'ComputeComposite';
        materialBindings: Map<SemanticId, ValueExprId>; 
        output: MaterialProxyId;
    }
    ```

### Pillar 4: The Render Sink (The Verbs)
This is the *only* block that generates a `RenderIntent`. It is incredibly thin. It simply zips a Source and a Material together and hands them to the Rust backend's pass roster.

* **Examples:** `DrawInstances`, `DrawFullScreenQuad`.
* **Responsibility:** Execution instructions, presentation, and layout logic only. It must throw a compiler validation error if asked to resolve a semantic binding that belongs to a Source.
* **IR Contract:**
    ```typescript
    interface RenderIntent {
        source: ResourceProxyId;
        material: MaterialProxyId;
        // Intent bindings are ONLY for presentation/layout logic
        intentBindings: Map<'blendMode' | 'depthTest', ValueExprId>; 
    }
    ```

---

## 4. Total Modulation & Memory ABI

By isolating parameter ownership to the block that actually uses the data, the engine achieves **Total Modulation**. A user can safely wire an `Oscillator` to `FluidSolver.viscosity` (Pillar 1), a `SimplexNoise` field to `FluidColor.hue` (Pillar 3), and a `Constant` to `Draw.blendMode` (Pillar 4).

### 4.1 Structure of Arrays (SoA)
To support this modulation at 120fps, dynamic parameters are never packed as Array of Structures (AoS). All data is pre-allocated in SoA formats to guarantee perfect 256-bit memory coalescing during compute dispatches.

### 4.2 Handling Engine State & Boundaries

The architecture handles core engine state natively, provided it adheres to the pre-allocated memory contracts:

* **Modulating Instance Count (Active vs. Allocated):**
    Instance count modulation is supported via the `InstanceDomain` block. The JS Compiler establishes a **Compile-Time Maximum** (allocating the maximum required SoA slots). During runtime, the modulated count evaluates to an `active_lanes` uniform, dictating how many instances the `DrawPrep` pass includes in the `DrawIndirectArgs` buffer. Tail-end memory remains untouched.
* **Modulating Global Camera Parameters:**
    The Camera is "Global Context," not a visual node. A `PerspectiveCamera` block's modulated outputs (FOV, Position) bypass standard IR and map directly to the `FrameHeader` Uniform Buffer Object (UBO). The parameter evaluation compute pass calculates these matrices and writes them to global memory before rendering begins.

### 4.3 Advanced Pattern: Deterministic Object Pooling
Data-dependent spawning (e.g., an Eulerian fluid dynamically emitting variable quantities of Lagrangian spray particles) violates WebGPU variable-length array constraints.

**Solution:** Deterministic Object Pooling with Stochastic Sampling.
1.  **Allocate:** `InstanceDomain` provisions a massive, fixed pool of particles at compile time (e.g., 50,000 SoA slots). All initial ages are set to dead (`-1.0`).
2.  **Evaluate:** Every frame, an `EjectFluidSpray` Modifier bridges the Fluid Grid (`ResourceProxyId` A) and the Particle Pool (`ResourceProxyId` B).
3.  **Sample:** Dead compute threads randomly sample the fluid grid. If the sampled cell surpasses a velocity threshold, the particle "wakes up," snaps to the coordinate, and inherits the fluid physics.

### 4.4 Hard Boundaries (Requires Pipeline Rebuild)
The following operations cannot be modulated per-frame and require an expensive `REBUILD_GPU_PIPELINES` operation:
1.  **Dynamic Topology Resolution:** Changing the baked segment count of a compiled Type 2 Parametric shape (requires rewriting the index buffer to VRAM).
2.  **Graph Topology Modulation:** Dynamically bypassing or injecting entire execution blocks based on logical conditionals.

***

Would you like me to map out the exact JS Compiler schema for the `FrameHeader` UBO integration so we can formalize the Camera modulation block next?