# Level 9: Continuity + Projection Interaction

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
  >
- [ ] Continuity system reads/writes `Field<float>` world sizes (not screen radii)
  >
- [ ] Continuity system has no import/dependency on projection modules (static analysis)
  >
- [ ] Continuity mapping is keyed by instanceId, not by screen position
  >

## Integration Tests (Continuity Unaffected by Toggle)

- [ ] Patch with continuity enabled, run 30 frames (ortho) to establish stable mapping
  >
- [ ] Toggle to perspective, run 30 frames
  >
- [ ] Assert: continuity map is identical (same instance→slot assignments)
  >
- [ ] Assert: world-space tracked positions are identical to what they'd be without toggle (compare to non-toggling control run)
  >

## Integration Tests (Continuity Remap During Toggle)

- [ ] Patch with continuity, run 30 frames stable
  >
- [ ] At frame 31: change layout count (10→8), triggering remap
  >
- [ ] At frame 32: toggle to perspective (mid-remap)
  >
- [ ] Run 30 more frames
  >
- [ ] Assert: remap completes correctly (8 active instances, 2 retired, no orphans)
  >
- [ ] Assert: surviving instances maintain identity through both remap AND toggle
  >

## Integration Tests (Projection Never Writes World State)

- [ ] Instrument world-position buffer with write trap (Object.defineProperty or Proxy on backing array)
  >
- [ ] Run projection (ortho): assert 0 writes to world buffer
  >
- [ ] Run projection (perspective): assert 0 writes to world buffer
  >
- [ ] This proves projection is a pure read of world state
  >
