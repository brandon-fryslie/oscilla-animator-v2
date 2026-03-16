Implementer Note

active_ticket: RECOVER-04 (lit-b90e7a20-c67c0fdf)
implemented_commit: 0b0ab40a
repo_base_for_next_run: 0b0ab40a
status: complete — ready for evaluator

summary:
Type 1 Rigid shapes now render via GPU vertex pulling from the topology
storage buffer. CPU mesh realization (realize_shape_bank_geometry) is deleted.
The uber shader reads control points directly from topologyBank and generates
triangle fan geometry from @builtin(vertex_index). No CPU vertex/index buffer
dependency remains for Type 1 Rigid.

changes:
- src/compiler/compile.ts: drawMode always 'nonIndexed' (was conditional indexed/nonIndexed)
- src/runtime/DrawPrepSinkTablePacker.ts: non-indexed path uses indexCount for closed fan count
- src/render/wasm/rust/oscilla-rust-renderer/src/default_shaders.rs: uber shader vertex pulling
- src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs: realize_shape_bank_geometry deleted,
  sync_shape_bank_plane uploads canonical words directly
- src/render/wasm/rust/oscilla-rust-renderer/src/render.rs: vertex buffer layout removed,
  set_vertex_buffer/set_index_buffer calls removed
- src/render/webgpu/RustWasmWebGPURenderer.ts: handleDirectGeometryRoute JSDoc updated

verification:
- TypeScript typecheck: clean
- Rust build: clean (warnings for dead code in memory.rs — vertex/index buffer helpers now unused)
- Test suite: 170 files, 1931 passed, 0 failed
- Visual evidence: breathing-ring.hcl burst montage (9 frames) renders correctly,
  golden-spiral.hcl burst montage (9 frames) renders correctly
- Screenshot paths:
  /tmp/oscilla-test-screenshots/breathing-ring_burst_3x3_100ms_20260315-191445.png
  /tmp/oscilla-test-screenshots/golden-spiral_burst_3x3_100ms_20260315-191527.png

acceptance_criteria_met:
- One shape class (Type 1 Rigid) renders visibly without worker CPU mesh realization: YES
- No CPU vertex/index buffer dependency: YES (vertex buffer layout removed from pipeline,
  set_vertex_buffer/set_index_buffer removed from render pass)
- Old CPU mesh realization path removed: YES (realize_shape_bank_geometry + RealizedShapeGeometry
  + shape word constants deleted, -148 lines in engine.rs)

notes_for_evaluator:
- memory.rs still contains write_geometry_payload, ensure_vertex_capacity, ensure_index_capacity
  as dead code (Rust compiler warnings). These can be cleaned up in a follow-up ticket or left
  for RECOVER-05/06 which may restructure memory management.
- The drawMode change affects ALL shapes (not just Type 1 Rigid). This is safe because only
  Type 1 Rigid shapes currently reach the WebGPU path. If future shape classes need indexed
  draws, the draw mode classification should be revisited.
- handleDirectGeometryRoute is intentionally a no-op — vertex pulling happens entirely in
  the shader. The callback provides route dispatch observability and serves as the integration
  point for future per-shape GPU resource management.
