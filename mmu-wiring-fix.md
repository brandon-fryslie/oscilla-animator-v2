### Diagnosis: Why the Screen is Blank
The "blank screen" bug is a result of a disconnected dataflow in the main renderer.

1.  **The Good News:** The `load_symbolic` deserialization crash is fixed. The Rust engine now correctly receives the high-level symbolic IR from TypeScript.
2.  **The Bad News:** The function `rebuild_with_symbolic_manifest` in `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` is **ignoring** this new IR. It accepts the `lowering` argument but passes it directly to the old `rebuild_simulation_pipeline`, which doesn't know how to translate symbolic IDs.
3.  **The Result:** The shader runs, but it likely defaults all memory reads to address 0 because the symbolic IDs are never resolved to physical addresses. All geometry collapses to the origin.

### Why This Happened (The Context)
This is a classic integration gap. We successfully moved the *capability* to translate symbolic IDs from the `naga-shim` into the core `oscilla-rust-renderer` crate (specifically into `compute.rs`). However, we never updated the *orchestrator* (`engine.rs`) to actually call this new capability. The engine is essentially holding the map but not using it to drive the car.

### Implementation Plan
To fix this, we must wire the new translation function into the engine's rebuild loop.

**File:** `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs`

**Action:** Update `rebuild_with_symbolic_manifest` to perform the translation step *before* pipeline construction.

```rust
pub fn rebuild_with_symbolic_manifest(
    &mut self,
    manifest: crate::memory::MemoryManifest,
    lowering_ts: crate::compute::NagaModuleIR_TS, // <--- This is the high-level IR
    max_active_lanes: u32,
    uber_shader_wgsl: &str,
    dispatch_instructions: Vec<crate::compute::NagaEmitterInstruction>,
) -> Result<(), String> {
    // 1. Build the Resolver (Already present)
    let resolver = crate::memory::SymbolResolver::build_from_manifest(&manifest);

    // 2. [NEW STEP] Execute the Translation
    // Call the function we moved into compute.rs to convert Symbolic IR -> Physical IR
    let lowering_physical = crate::compute::lower_naga_module_ir(&lowering_ts, &resolver)?;
    
    // 3. Pass the PHYSICAL IR to the pipeline builder
    // Change the third argument from `lowering` (which was the TS version) to `lowering_physical`
    self.compute.rebuild_simulation_pipeline(
        &self.device,
        &resolver,
        lowering_physical, 
        max_active_lanes,
        dispatch_instructions,
    )?;

    // ... rest of function remains the same ...
}
```

### Why This Plan Works
This change enforces **[LAW:single-enforcer]**. The `lower_naga_module_ir` function becomes the single, unavoidable gateway for all shader code entering the system. It guarantees that no symbolic ID can ever reach the GPU without first being mathematically resolved to a physical address stride and offset by the Rust MMU. This permanently fixes the blank screen issue and fully enables the Phase 1 architecture.
