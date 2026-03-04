> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is **Part VII: The Physics Engine (Oscilla v3.0)**.

It details how to implement a massively parallel, deterministic physics simulation that lives entirely on the GPU. We will use **XPBD (Extended Position Based Dynamics)** as the mathematical foundation because it allows us to solve rigid bodies, cloth, particles, and constraints within a single unified solver framework that is exceptionally stable on f32.

# Part VII: The Physics Engine Module

## Related Contracts

- `docs/WebGPU-Complete/IMPLEMENTATION-INDEX.md`
- `docs/WebGPU-Complete/P1-1__Unified_GPU_Buffer_Strategy_Explained.md`
- `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`
- `docs/WebGPU-Complete/P3-2_GPU_Compute_Dispatch_Explained.md`

**Algorithm:** Extended Position Based Dynamics (XPBD).

**Integration:** Semi-Implicit Euler.

**Collision:** Spatial Hashing (Unbounded Grid).

**Constraint Solver:** Graph-Colored Parallel Jacobi.

## Scoped IR Implications

- [LAW:one-source-of-truth] Physics dispatch logic is lowered through scoped Naga IR blocks; no direct shader string mutation in block lowering.
- [LAW:single-enforcer] Integer-only atomic constraints and dynamic-index safety are validated at compiler boundary before physics pipelines link.
- [LAW:dataflow-not-control-flow] Sub-step scheduling is deterministic; runtime variability is carried via buffer values and constraint sets.

## 1. Memory Architecture: Physics Extensions

The "Arena" concept must be expanded to support physical properties. We add new channels to the SoA layout. These are permanent residents of the Arena_Ping / Arena_Pong buffers.

### A. The "Motion" Channels (f32 SoA)

- **OFFSET_VEL_X, OFFSET_VEL_Y**: The linear velocity of every particle.

- **OFFSET_PREV_POS_X, OFFSET_PREV_POS_Y**: The position from the previous sub-step (required for XPBD collision resolution).

- **OFFSET_INV_MASS**: The inverse mass (\$1/m\$).

  - *Why Inverse?* Infinite mass (static objects) is represented as 0.0. Dynamic objects are \$\>0\$. This avoids division-by-zero branches in the shader.

### B. The "Material" Channels (f32 SoA)

- **OFFSET_FRICTION**: Per-particle friction coefficient.

- **OFFSET_BOUNCE**: Per-particle restitution coefficient.

### C. The "Constraint Bank" (u32 Storage)

A read-only buffer defining the physical connections (topology).

- **Structure:** Packed integer tuples defining constraints.

  - *Distance Constraint:* { type: 0, particle_index_A, particle_index_B, rest_length_bits }

  - *Angle Constraint:* { type: 1, particle_index_A, B, C, target_angle_bits }

- **Color Batching:** The buffer is segmented by "Color." The Compiler pre-sorts constraints so that **Batch 0** contains only independent constraints (no shared particles). **Batch 1** contains the next set, etc. This allows massive parallelism without race conditions.

## 2. The Compute Dispatch Sequence

Physics is not a single pass. It is a **Sub-Stepping Loop**. If the frame time is 16ms, we might run the physics solver 4 times (4ms steps) to ensure stiff constraints (like a taut string) don't stretch.

### Pass 1: Integration (The "Predict" Phase)

- **Kernel:** Physics_Integrate

- **Logic:**

  1.  Read Position and Velocity.

  2.  Apply external forces (Gravity + Force Fields from the Graph).

  3.  **Predict:** Pos_Pred = Pos + Vel \* dt.

  4.  Write Pos_Pred to the Arena (overwriting the old position temporarily).

  5.  Write Pos to Prev_Pos (for collision solving later).

### Pass 2: Broad-Phase Collision (Spatial Hashing)

We cannot check every particle against every other (\$O(N^2)\$). We use a Spatial Hash.

- **Sub-Pass 2A: Clear Grid:** Reset the Grid_Cell_Count buffer to zeros.

- **Sub-Pass 2B: Populate Grid:**

  - Each particle calculates its "Cell ID" based on Pos_Pred.

  - Atomic Add to Grid_Cell_Count to reserve a slot.

  - Write Particle_ID into the Grid_Content buffer at the reserved slot.

  - *Result:* A list of which particles are in which grid cells.

