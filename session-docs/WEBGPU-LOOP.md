Evaluator Note

active_ticket: RECOVER-06
evaluated_commit: 811f2eeb8
repo_base_for_next_run: 811f2eeb8
verdict: accept-complete
next_action: advance-to-next-ready-ticket

do:
- RECOVER-07: Move dynamic shape materialization to a GPU-visible stage.
- Split static topology/template data from live dynamic payload.
- Remove CPU install-time authorship of frame-volatile render payload for the canonical path.
- Establish one explicit GPU-visible owner for live dynamic payload generation.
- Read ticket source docs: 02-Dynamic-Shape-Materialization.md, P0-3 handle-based arch, P1-2 shape bank.
- Note: engine.rs `total_instance_count` reads zeroed record fields (pre-existing since RECOVER-05).
  Assembly dispatch is capped at 1 workgroup (64 threads). Works for current demos but will
  silently drop instances for >64 total. Fix this in RECOVER-07 or a separate bug ticket by
  computing total instance count from descriptors instead of zeroed records.

avoid:
- Do not leave CPU materialization in place and merely rename it.
- Do not broaden into full install-time runtime execution removal (that is RECOVER-08).
- Do not reopen shape-class taxonomy questions already settled in RECOVER-01/02.
- Do not reopen draw-prep ownership (solved in RECOVER-05/06).

gates_passed:
- source/ticket alignment: commit 811f2eeb8 belongs to RECOVER-06
- design alignment: draw-prep compute reads topologyBank and descriptors, derives all indirect fields
- live-path alignment: draw-prep WGSL binding(1) wired to topology_buffer; assembly shader updated
- verification quality: 5 packer tests verify arena-resolved ShapeWordOffset and descriptor layout
- static verification: typecheck clean
- runtime verification: 1935/1935 tests pass, 170 files
- build: tsc + vite build succeed
- ownership alignment: GPU derives count/first/baseVertex from topologyBank, instanceCount from
  descriptor, firstInstance from GPU prefix sum. CPU record fields are all zero.
- no dual authority: no remaining CPU-side indirect arg computation
- clean closeout: tree clean

gates_failed: none

evidence:
- compute.rs: draw-prep WGSL reads `topologyBank` (binding 1) via `readTopology()`. Indexed draws
  derive count/first/baseVertex from ShapeHeaderV1 words 4/5/6. Non-indexed derives count/first
  from words 7/8. instanceCount from descriptor word 24 (StaticInstanceCount). firstInstance from
  GPU-side prefix sum over all earlier descriptors' instance counts.
- default_shaders.rs: Assembly shader reads instanceCount/firstInstance from descriptors via
  running prefix sum (was: zeroed record fields). shape_word_offset from descriptor word 25
  (was: record field). SINK_TABLE_DESCRIPTOR_WORDS 25→26.
- DrawPrepSinkTable.ts: ShapeWordOffset = 25 added. DRAW_PREP_SINK_DESCRIPTOR_WORDS 25→26.
- DrawPrepSinkTablePacker.ts: arena param added. shapeWordOffset resolved from
  arena[shapeSlotAddress.baseOffset] at pack time (install-time static address).
- memory.rs: SINK_TABLE_DESCRIPTOR_WORDS 25→26. draw_prep_bind_group binds topology_buffer
  at binding 1.
- runtime-hotpath-install.ts: packDrawPrepSinkTableV1 now receives state.arena after
  materialization.
- Tests: 5 packer tests updated — verify arena-resolved ShapeWordOffset in descriptors,
  assert correct descriptor word count (26).
