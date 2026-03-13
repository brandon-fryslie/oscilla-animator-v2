# P3-4: WebGPU Render Pass - CRITICAL Items

## Item 1: MSAA Not Implemented
**Spec says**: Use MSAA render target (`sampleCount=4`) when enabled. Recreate MSAA resources on canvas resize. Pipeline variants must match sample count.
**Implementation**: Depth target uses `sample_count: 1` (`render.rs:24`). Render pipeline uses `multisample: wgpu::MultisampleState::default()` which defaults to `count: 1` (`render.rs:150`). No MSAA texture, no resolve target, no MSAA resource recreation on resize. `WEBGPU_RENDER_CONTRACT.renderMsaaSampleCount` is defined as 4 in `shaders.ts:55` but never consumed by the Rust renderer.
**Gap**: MSAA is completely absent from the Rust renderer. The spec requires sampleCount=4. The TS-side constant exists but is unused. Without MSAA, edges will exhibit aliasing artifacts, especially visible on high-DPI displays.
**Classification**: CRITICAL

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/render.rs:24,150`
- `/Users/bmf/code/oscilla-animator-v2/src/render/webgpu/shaders.ts:55` (unused constant)

## Item 2: No Transparent Pass (Depth Write OFF for Transparency)
**Spec says**: Transparent pass (including text/MSDF by default): depth test ON, depth write OFF. Opaque and transparent passes are separate with different depth policies.
**Implementation**: Only one render pass exists with `depth_write_enabled: true` (`render.rs:145`). There is no second pass for transparent geometry with depth write disabled. All geometry (opaque and transparent) goes through the same pipeline with depth writes on.
**Gap**: Transparent geometry rendered with depth writes on will cause z-fighting and order-dependent artifacts. Later transparent objects will occlude earlier ones even when they should composite. The spec explicitly requires a separate transparent pass.
**Classification**: CRITICAL

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/render.rs:115-153,162-221`