### Pass 3: Narrow-Phase Collision (The "Solve" Phase)

- **Kernel:** Physics_Collision_Solve

- **Logic:**

  - Each particle checks its own cell and the 8 surrounding neighbor cells.

  - If Distance(Self, Neighbor) \< Radius_A + Radius_B:

    - Calculate the collision normal and penetration depth.

    - Apply a **Position Correction** (\$\Delta x\$) directly to Pos_Pred to separate them.

    - Apply friction and restitution to Velocity.

### Pass 4: Constraint Solver (The "Structure" Phase)

This is where "Sticks" and "Joints" are solved.

- **Execution:** We dispatch this kernel once *per color batch*.

- **Kernel:** Physics_Constraint_Batch

- **Uniforms:** Batch_Start_Index, Batch_Count.

- **Logic:**

  - Thread ID maps to a Constraint ID in the Constraint Bank.

  - Read Particle A and Particle B positions.

  - Calculate the error (e.g., CurrentLength - RestLength).

  - Calculate gradients (direction to move).

  - Apply **Position Correction** weighted by InvMass.

  - *Note:* Because of Color Batching, no two threads touch the same particle simultaneously. No atomics required.

### Pass 5: Velocity Update (The "Finalize" Phase)

- **Kernel:** Physics_Update

- **Logic:**

  1.  Read Pos_Pred (which is now fully corrected) and Prev_Pos.

  2.  **XPBD Velocity Update:** Vel = (Pos_Pred - Prev_Pos) / dt.

  3.  Write final Pos and Vel to the Arena.

## 3. The Compiler's Role: Graph Coloring

The most critical part of this architecture happens on the CPU during compilation.

**The Problem:** If Particle 1 is connected to Particle 2, and Particle 2 is connected to Particle 3, we cannot solve 1-2 and 2-3 in the same GPU dispatch. Both threads would try to write to Particle 2's position, causing a race condition (exploding physics).

**The Solution:** The Compiler builds an adjacency graph of all constraints.

1.  **Analyze:** Identify which constraints share particles.

2.  **Color:** Use a greedy graph coloring algorithm to assign a "Batch ID" to every constraint.

    - *Batch 0:* Constraints that don't touch each other.

    - *Batch 1:* The next set of non-touching constraints.

3.  **Emit:** The Constraint Bank is sorted by Batch ID.

4.  **Schedule:** The CompiledProgramIR emits a loop of dispatch calls, one for each batch.

## 4. Integration with the Graph

How does the user control this?

- **The "Physics World" Block:**

  - Sets global uniforms: Gravity, Substeps (e.g., 4), Iterations (e.g., 2).

- **The "Collider" Block:**

  - Takes a Shape input.

  - Writes to the Shape Bank with a flag is_collider = true.

  - The Compute Shader reads this flag to know if it should bounce particles off this geometry.

- **The "Force Field" Block:**

  - Just a standard SoA Field operation!

  - Instead of writing to Position, it adds to a temporary Force_Accumulator channel in the Arena. The Integration Kernel reads this accumulator.

## 5. Summary of Physics Invariants

1.  **Deterministic:** Running the simulation with the same dt and seed produces bit-exact results, because the Batch Coloring ensures a fixed order of operations.

2.  **Stiffness Independent of Frame Rate:** Thanks to XPBD, changing the substep count makes the simulation *stiffer*, not *unstable*.

3.  **Unified Solver:** A "Cloth" is just a grid of particles with Distance Constraints. A "Rigid Body" is just a cluster of particles with infinitely stiff Distance Constraints. The engine treats them identically.

This architecture gives you a AAA-grade physics engine that runs entirely on the GPU, scaling to hundreds of thousands of particles/constraints at 60 FPS.

[<u>Using Compute Shaders to Simulate HUGE Armies</u>](https://www.youtube.com/watch?v=TskJt4tlGfU)

*This video demonstrates the specific Spatial Hashing and bitonic sort techniques required for the collision phase, directly validating the "Grid" approach outlined above.*
