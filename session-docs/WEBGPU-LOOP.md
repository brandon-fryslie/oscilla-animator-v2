Implementer Note

active_ticket: RECOVER-05
implementation_commit: be0ebffe
repo_base_for_next_run: be0ebffe
status: ready-for-evaluation

summary:
RECOVER-05 implementation complete. CPU draw-prep packer reduced to static
metadata only. All evaluator cleanup items from RECOVER-04 addressed.

changes:
- DrawPrepSinkTablePacker: stripped all per-frame dynamic command derivation.
  Record fields (count, instanceCount, first, baseVertex, firstInstance,
  shapeWordOffset, materialId) are now zero. Signature changed from
  packDrawPrepSinkTableV1(program, state) to packDrawPrepSinkTableV1(program).
- Sink descriptor expanded from 20 to 25 words: ShapeSlotBaseOffset(20),
  ShapeSlotLaneStride(21), ShapeSlotComponentStride(22),
  InstanceCountMode(23), StaticInstanceCount(24) — metadata for RECOVER-06
  GPU draw-prep compute derivation.
- RuntimeState: removed dead cache fields (drawPrepSinkTableWords,
  drawPrepSinkTableWordCount, drawPrepSinkTableFrameId). Fixed stale comment
  referencing realize_shape_bank_geometry().
- memory.rs: deleted write_geometry_payload, create_vertex_buffer,
  create_index_buffer, ensure_vertex_capacity, ensure_index_capacity,
  vertex_buffer/index_buffer struct fields + capacity tracking (-85 lines).
- default_shaders.rs: WGSL SINK_TABLE_DESCRIPTOR_WORDS 20→25.
- runtime-hotpath-install.ts: updated callsite, removed state arg.
- Tests: 5 packer tests rewritten for static-only behavior, all passing.

evaluator_cleanup_addressed:
- memory.rs dead code: DONE (write_geometry_payload + vertex/index buffer infra)
- RuntimeState.ts stale comment: DONE (realize_shape_bank_geometry → GPU draw-prep)

verification:
- typecheck: clean (tsc --noEmit — no errors)
- tests: 170 files, 1935 passed, 0 failed
- rust build: succeeds (release profile, 3 dead-code warnings for still-used
  but test-unreachable functions)
- tree: clean after commit
