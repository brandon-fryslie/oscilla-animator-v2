# Shapes 0: Shape Taxonomy Overview - TO-REVIEW Items

## Item 1: Indirect Command Output Split by ABI (Indexed vs Non-Indexed Stride)
**Spec says**: Indirect command output is split by ABI: indexed (20-byte stride) and non-indexed (16-byte stride). Render executes both streams in deterministic order.
**Implementation**: `src/compiler/ir/program.ts:382-392` defines `DrawPrepSinkIR` with `drawMode: 'indexed' | 'nonIndexed'` and `indirectStrideBytes: 20 | 16`. Rust renderer in `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:3-10` defines `INDIRECT_INDEXED_STRIDE_WORDS: usize = 5` (20 bytes) and `INDIRECT_NON_INDEXED_STRIDE_WORDS: usize = 4` (16 bytes). `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs:212,219` calls `draw_indexed_indirect` and `draw_indirect` respectively.
**Gap**: Functionally matches spec. Current implementation packs both streams into a single shared indirect buffer with region offsets. The spec describes "two separate command streams" conceptually; implementation uses one buffer with two regions. This is a valid implementation choice.
**Classification**: TO-REVIEW - Implementation uses one buffer with two regions vs conceptual two streams. Possibly better than spec suggests (simpler buffer management).

## Item 2: Premultiplied-Alpha Blending Policy
**Spec says**: "premultiplied-alpha blending policy" as shared contract across all classes.
**Implementation**: `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs:134` uses `wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING`. `src/render/webgpu/shaders.ts:190-192` fragment shader outputs `vec4<f32>(gradedRgb * gradedAlpha, gradedAlpha)` with comment citing LAW.
**Gap**: Fully implemented for the single pipeline. However, there is only one render pipeline currently. When multiple taxonomy classes are added, each will need to share this policy. No enforcement mechanism ensures future pipelines use the same blend state.
**Classification**: TO-REVIEW - Currently correct for one pipeline. May need a shared constant/assertion when multiple pipelines exist.

## Item 3: Explicit Depth Write/Test Policy per Pass
**Spec says**: "explicit depth write/test policy per pass" as part of shared camera/depth contract.
**Implementation**: `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs:143-149` configures depth: `Depth32Float`, `depth_write_enabled: true`, `depth_compare: LessEqual`. This is hardcoded in the single render pipeline.
**Gap**: Only one depth policy exists. When SDF shapes (Type 4) or Text (Type 5) are added, different depth policies may be needed (e.g., SDF writes custom frag_depth, text may disable depth writes). No per-class depth policy abstraction exists yet.
**Classification**: TO-REVIEW - Correct for Type 1/2. Will need extension for Type 4/5 per spec requirements.
