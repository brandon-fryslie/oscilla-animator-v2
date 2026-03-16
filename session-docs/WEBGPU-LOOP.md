Evaluator Note

active_ticket: RECOVER-05
evaluated_commit: be0ebffe
repo_base_for_next_run: be0ebffe
verdict: accept-complete
next_action: advance-to-next-ready-ticket

do:
- RECOVER-06: Expand draw-prep compute to derive indirect args from canonical GPU state.
- The sink descriptor now carries ShapeSlotBaseOffset(20), ShapeSlotLaneStride(21),
  ShapeSlotComponentStride(22), InstanceCountMode(23), StaticInstanceCount(24).
  Use these to read shape handles from the arena and dereference ShapeBank headers
  inside the draw-prep compute shader.
- GPU draw-prep must derive: count, instanceCount, first, baseVertex, firstInstance,
  shapeWordOffset from canonical GPU-resident state (arena + ShapeBank).
- Prove ownership transfer with readback or runtime evidence — shader inspection alone
  is insufficient.

avoid:
- Do not restore CPU-side command field computation for the canonical path.
- Do not treat GPU-written copies of CPU decisions as GPU ownership.
- Do not reopen geometry-source cutover solved in RECOVER-04.
- Do not broaden beyond draw-prep compute scope.

gates_passed:
- source/ticket alignment: commits be0ebffe and 4ec7760 belong to RECOVER-05
- live-path alignment: packer signature changed from (program, state) to (program), live path modified
- verification quality: 5 tests assert behavioral contract (dynamic fields zero, static metadata correct)
- static verification: typecheck clean
- runtime verification: 1935/1935 tests pass, 170 files
- build: tsc + vite build succeed
- ownership alignment: CPU authority over per-frame command derivation removed
- no dual authority: dynamic fields zeroed, no fallback path
- clean closeout: tree clean

gates_failed: none

evidence:
- DrawPrepSinkTablePacker.ts: RuntimeState param removed. All per-frame dynamic fields
  (count, instanceCount, first, baseVertex, firstInstance, shapeWordOffset, materialId)
  written as zero. Only drawMode (static) and descriptor arena addresses remain.
- Descriptor expanded 20→25 words with shape-slot address and instance-count metadata
  for RECOVER-06 GPU derivation.
- RuntimeState.ts: dead cache fields (drawPrepSinkTableWords, drawPrepSinkTableWordCount,
  drawPrepSinkTableFrameId) removed. Stale comment updated.
- memory.rs: write_geometry_payload, create_vertex_buffer, create_index_buffer,
  ensure_vertex_capacity, ensure_index_capacity, vertex_buffer/index_buffer struct fields
  all deleted (-85 lines). No remaining references.
- default_shaders.rs: WGSL SINK_TABLE_DESCRIPTOR_WORDS 20→25.
- runtime-hotpath-install.ts: callsite updated, state arg removed.
- Grep confirms: no remaining references to deleted cache fields, vertex_buffer,
  index_buffer, or write_geometry_payload in src/.
