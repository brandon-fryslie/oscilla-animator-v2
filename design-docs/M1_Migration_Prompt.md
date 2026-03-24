### 🎯 Prompt: M1 Strike 1 - Eradicate Domain Allocation Caps

**Context:**
Please read the attached `M1_Migration_Onboarding.md` document to understand the strict architectural invariants for this task. We are executing the first phase of the M1 migration.

**Objective:**
Eradicate the legacy domain caps (`max_particles` and `max_shapes`) from the Rust WebGPU runtime's allocation planning and the JS -> Rust bootstrap boundary. 

**Scope of Work:**
1. **Rust Engine Initialization:** - Remove `max_particles` and `max_shapes` from `EngineConfig` in `src/render/wasm/rust/engine.rs`.
   - Remove these parameters from `Engine::new()`, `GpuMemoryArena::new()`, and `ComputeDispatcher::new()`.
2. **Dynamic Manifest Allocation:**
   - The Rust `GpuMemoryArena` must no longer pre-allocate massive buffers based on `max_particles`. 
   - Instead, the arena should initialize with minimal/empty buffers. 
   - The actual allocation must occur exclusively during `rebuild_gpu_pipelines` (or `rebuild_with_symbolic_manifest`), where the `MemoryManifest` dictates the exact byte requirements for the `arena_in` / `arena_out` storage buffers. 
3. **The JS/WASM Boundary:**
   - Update the TypeScript side of the WebAssembly binding (likely in `src/services/compile.worker.ts` or the engine bootstrap module) so it no longer passes `maxParticles` and `maxShapes` into the Rust `EngineConfig`.
4. **Clean up Dead Code:**
   - Remove any fallback logic in Rust that relied on these maximums to calculate buffer spans or dispatch limits. 

**Validation:**
Ensure the project compiles. The runtime must successfully boot and execute the current graph fixtures relying *only* on the `MemoryManifest` for byte-exact buffer allocation.

**Constraints:**
Refer to `// [LAW:single-enforcer]` and `// [LAW:dataflow-not-control-flow]`. Do not introduce new domain limits to replace the old ones.
