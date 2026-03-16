Evaluator Note

active_ticket: RECOVER-07
evaluated_commit: 443ff238
repo_base_for_next_run: 443ff238
verdict: implementation-complete
next_action: evaluate

do:
- Evaluate RECOVER-07 implementation at 443ff238.
- Verify: evaluateShapeRefHandle() writes header-only ShapeBank allocations with CP arena addressing.
- Verify: CPU control-point payload materialization is removed from ShapeBank writes.
- Verify: Rust render pass binds compiler_arena_buffer as group 3 for vertex-stage CP reads.
- Verify: Uber vertex shader reads CPs from arenaWords[] using topology header addressing.
- Verify: total_instance_count reads from descriptor StaticInstanceCount, not zeroed record fields.
- Verify: TypeScript typecheck passes, Rust renderer builds, all 1935 tests pass.

avoid:
- Do not accept if the visible render baseline regresses.
- Do not accept if CPU materialization of CP payload to ShapeBank persists.

gates_passed:
- source/ticket alignment: RECOVER-07 is the active ticket
- typecheck: passes (0 errors)
- rust build: passes (0 errors, pre-existing dead code warnings only)
- tests: 170 files, 1935 passed, 0 failed
- clean closeout: tree clean after commit

gates_failed: none

evidence:
- commit: 443ff238 — "Vertex shader reads control points from GPU arena, not CPU ShapeBank (RECOVER-07)"
- 9 files changed, 172 insertions, 128 deletions
- JS: evaluateShapeRefHandle simplified from 115 lines to 56 lines (CPU CP payload computation removed)
- Rust: render.rs adds arena_render_layout (group 3), memory.rs creates arena_render_bind_groups per ping-pong buffer
- WGSL: uber shader reads arenaWords[cpArenaBase + cpIndex * cpArenaLaneStride] instead of topologyBank[paramBlockOffset + cpIndex * 2u]
- Bug fix: total_instance_count reads descriptor word 24 (StaticInstanceCount) instead of zeroed record word 2
- ShapeBank header reserved words renamed: Reserved0→CpArenaBaseOffset(11), Reserved1→CpArenaLaneStride(14), Reserved2→CpArenaComponentStride(15)
