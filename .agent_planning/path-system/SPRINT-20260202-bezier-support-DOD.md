# Definition of Done: bezier-support
Generated: 2026-02-02
Status: PARTIALLY READY
Plan: SPRINT-20260202-bezier-support-PLAN.md

## Acceptance Criteria

### Precomputed Dispatch Data (WI-1)
- [ ] PathTopologyDef includes segmentKind[], segmentPointBase[], hasQuad, hasCubic
- [ ] Fields computed automatically during topology registration
- [ ] Existing polygon topologies have hasQuad=false, hasCubic=false
- [ ] Unit tests for polygon, cubic, quad, and mixed topologies

### Bezier Tangent (WI-2)
- [ ] Correct tangent at cubic bezier endpoints (B'(0) = 3(P1-P0), B'(1) = 3(P3-P2))
- [ ] Correct tangent at quad bezier endpoints (B'(0) = 2(P1-P0), B'(1) = 2(P2-P1))
- [ ] Mixed path tangents correct at all on-curve points
- [ ] Output is vec3 (z=0)
- [ ] Off-curve control point tangent strategy documented and tested

### Bezier Arc Length (WI-3)
- [ ] Line segment arc length unchanged
- [ ] Cubic bezier arc length within 0.1% of known values
- [ ] Quad bezier arc length within 0.1% of known values
- [ ] Monotonically increasing cumulative values
- [ ] Performance: 100-segment path under 1ms

### Materializer Dispatch (WI-4)
- [ ] TopologyDef looked up from registry
- [ ] Polygon fast-path preserved (no regression)
- [ ] Bezier paths dispatch to per-segment functions
- [ ] No heap allocation in dispatch path

### ProceduralBezier + Open Paths (WI-5)
- [ ] At least one block produces CUBIC or QUAD verbs
- [ ] Open path forward/backward difference at endpoints
- [ ] Closed path wrapping preserved
- [ ] Integration test through compile -> materialize

## Exit Criteria (for MEDIUM items to reach HIGH)
- [ ] Bezier tangent algorithm validated against 3+ known curves (circle arc, S-curve, loop)
- [ ] Arc length numerical method chosen and error bounds documented
- [ ] Off-curve control point tangent/arcLength strategy decided
- [ ] ProceduralBezier block interface approved by user
