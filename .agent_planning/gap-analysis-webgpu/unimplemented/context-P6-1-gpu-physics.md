# Context: P6-1 - GPU Physics Engine with Compute Shaders

## Target State
A complete GPU-native physics engine using XPBD:
- Semi-implicit Euler integration
- Spatial hash broad-phase collision
- Graph-colored parallel Jacobi constraint solver
- 5-pass compute dispatch per sub-step
- Physics World/Collider/Force Field blocks in the registry
- Deterministic bit-exact simulation
- Sub-stepping loop for stiffness control

## Current State
The GPU physics engine is **entirely unimplemented**. No physics-related code exists in:
- No physics compute shaders
- No physics memory channels in the arena
- No spatial hash
- No constraint solver
- No graph coloring
- No physics blocks
- Zero lines of physics-related code in the source

The existing GPU compute infrastructure (simulation dispatch, arena, compute dispatcher) provides the foundation but none of the physics-specific work has been started.

## Files Involved
Files that would need to be created/modified:
- `src/render/wasm/rust/oscilla-rust-renderer/src/` - New physics compute shaders, arena channel extensions
- `src/blocks/physics/` - New block category with PhysicsWorld, Collider, ForceField blocks
- `src/compiler/backend/` - Graph coloring pass, physics dispatch scheduling
- `src/compiler/ir/` - Physics constraint IR, batch emission

## Suggested Approach
This is a large feature (P6 = Phase 6 in the spec) that should be built in stages:
1. **Arena channels**: Add velocity, prev_pos, inv_mass channels to GpuMemoryArena
2. **Integration kernel**: Simple predict pass
3. **Spatial hash**: Grid-based broad phase with atomicAdd
4. **Collision resolve**: Narrow-phase position correction
5. **Constraint bank**: Data structure + compiler graph coloring
6. **Constraint solver**: Per-batch dispatch
7. **Velocity finalize**: XPBD velocity update
8. **Blocks**: PhysicsWorld, Collider, ForceField block definitions
9. **Sub-stepping**: Loop wrapper for multiple solver iterations per frame

## Risks
- This is the largest unimplemented feature in the WebGPU spec
- Spatial hash atomics require careful GPU synchronization
- Graph coloring is a compiler feature that needs integration with existing backend passes
- Determinism is hard to guarantee across GPU vendors
- XPBD stability depends heavily on parameter tuning
- This is Phase 6 content -- it should only be attempted after Phases 1-5 are complete
