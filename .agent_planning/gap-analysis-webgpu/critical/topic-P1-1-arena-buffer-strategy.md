# P1-1: Unified GPU Buffer Strategy (Arena) - CRITICAL Items

## Item 1: State Loss on Pipeline Rebuild
**Spec says**: Section 4.1: When buffers grow, "We cannot just discard the old data (the simulation would reset). We issue a specialized 'Migration Compute Dispatch'." State preservation during resize is mandatory.
**Implementation**: `engine.rs:790-831` `rebuild_pipeline()` creates an entirely new `GpuMemoryArena` and calls `arena.clear_simulation_planes(&self.queue)` which zeros both ping-pong buffers. Similarly, `rebuild_gpu_pipelines()` at `engine.rs:833-842` calls `clear_simulation_planes` after compiler pass rebuild.
**Gap**: Every pipeline rebuild DESTROYS all GPU simulation state (positions, velocities, phasor state, etc.). This is a direct violation of the spec's requirement that state must be preserved during buffer reallocation. The JS-side runtime DOES handle continuity via `StateMigration.ts`, but the GPU-side state is not migrated -- it is zeroed. This causes visual glitches (particles jumping to origin) on any graph edit that triggers pipeline rebuild.
**Classification**: CRITICAL

## Item 2: Arena Counter Slot Integration Missing
**Spec says**: Section 5: "The Arena contains a Counter slot (usually in the Scalar Zone or a special Atomic counter). Compute Shader increments the Counter while generating geometry. 'Draw Prep' reads that Counter."
**Implementation**: Draw prep (`compute.rs:1-93`, the `DEFAULT_DRAW_PREP_WGSL` shader) reads instance counts from the sink table (`sinkTableWords[recordBase + RECORD_WORD_INSTANCE_COUNT]`), NOT from an arena-embedded atomic counter. Instance counts come from CPU-packed sink table metadata, not from GPU-side counters.
**Gap**: The CPU currently owns the instance count. For dynamic visibility/culling scenarios (where GPU determines how many particles are alive), there is no GPU-side counter mechanism. Draw prep cannot observe GPU-computed visibility results. This blocks GPU-driven culling integration.
**Classification**: CRITICAL (blocks P1-3 culling integration, Section 4)
