# Context: P3-4 - Render Pass Critical Gaps

## Target State
Spec requires:
1. MSAA with sampleCount=4, MSAA texture creation, resolve target, pipeline variants matching sample count, and recreation on resize
2. Separate opaque and transparent render passes with different depth write policies

## Current State
1. No MSAA at all. `sample_count: 1` everywhere. The TS constant `renderMsaaSampleCount: 4` exists in shaders.ts but is not used by the Rust renderer.
2. Single render pass with depth write always ON. No transparency-aware depth policy.

Key files:
- `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs:13-221`
- `src/render/webgpu/shaders.ts:55`

## Files Involved
- `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs` (DepthTarget, RenderDispatcher)
- `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs` (would need MSAA texture)
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` (surface config, pipeline rebuild)

## Suggested Approach
### MSAA:
1. Create MSAA color texture with `sample_count: 4` in DepthTarget or a new MsaaTarget
2. Set `sample_count: 4` on depth texture
3. Use MSAA texture as color attachment, surface texture as resolve_target
4. Update pipeline to `multisample: MultisampleState { count: 4, .. }`
5. Recreate on resize (already handled for depth; extend to MSAA color)

### Transparent Pass:
1. Create a second render pipeline with `depth_write_enabled: false`
2. Split draw records into opaque and transparent groups (needs metadata from sink table)
3. Render opaque first (depth write ON), then transparent (depth write OFF)
4. May require sink table metadata to indicate opaque vs transparent records

## Risks
- MSAA increases VRAM usage (4x color buffer)
- Transparency sorting adds complexity; back-to-front ordering may be needed
- Transparent pass requires metadata in sink table records to classify draw mode
