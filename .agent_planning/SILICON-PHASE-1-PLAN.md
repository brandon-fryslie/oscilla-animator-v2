# Silicon Phase 1: The Fast-Path Architecture

This plan implements the Memory & Control Boundary correctly, following the architectural laws:
- **[LAW:one-source-of-truth]**: The IR metadata is the sole authority for update frequency.
- **[LAW:one-way-deps]**: Store -> Event -> Controller -> Engine. No circular peeking.
- **[LAW:single-enforcer]**: The Binding Pass is the single place that resolves shared slot UpdateClasses.

## 1. The Compiler Flow (Silicon Metadata)
Instead of the backend "guessing" intent, the metadata flows forward through the compiler stages.

1. **Registry**: `InputDef` declares the capability (`updateClass`).
2. **Frontend Bridge**: `draft-graph-bridge.ts` carries this into `InputPortPolicy`.
3. **Lowering**: `lower-blocks.ts` passes the policy and the **Source Identity** (`{ blockId, portId }`) into the `IRBuilder`.
4. **Binding Pass (Intersection)**: `IRBuilderImpl.registerSlotType` unifies requirements. 
   - If a slot is shared by a `FrameTime` slider and a `CompileTime` wire, the slot **MUST** be `CompileTime`.
   - Intersection rule: `min(requirements)`.
5. **Artifact Generation**: `compile.ts` emits two critical data structures:
   - `MemoryManifestIR`: Symbolic requirements for Rust.
   - `fastPathOffsets`: A `Record<string, number>` mapping `'blockId:portId'` -> `UBO_float_offset`.

## 2. The UI Fast-Path (O(1) Decoupled)
The UI thread must be ultra-lean. 

1. **`PatchStore`**: Remains a pure data source. It emits a `ParamChanged` event and nothing else.
2. **`FastPathController` (NEW)**: A dedicated service that:
   - Listens to `PatchStore` events.
   - Performs a single O(1) lookup: `program.fastPathOffsets[key]`.
   - If a match exists, calls the WASM `update_control(offset, value)` bridge.
   - This eliminates all peeking into the `DebugIndex` or the `Program` from the Store.

## 3. The Rust MMU (Opaque Accessors)
The Rust Emitter should not perform string-based forensics on Symbolic IDs.

1. **MMU Resolver**: The `SymbolResolver` in `memory.rs` parses the manifest and decides the physical storage (`Arena` vs `GlobalControlUbo`).
2. **Opaque Accessors**: The MMU provides a method `get_wgsl_accessor(resource_id, lane, component) -> String`.
   - Example (Arena): `arena_in[offset + lane*stride + component]`
   - Example (UBO): `global_controls[index].x`
3. **Emitter**: The Emitter (`compute.rs`) simply calls this method. It has zero knowledge of "state:" or "arena:" strings.

## 4. Verification
- **Build**: No optional stubs. The interfaces must be strictly correct.
- **Performance**: Zero allocations and zero O(N) searches in the `updateControlValue` path.
- **Correctness**: A slider change must update the Rust UBO immediately without a recompile.
