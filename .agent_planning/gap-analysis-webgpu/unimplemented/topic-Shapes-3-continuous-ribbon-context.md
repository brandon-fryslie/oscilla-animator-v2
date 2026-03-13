# Context: Shapes 3 - Continuous Ribbon

## Target State
Type 3 (Continuous Ribbon) shapes require:
1. A Trail/Ribbon block that maintains ring-buffer history of positions
2. Per-instance ring buffer channels in the Arena (PosX, PosY, HeadIndex, ActiveCount)
3. Compute shader that advances ring buffer each frame
4. Virtual topology header in ShapeBank (no index payload)
5. Draw-prep that dynamically computes vertex count from ActiveCount
6. Vertex shader that reads ring buffer via modular arithmetic and extrudes ribbon
7. NaN/break detection for teleportation events
8. Miter-joint handling for sharp turns

## Current State
No ribbon/trail system exists. The only temporal state mechanism is through stateful blocks (UnitDelay, Lag, Accumulator) which operate on scalar/field values, not position histories. There is no ring buffer infrastructure in the Arena.

Relevant existing infrastructure:
- `src/runtime/RuntimeState.ts` has shape bank with header layout
- `src/compiler/ir/program.ts` has `drawMode: 'nonIndexed'` support
- `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs:215-219` has `draw_indirect` support
- `src/runtime/ContinuityState.ts` manages continuity for hot-swap (different from trail continuity)
- Debug viz in `src/ui/debug-viz/` has ring-buffer-like history for sparkline charts (different use case)

## Files Involved (would need to be created/modified)
- NEW: `src/blocks/shape/trail.ts` - Trail block definition
- NEW: `src/runtime/RingBufferArena.ts` - Ring buffer management
- MODIFY: `src/compiler/ir/program.ts` - Add ribbon-specific draw-prep metadata
- MODIFY: `src/runtime/DrawPrepSinkTablePacker.ts` - Dynamic vertex count from ActiveCount
- NEW: WGSL shader code for ribbon vertex shader
- MODIFY: `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` - Ring buffer compute phase
- MODIFY: `src/blocks/shape/index.ts` - Register trail block

## Suggested Approach
1. Implement ring buffer channel allocation in Arena (new allocation mode)
2. Add Trail block that declares ring buffer channels and writes new position each frame
3. Implement compute shader (or CPU-side) ring buffer advance
4. Add draw-prep dynamic vertex count calculation
5. Implement ribbon vertex shader with modular arithmetic ring buffer fetch
6. Add NaN/break detection
7. Test with single trail, then scale to many instances

## Risks
- Ring buffer memory model is fundamentally different from current SoA Arena
- Requires new compute shader pass or CPU-side ring buffer management
- Miter-joint handling is complex (bow-tie artifacts)
- Memory footprint scales with N * H which can be large (spec notes 20MB for 10k trails with H=256)
