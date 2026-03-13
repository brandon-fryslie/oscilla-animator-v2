# P6-1: GPU Physics Engine with Compute Shaders - UNIMPLEMENTED Items

## Item 1: XPBD Physics Solver
**Spec says**: Extended Position Based Dynamics (XPBD) solver with semi-implicit Euler integration, position-based constraint resolution, and XPBD velocity update formula (`Vel = (Pos_Pred - Prev_Pos) / dt`).
**Implementation**: No XPBD solver exists anywhere in the codebase. No physics-related compute shaders found. Grep for "XPBD", "physics", "constraint solver" returned zero results in source code.
**Gap**: Entire physics engine is unimplemented.
**Classification**: UNIMPLEMENTED

## Item 2: Physics Memory Architecture (Motion/Material/Constraint Channels)
**Spec says**: Arena expansion with SoA channels: VEL_X/Y, PREV_POS_X/Y, INV_MASS (motion), FRICTION/BOUNCE (material), and a Constraint Bank (u32 storage with packed integer tuples).
**Implementation**: No physics channels exist in the arena layout. `GpuMemoryArena` in the Rust renderer handles simulation state but with no physics-specific channels.
**Gap**: No physics memory layout.
**Classification**: UNIMPLEMENTED

## Item 3: Spatial Hashing (Broad-Phase Collision)
**Spec says**: GPU spatial hash grid with: (1) Clear grid, (2) Populate grid via atomicAdd, (3) Narrow-phase collision checking 9 neighbor cells.
**Implementation**: No spatial hash implementation found. Grep for "spatial hash" returned zero results.
**Gap**: Entire collision system is unimplemented.
**Classification**: UNIMPLEMENTED

## Item 4: Constraint Solver with Graph Coloring
**Spec says**: Compiler builds adjacency graph of constraints, applies greedy graph coloring to assign batch IDs, emits constraint bank sorted by batch ID, generates one dispatch per color batch. No atomics required due to color batching.
**Implementation**: No graph coloring or constraint batching found. Grep for "graph color" returned zero results in relevant files.
**Gap**: Entire constraint solver and graph coloring system is unimplemented.
**Classification**: UNIMPLEMENTED

## Item 5: Physics Compute Dispatch Sequence (5 Passes)
**Spec says**: Five-pass sub-stepping loop: (1) Integration/Predict, (2) Broad-phase spatial hash, (3) Narrow-phase collision solve, (4) Constraint batch solve (per color), (5) Velocity update/finalize.
**Implementation**: No physics dispatch sequence exists. The existing compute dispatch handles simulation + render assembly + draw prep, but no physics passes.
**Gap**: Entire dispatch sequence is unimplemented.
**Classification**: UNIMPLEMENTED

## Item 6: Physics World / Collider / Force Field Blocks
**Spec says**: "Physics World" block (gravity, substeps, iterations), "Collider" block (shape with is_collider flag), "Force Field" block (writes to Force_Accumulator channel).
**Implementation**: No physics-related blocks found in `src/blocks/`. Grep for "physics", "collider", "force field" in blocks returned zero results.
**Gap**: No physics blocks exist in the block registry.
**Classification**: UNIMPLEMENTED

## Item 7: Deterministic Physics Invariant
**Spec says**: Running simulation with same dt and seed produces bit-exact results. Batch coloring ensures fixed order of operations.
**Implementation**: N/A -- no physics system to evaluate.
**Gap**: Entire requirement is unimplemented.
**Classification**: UNIMPLEMENTED
