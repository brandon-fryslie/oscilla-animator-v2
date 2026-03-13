# P1-1: Unified GPU Buffer Strategy (Arena) - UNIMPLEMENTED Items

## Item 1: Migration Compute Dispatch for Buffer Resizing
**Spec says**: Section 4.1 "We issue a specialized 'Migration Compute Dispatch'. This shader reads from Old_Arena using the Old Layout Offsets. It writes to New_Arena using the New Layout Offsets." New buffer size = RequiredSize * 1.5 (geometric growth).
**Implementation**: Buffer resizing in `memory.rs:605-682` uses `ensure_*_capacity()` methods with geometric doubling (`next_capacity *= 2`). When a buffer is resized, a NEW buffer is created and the OLD one is dropped. There is NO migration compute dispatch. A `SIMULATION_MIGRATION_COMPUTE_WGSL` shader exists in `shaders.ts:196-214` that copies `srcWords[gid.x] = dstWords[gid.x]`, but this is for bulk word-copy migration only and is in the JS-side renderer, not the Rust engine. The Rust engine's `clear_simulation_planes()` at `memory.rs:110-117` ZEROS new buffers after pipeline rebuild rather than migrating old data.
**Gap**: When simulation buffers are resized (e.g., instance count grows), all simulation state is LOST because the new buffers are zero-initialized. The spec requires a migration compute dispatch to preserve state during reallocation. This means increasing particle count mid-animation resets all physics/state.
**Classification**: UNIMPLEMENTED

## Item 2: Defragmentation Strategy
**Spec says**: Section 4.2 "When a user deletes a node, holes appear in the layout. Phase 0: We ignore it. Phase 1: On the next Resize Event, the compiler compacts the layout, removing the holes during the Migration copy."
**Implementation**: No defragmentation logic exists. The compiler's `ArenaZonePlan` (`storage-class.ts`) always re-derives the arena layout from scratch on recompile, which implicitly compacts. However, within a single arena lifetime, freed slots are not reclaimed.
**Gap**: Since the compiler re-derives on every recompile, Phase 1 effectively happens. But within a running arena without recompile, there is no compaction. This is "Phase 0" behavior which is acceptable per spec.
**Classification**: UNIMPLEMENTED (but Phase 0 matches spec's explicit interim plan)

## Item 3: Gauge Zone GPU-Side Decay
**Spec says**: Section 2, Zone 5: "Compute Shader reads Gauge, decays it (Gauge *= 0.9), and adds it to the output. Compute Shader writes the decayed Gauge back to the Output Buffer."
**Implementation**: Gauge/continuity is handled entirely on the CPU side. `ContinuityState.ts` and `ContinuityApply.ts` manage slew buffers. `storage-class.ts:153` declares gauge targets, and `ArenaZonePlan` allocates gauge zone ranges. However, the actual continuity decay runs in the JS runtime (`runtime/ContinuityState.ts`), not in a GPU compute shader.
**Gap**: The spec envisions GPU-side gauge decay in the compute shader. The implementation does continuity smoothing on the CPU. This means gauge decay is NOT parallelized and adds CPU load per frame.
**Classification**: UNIMPLEMENTED

## Item 4: Alignment Padding Between Field Channels
**Spec says**: Section 3.2: "The start of every Field Channel should ideally be aligned to 256 bytes (or at minimum 16 bytes). If InstanceCount is 100, the size is 400 bytes. We round up to 512 bytes."
**Implementation**: `storage-class.ts:126-129` defines alignment as `headerFloats: 64` and `scalarToFieldAlignFloats: 64` (256 bytes for scalar-to-field). However, within the field zone, individual channel alignment is NOT explicitly enforced. The `deriveArenaDescriptor()` at `storage-class.ts:80-107` computes offsets based on slot stride * laneCount without inter-channel padding.
**Gap**: Scalar-to-field boundary alignment is implemented (64 float = 256 byte). Channel-to-channel alignment within the field zone is NOT implemented. This may cause suboptimal GPU memory bandwidth for SoA field layouts.
**Classification**: UNIMPLEMENTED
