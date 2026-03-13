# P3-1: CPU to GPU Input Marshalling - TRIVIAL Items

## Item 1: Input Header Schema Layout Differences
**Spec says**: Fixed 256-byte header block at Arena offset 0x00 with DataView serialization using specific byte offsets (0x00=Time, 0x04=DeltaTime, 0x08=FrameCount, 0x0C=Resolution.X, etc.)
**Implementation**: Uses SharedArrayBuffer with Float32Array word-indexed layout defined in `runtime-input-layout.ts`. Words are indexed by name (width=0, height=1, zoom=2, panX=3, panY=4, timeMs=5, mouseX=6, etc.) rather than spec byte offsets. Total buffer is `(4 + 32) * 4 = 144 bytes`, not 256.
**Gap**: Layout is logically equivalent but uses a different encoding convention (word-indexed Float32Array vs byte-offset DataView). Additional fields (zoom, panX, panY, sinkTableWords, shapeBankWords, installRevision) exist in implementation but not spec. Buffer size is 144 bytes not 256.
**Classification**: TRIVIAL

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/rust/runtime-input-layout.ts:1-31`
- `/Users/bmf/code/oscilla-animator-v2/src/render/webgpu/RustWasmWebGPURenderer.ts:991-1024`

## Item 2: Mouse Coordinate Normalization Convention
**Spec says**: Mouse values normalized to NDC [-1, 1] with aspect ratio correction and Y flip. Serialized at byte offsets 0x14/0x18.
**Implementation**: Mouse values are passed as raw float values from ExternalChannel snapshot (mouse.x, mouse.y) at word indices 6/7. The Rust engine reads them as-is and does not apply NDC conversion in the input marshal phase; the shader or upstream handles normalization.
**Gap**: Mouse normalization happens upstream (ExternalChannel) rather than in the marshalling step. Functionally equivalent since the pipeline delivers correct values to the GPU.
**Classification**: TRIVIAL

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/services/AnimationLoop.ts:88-112`
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:1193-1298`

## Item 3: FrameCount Field Absent from Input Header
**Spec says**: Offset 0x08 contains FrameCount (integer frame index cast to float).
**Implementation**: No frameCount word in the shared input layout. The Rust engine tracks frame_count internally (`engine.rs:426`) but does not serialize it into the shared input plane.
**Gap**: Cosmetic difference. Frame count is tracked engine-side and reported via telemetry. Shaders that need it would read from uniforms.
**Classification**: TRIVIAL

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/rust/runtime-input-layout.ts:8-25` (no frameCount entry)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:426,959`
