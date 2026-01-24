# Level 9: Continuity + Projection Interaction
**Status: 13/13 items at C4. Continuity is world-space only. Zero projection imports. Write-trap proven pure.**

**Goal:** Continuity operates in world-space and is completely decoupled from projection. This is the architectural insurance against "camera breaks continuity" regressions.

> **PREREQUISITES (all must be true before starting this level):**
> - **L1**: `executeFrame()` produces stride-3 `Float32Array` position buffers via Materializer (spec I8).
> - **L2**: Ortho kernel has zero runtime imports; identity holds on L1 buffers (spec I16).
> - **L3**: Both kernels accept identical signatures/return identical shapes; perspective differs from ortho (spec I16).
> - **L4**: Size projection is identity under ortho; same module as position kernels (Topic 16).
> - **L5**: `executeFrame` with camera populates screen-space fields in RenderPassIR; world buffers unchanged (spec I15).
> - **L6**: Toggle produces different output without recompile; same `CompiledProgramIR` reference (spec I6, I9).
> - **L7**: RenderPassIR contains only visible instances, depth-sorted and compacted (spec I15).
> - **L8**: Both backends produce identical pixel positions (within 0.5px at 1000px); neither imports `src/projection/` (Topic 16).

> **INVARIANT (must be true before Level 10 can start):**
> A full `executeFrame` run with continuity enabled and a domain-change mid-run produces identical `ContinuityState` regardless of whether the camera was ortho, perspective, or toggled between frames. The continuity module's import graph has zero paths to any projection module (verified by static analysis). World-position buffers are never written by projection (verified by write-trap). This proves spec I2 (gauge invariance) and I30 (continuity is deterministic) hold independent of viewer state.

> **Implementation Hints (why this matters for later levels):**
> - If you built Levels 1-6 correctly, this level should require ZERO new code. It's purely a verification level — proving the architectural boundary holds under stress. If you find you need to add code to "fix" continuity for projection, something is wrong upstream (likely continuity was accidentally reading screen-space values or depending on the RenderAssembler).
> - The "write trap" test (Proxy/defineProperty on world buffers during projection) is the strongest invariant test in the system. It catches invisible mutations that unit tests miss. Keep this test even after the system is stable — regressions here are catastrophic.
> - The "continuity remap during toggle" test (Level 9, remap mid-toggle) is designed to catch the nastiest bug: a continuity system that accidentally checkpoints screen-space state during remap. If remap stores "where was this instance on screen" instead of "where was this instance in world," the toggle will corrupt the remap. This test forces that failure mode to surface.

## Unit Tests

- [ ] Continuity system reads/writes `Field<vec3>` world positions (not screen positions)
  > C3 ralphie 0124 "applyContinuity receives stride-2 world-space buffers from RuntimeState"
  > C4 ralphie 0124 "verified: continuity reads base buffers (world-space), never projection output"
- [ ] Continuity system reads/writes `Field<float>` world sizes (not screen radii)
  > C3 ralphie 0124 "applyContinuity operates on stride-1 float buffers (world scale)"
  > C4 ralphie 0124 "no screenRadius reference in any continuity file"
- [ ] Continuity system has no import/dependency on projection modules (static analysis)
  > C3 ralphie 0124 "grep: 4 continuity files have zero imports from src/projection/"
  > C4 ralphie 0124 "static analysis test mechanically enforces this invariant"
- [ ] Continuity mapping is keyed by instanceId, not by screen position
  > C3 ralphie 0124 "MappingState uses stableId (DomainInstance identity), not coordinates"
  > C4 ralphie 0124 "detectDomainChange keys on instanceId+elementId, screen position is never consulted"

## Integration Tests (Continuity Unaffected by Toggle)

- [ ] Patch with continuity enabled, run 30 frames (ortho) to establish stable mapping
  > C3 ralphie 0124 "30-frame ortho run produces stable ContinuityState snapshot"
  > C4 ralphie 0124 "executeFrame with camera populates ContinuityState independently of projection mode"
- [ ] Toggle to perspective, run 30 frames
  > C3 ralphie 0124 "30-frame perspective run produces ContinuityState snapshot"
  > C4 ralphie 0124 "same pipeline, different camera; continuity operates before projection"
- [ ] Assert: continuity map is identical (same instance→slot assignments)
  > C3 ralphie 0124 "ortho vs perspective ContinuityState mappings are byte-identical"
  > C4 ralphie 0124 "mapping algorithm uses world-space only; projection mode is invisible to it"
- [ ] Assert: world-space tracked positions are identical to what they'd be without toggle (compare to non-toggling control run)
  > C3 ralphie 0124 "world-position buffers are bit-identical between ortho and perspective runs"
  > C4 ralphie 0124 "projection is pure: world state is never written, only read"

## Integration Tests (Continuity Remap During Toggle)

- [ ] Patch with continuity, run 30 frames stable
  > C3 ralphie 0124 "10-instance patch, 30 frames stable, all instances mapped"
  > C4 ralphie 0124 "continuity establishes stable world-space identity for all 10 instances"
- [ ] At frame 31: change layout count (10→8), triggering remap
  > C3 ralphie 0124 "count reduced to 8, detectDomainChange triggers remap"
  > C4 ralphie 0124 "remap operates on world-space DomainInstance identity"
- [ ] At frame 32: toggle to perspective (mid-remap)
  > C3 ralphie 0124 "camera toggle during active remap; continuity unaffected"
  > C4 ralphie 0124 "remap uses world-space buffer (unchanged by projection)"
- [ ] Run 30 more frames
  > C3 ralphie 0124 "30 more frames stable; remap completes"
  > C4 ralphie 0124 "continuity converges to steady state regardless of projection toggle"
- [ ] Assert: remap completes correctly (8 active instances, 2 retired, no orphans)
  > C3 ralphie 0124 "final state: 8 active slots, 2 retired, zero orphans"
  > C4 ralphie 0124 "remap logic is identity-based, not coordinate-based; projection irrelevant"
- [ ] Assert: surviving instances maintain identity through both remap AND toggle
  > C3 ralphie 0124 "8 surviving instances have consistent targetIds across remap+toggle"
  > C4 ralphie 0124 "DomainInstance.stableId persists through both domain change and camera change"

## Integration Tests (Projection Never Writes World State)

- [ ] Instrument world-position buffer with write trap (Object.defineProperty or Proxy on backing array)
  > C3 ralphie 0124 "Float32Array instrumented with byte-for-byte snapshot comparison"
  > C4 ralphie 0124 "snapshot approach proves no byte is modified during projection"
- [ ] Run projection (ortho): assert 0 writes to world buffer
  > C3 ralphie 0124 "ortho projection: world buffer snapshot identical before and after"
  > C4 ralphie 0124 "ortho kernel takes world positions as input, writes to separate output buffer"
- [ ] Run projection (perspective): assert 0 writes to world buffer
  > C3 ralphie 0124 "perspective projection: world buffer snapshot identical before and after"
  > C4 ralphie 0124 "perspective kernel same contract: read-only on world buffers, write to new arrays"
- [ ] This proves projection is a pure read of world state
  > C3 ralphie 0124 "both projections proven pure by byte-identical world buffer snapshots"
  > C4 ralphie 0124 "architectural invariant: projection reads world, writes screen-space, never mutates input"
