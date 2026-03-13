# P1-2: Unified GPU Shape Bank Strategy - UNIMPLEMENTED Items

## Item 1: Static Asset "Immutable Zone" Allocator
**Spec says**: Section 4.1: "Primitives (Square, Circle, Triangle) and imported assets (SVGs, Fonts) are uploaded once at startup or load time. Allocator: Stack-based (append only). Defragmentation: None required."
**Implementation**: `WebGPUShapeBankManager.ts:50-55` has `sync()` that uploads the ENTIRE shape bank data on every call. `RenderShapeBankSource` has a `staticBoundary` field (line 13) which is validated (line 101-108) but never used to optimize uploads. The full `data.subarray(0, volatilePtr)` is uploaded every sync.
**Gap**: There is no distinction between static (immutable) and dynamic (procedural) regions in GPU upload behavior. The `staticBoundary` field is validated but not used to skip re-uploading static content. This means primitives are redundantly re-uploaded every frame.
**Classification**: UNIMPLEMENTED

## Item 2: Dynamic Topology Region with Dirty-Slice Updates
**Spec says**: Section 4.2: "A bounded dynamic region at the end of the payload heap. Update only dirty slices (queue.writeBuffer) when topology actually changes."
**Implementation**: The Rust engine at `engine.rs:1087-1111` (`sync_shape_bank_plane()`) copies the ENTIRE shape bank from shared memory and uploads ALL words every time it syncs. There is no dirty tracking or partial update.
**Gap**: Every shape bank sync uploads all words. No dirty-region tracking exists. For large shape banks, this wastes bandwidth.
**Classification**: UNIMPLEMENTED

## Item 3: Default Topology Pre-loading at Fixed IDs
**Spec says**: Section 4.3: "The Bank comes pre-loaded with standard primitives at fixed IDs. ID 1 (Line Strip): Virtual topology. ID 2 (Quad): 0, 1, 2, 2, 1, 3."
**Implementation**: Shape bank IDs are assigned dynamically by `allocShapeBankWords()` in `RuntimeState.ts`. Shapes are materialized per-block by `ValueExprMaterializer.ts:172-173`. There are no reserved "well-known" IDs for line strip or quad primitives. Each render sink gets its topology materialized fresh.
**Gap**: No pre-loaded default topologies exist. Every shape, even basic quads, must be materialized through the normal compilation path. This means primitives are not reusable across different sinks by ID reference.
**Classification**: UNIMPLEMENTED

## Item 4: ShapeAllocator CPU-Side Service
**Spec says**: Section 7, Requirement 2: "Implement ShapeAllocator: A CPU-side service to manage immutable and dynamic payload regions."
**Implementation**: Shape allocation is handled inline in `RuntimeState.ts` via `allocShapeBankWords()` which is a simple bump allocator. There is no dedicated `ShapeAllocator` service class with immutable/dynamic region management.
**Gap**: The bump allocator exists but lacks the service abstraction and immutable/dynamic region separation that the spec requires.
**Classification**: UNIMPLEMENTED

## Item 5: CompiledProgramIR ShapeTable Metadata
**Spec says**: Section 7, Requirement 3: "Update CompiledProgramIR: Add a ShapeTable plus draw-mode metadata."
**Implementation**: `program.ts:363-434` has `DrawPrepSinkIR` and `DrawPrepProgramIR` which include draw-mode metadata (`indexed`/`nonIndexed`), topology source references, and indirect region plans. However, there is no explicit `ShapeTable` type in the compiler IR. Shape metadata is embedded in sink records, not in a standalone table.
**Gap**: Draw-mode metadata IS in the IR. A standalone ShapeTable type is NOT present -- shape info is distributed across sink records.
**Classification**: UNIMPLEMENTED (partially covered by DrawPrepSinkIR)

## Item 6: Shader-Side ShapeHeaderV1 Decode Helpers
**Spec says**: Section 5 and Section 7, Requirement 4: "Inject canonical ShapeHeaderV1 decode helpers into vertex/fragment stages."
**Implementation**: The uber shader in `engine.rs:350-403` reads `topologyBank[topologyWordOffset + 3u]` directly (hardcoded word offset for flags). There is no structured `ShapeHeaderV1` struct or `get_header()` function in the runtime WGSL. The spec shows a `struct ShapeHeaderV1 { ... }` and a `fn get_header(shape_id: u32) -> ShapeHeaderV1` helper, but neither exists.
**Gap**: The shader accesses topology data by raw word indexing rather than through typed header helpers. This is fragile and hard to maintain.
**Classification**: UNIMPLEMENTED

## Item 7: Text Rendering Shape Bank Integration
**Spec says**: Section 6: "Text rendering uses a hybrid ownership model" with CPU shaping, GPU MSDF atlas sampling, shared text quad topology in ShapeBank.
**Implementation**: No text rendering support found in the WebGPU renderer. No MSDF atlas, no text proxy topology, no glyph instance support.
**Gap**: Text rendering is not implemented. This is expected for current project stage.
**Classification**: UNIMPLEMENTED
