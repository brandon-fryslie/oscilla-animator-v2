# Context: P1-2 - ShapeAllocator Service and Static/Dynamic Regions

## Target State
A dedicated CPU-side `ShapeAllocator` service manages the shape bank with:
1. An immutable region (static assets: primitives, SVGs, fonts) loaded once at startup.
2. A dynamic region at the end for procedural topology with dirty-slice tracking.
3. Pre-loaded default topologies at fixed IDs (line strip @1, quad @2).
4. Upload optimizations: skip re-uploading the immutable zone; only upload dirty dynamic slices.

## Current State
- `RuntimeState.ts:23`: `SHAPE_BANK_HEADER_WORDS = 16`
- `ValueExprMaterializer.ts:172`: `allocShapeBankWords(shapeBank, ...)` -- simple bump allocator, no region awareness
- `WebGPUShapeBankManager.ts:50-55`: `sync()` uploads the ENTIRE shape bank data every call
- `WebGPUShapeBankManager.ts:13`: `RenderShapeBankSource` has `staticBoundary` field but it is validated and ignored during upload
- `engine.rs:1087-1111`: Rust engine copies entire shape bank from shared memory on every install revision change
- No pre-loaded default topologies exist; every shape is materialized per-block

## Files Involved
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/RuntimeState.ts` (shape bank data, allocator)
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/ValueExprMaterializer.ts` (shape materialization)
- `/Users/bmf/code/oscilla-animator-v2/src/render/webgpu/WebGPUShapeBankManager.ts` (GPU upload, staticBoundary field)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` (sync_shape_bank_plane)

## Suggested Approach
1. Create a `ShapeAllocator` class that tracks immutable and dynamic regions.
2. Pre-populate fixed IDs (0=null, 1=line strip, 2=quad) at allocator construction.
3. Use `staticBoundary` (already in RenderShapeBankSource) to split upload: only upload words 0..staticBoundary on first sync, then only staticBoundary..volatilePtr on subsequent syncs.
4. Add dirty tracking: when dynamic shapes change, record which word ranges need re-upload.
5. In Rust engine, track last-uploaded shape bank revision and only upload changed slices.

## Risks
- Pre-loaded default topologies may conflict with dynamically assigned IDs if the allocator is not careful about reserving the first N handles.
- Dirty tracking adds complexity to an already working path.
- For current usage (small shape banks, < 100 shapes), the performance benefit is negligible.
