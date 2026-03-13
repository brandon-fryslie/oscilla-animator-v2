# Context: Shapes 0 - Taxonomy Overview Critical Item

## Target State
Draw-prep should be a GPU compute kernel that:
1. Reads sink metadata (topology fields, instance counts) from GPU-visible buffers
2. Produces indirect draw command records autonomously
3. Does not require CPU to touch per-instance data each frame

## Current State
CPU in `src/runtime/DrawPrepSinkTablePacker.ts`:
1. Iterates all sinks and resolves instance counts (line 256-258)
2. Reads shape handles from Arena (line 277)
3. Reads shape bank headers for topology fields (line 279)
4. Writes draw command records to sink table (line 303-312)
5. Writes descriptor addresses to sink table (line 314-327)

GPU draw-prep compute shader (`src/render/webgpu/shaders.ts:254-284`) is a memcpy:
1. Reads params from uniform buffer
2. Copies values to indirect buffer
3. No Arena access, no sink table reads, no autonomous logic

## Files Involved
- `src/runtime/DrawPrepSinkTablePacker.ts` - CPU draw-prep (would be replaced/supplemented)
- `src/render/webgpu/shaders.ts:254-284` - GPU draw-prep shader (needs expansion)
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` - Engine tick (dispatches draw-prep)
- `src/compiler/ir/program.ts` - DrawPrepProgramIR (sink metadata)

## Suggested Approach
1. Upload sink metadata to GPU-visible buffer (already partially done via sink table)
2. Expand draw-prep compute shader to read sink table header + records
3. Have compute shader read instance counts from Arena (for dynamic counts)
4. Compute shader writes indirect args from sink table records + Arena reads
5. Keep CPU path as fallback/verification

## Risks
- Requires Arena data to be GPU-visible before draw-prep (ordering constraint)
- Dynamic instance counts require GPU-side resolution
- More complex compute shader with potential for GPU validation errors
