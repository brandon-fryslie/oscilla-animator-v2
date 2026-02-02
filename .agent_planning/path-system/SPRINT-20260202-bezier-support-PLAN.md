# Sprint: bezier-support - Bezier Curve Support
Generated: 2026-02-02
Confidence: HIGH: 2, MEDIUM: 3, LOW: 0
Status: PARTIALLY READY
Source: EVALUATION-20260202.md
Bead: oscilla-animator-v2-7qen (Phase 2: Bezier Curve Support)

## Sprint Goal
Implement bezier-aware tangent and arc length computation for paths containing CUBIC and QUAD segments, with topology-driven dispatch in the materializer.

## Scope
**Deliverables:**
- Precomputed topology dispatch data on PathTopologyDef (segmentKind[], segmentPointBase[], hasQuad, hasCubic)
- Bezier tangent computation (derivative of cubic/quad bezier at endpoints)
- Bezier arc length computation (numerical integration or adaptive subdivision)
- Materializer dispatch: polygon fast-path vs per-segment bezier
- ProceduralBezier block (or equivalent) for testing bezier paths
- Open/closed path support in tangent and arc length

## Work Items

### P1 WI-1: Add precomputed dispatch data to PathTopologyDef [HIGH]

**Dependencies**: Sprint phase1-fix complete
**Spec Reference**: shapes/types.ts PathTopologyDef | **Status Reference**: EVALUATION-20260202.md "Topology Information Flow"

#### Description
Add precomputed arrays and flags to `PathTopologyDef` that enable efficient dispatch in the materializer without per-frame verb parsing:
- `segmentKind: readonly ('line' | 'cubic' | 'quad')[]` -- one entry per segment (MOVE/CLOSE don't count as segments)
- `segmentPointBase: readonly number[]` -- cumulative point index for each segment start
- `hasQuad: boolean` -- true if any QUAD verb present
- `hasCubic: boolean` -- true if any CUBIC verb present

These are derived from `verbs[]` and `pointsPerVerb[]` at topology registration time (compile-time constant). The materializer checks `hasCubic || hasQuad` to choose the per-segment dispatch path vs the polygon fast-path.

#### Acceptance Criteria
- [ ] `PathTopologyDef` includes `segmentKind`, `segmentPointBase`, `hasQuad`, `hasCubic` fields
- [ ] Fields are computed automatically from `verbs[]` during topology creation/registration
- [ ] Existing polygon topologies have `hasQuad: false, hasCubic: false`
- [ ] All segments in a polygon topology have `segmentKind: 'line'`
- [ ] Unit tests verify correct dispatch data for polygon, cubic, quad, and mixed topologies

#### Technical Notes
- Add computation in `createPolygonTopology()` and equivalent star topology creator, or better: compute in `registerDynamicTopology()` itself so ALL path topologies get dispatch data automatically.
- `segmentPointBase[i]` is the index into the control point array where segment i's points begin. For polygons this is trivial (1:1). For bezier, CUBIC consumes 3 points per segment, QUAD consumes 2.

---

### P1 WI-2: Implement bezier tangent computation [MEDIUM]

**Dependencies**: WI-1
**Spec Reference**: N/A (mathematical) | **Status Reference**: EVALUATION-20260202.md "Tangent assumes ALL control points are simple vertices"

#### Description
Implement tangent computation for paths with bezier segments. For each segment type:
- **LINE**: Same as current -- central difference between adjacent on-curve points
- **CUBIC**: Tangent at start = 3(P1 - P0), tangent at end = 3(P3 - P2), where P0-P3 are the cubic control points
- **QUAD**: Tangent at start = 2(P1 - P0), tangent at end = 2(P2 - P1), where P0-P2 are the quad control points

For intermediate points (control points that are not on-curve endpoints), tangent may be undefined or zero. The output should be per-control-point (same cardinality as input), but only on-curve points get meaningful tangents.

#### Acceptance Criteria
- [ ] Bezier tangent function produces correct tangents at cubic bezier endpoints
- [ ] Bezier tangent function produces correct tangents at quad bezier endpoints
- [ ] Mixed paths (line + cubic + quad segments) produce correct tangents at all on-curve points
- [ ] Output is vec3 (z=0) matching existing convention
- [ ] Unit tests with known bezier curves verify tangent direction and magnitude

#### Unknowns to Resolve
1. **Tangent at off-curve control points**: Should off-curve control points (the middle points of cubic/quad) get tangent = (0,0,0), or should they get the tangent of the bezier at the parametric position corresponding to that control point? Research: The natural choice is tangent at t=0 for start, t=1 for end, and for off-curve points either zero or interpolated. Consult SVG/Canvas path conventions.
2. **Tangent continuity at segment junctions**: When a cubic segment meets a line segment, the tangent at the junction point should be the average of incoming and outgoing tangent, or just the outgoing. Research: Standard practice in path rendering.

#### Exit Criteria (to reach HIGH confidence)
- [ ] Algorithm for tangent at all 3 segment types is validated against known curves
- [ ] Decision made for off-curve control point tangent values
- [ ] Junction tangent strategy decided and implemented

#### Technical Notes
- Cubic bezier: B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
- B'(t) = 3(1-t)^2*(P1-P0) + 6(1-t)*t*(P2-P1) + 3t^2*(P3-P2)
- At t=0: B'(0) = 3(P1-P0). At t=1: B'(1) = 3(P3-P2).
- Quad bezier: B(t) = (1-t)^2*P0 + 2(1-t)*t*P1 + t^2*P2
- B'(t) = 2(1-t)*(P1-P0) + 2t*(P2-P1)
- At t=0: B'(0) = 2(P1-P0). At t=1: B'(1) = 2(P2-P1).

---

### P1 WI-3: Implement bezier arc length computation [MEDIUM]

**Dependencies**: WI-1
**Spec Reference**: N/A (mathematical) | **Status Reference**: EVALUATION-20260202.md "Arc length computed as cumulative Euclidean distance"

#### Description
Implement arc length computation for bezier segments. Bezier curves do not have closed-form arc length solutions, so numerical methods are needed:
- **LINE**: Euclidean distance (existing behavior)
- **CUBIC**: Gaussian quadrature or adaptive subdivision
- **QUAD**: Gaussian quadrature (5-point is typically sufficient)

The output is cumulative arc length per control point (same as current), but segment lengths are computed using the appropriate method per segment type.

#### Acceptance Criteria
- [ ] Arc length for line segments matches existing Euclidean distance
- [ ] Arc length for cubic bezier segments is within 0.1% of analytical estimates for known curves
- [ ] Arc length for quad bezier segments is within 0.1% of analytical estimates
- [ ] Cumulative arc length is monotonically increasing
- [ ] Performance: arc length computation for 100-segment bezier path completes in under 1ms

#### Unknowns to Resolve
1. **Numerical method**: Gaussian quadrature vs adaptive subdivision vs lookup table. Research: Gaussian quadrature (5-point) is standard for bezier arc length. Adaptive subdivision is more robust for degenerate curves. Profile both.
2. **Arc length attribution to control points**: For a cubic segment with 3 control points (control1, control2, end), which points get which arc length? The natural answer: only the on-curve endpoint gets the cumulative arc length. Off-curve points get interpolated or zero.
3. **Accuracy vs performance tradeoff**: How many quadrature points are needed? Research: 5-point Gauss-Legendre is standard, ~0.01% error for smooth curves.

#### Exit Criteria (to reach HIGH confidence)
- [ ] Numerical method chosen and validated against known curves
- [ ] Arc length attribution strategy for off-curve points decided
- [ ] Performance benchmarked for target path sizes

#### Technical Notes
- Gauss-Legendre 5-point quadrature weights and nodes are constants.
- Arc length = integral(0 to 1) of ||B'(t)|| dt, approximated by sum of w_i * ||B'(t_i)||.
- For adaptive subdivision: recursively split bezier at midpoint, sum chord lengths, stop when error < epsilon.

---

### P1 WI-4: Materializer dispatch (polygon fast-path vs bezier) [HIGH]

**Dependencies**: WI-1, WI-2, WI-3, Sprint phase1-fix
**Spec Reference**: CLAUDE.md "Runtime hot loop" | **Status Reference**: EVALUATION-20260202.md "Production Materializer"

#### Description
Update the materializer's pathDerivative case to dispatch based on topology:
1. Look up `PathTopologyDef` from registry using `expr.topologyId`
2. Check `topology.hasCubic || topology.hasQuad`
3. If false: call existing `fillBufferTangent`/`fillBufferArcLength` (polygon fast-path)
4. If true: call new `fillBufferTangentBezier`/`fillBufferArcLengthBezier` (per-segment dispatch)

#### Acceptance Criteria
- [ ] Materializer looks up PathTopologyDef from expr.topologyId
- [ ] Polygon paths use existing fast-path (no performance regression)
- [ ] Bezier paths dispatch to per-segment computation
- [ ] Mixed paths (line + bezier segments) compute correctly
- [ ] No allocation in the dispatch hot path (reuse buffers)

#### Technical Notes
- The dispatch check (`hasCubic || hasQuad`) is O(1) -- just a boolean check.
- The per-segment bezier functions need the topology's `segmentKind[]` and `segmentPointBase[]` arrays.
- Keep `fillBufferTangent` and `fillBufferArcLength` unchanged for polygon fast-path. Add new functions for bezier paths.
- Location: `src/runtime/ValueExprMaterializer.ts` lines 525-537 (dispatch) and 710-788 (algorithms).

---

### P2 WI-5: ProceduralBezier block and open/closed path support [MEDIUM]

**Dependencies**: WI-1
**Spec Reference**: shapes/types.ts PathTopologyDef.closed | **Status Reference**: EVALUATION-20260202.md "No blocks produce CUBIC or QUAD verbs"

#### Description
Create a bezier-producing block for testing and user use. Options:
- `ProceduralBezier`: Takes control points and produces a cubic bezier path
- `ProceduralCurve`: Higher-level block that takes a curve shape parameter

Also add open path support to tangent/arcLength:
- Open paths: tangent at endpoints uses forward/backward difference instead of central difference
- Open paths: arc length does not include closing segment

#### Acceptance Criteria
- [ ] At least one block produces a path with CUBIC or QUAD verbs
- [ ] Block registers topology correctly with bezier verb sequence
- [ ] Open path tangent at endpoints uses forward/backward difference
- [ ] Closed path tangent wraps (existing behavior preserved)
- [ ] Integration test: ProceduralBezier -> PathField -> tangent/arcLength verified

#### Unknowns to Resolve
1. **Block design**: What user-facing parameters should ProceduralBezier expose? Options: (a) raw control points, (b) start/end points + curvature, (c) SVG-like path data. Research: look at what other node-graph animation tools expose.
2. **Open path semantics**: How does the `closed` flag affect control point cardinality? Does an open path have one fewer segment than a closed path?

#### Exit Criteria (to reach HIGH confidence)
- [ ] Block interface designed and approved
- [ ] Open/closed path semantics documented and tested

## Dependencies
```
Sprint phase1-fix ──> All WIs in this sprint

WI-1 (dispatch data) ──> WI-2 (bezier tangent)
                     ──> WI-3 (bezier arc length)
                     ──> WI-5 (ProceduralBezier)
WI-1, WI-2, WI-3 ──> WI-4 (materializer dispatch)
```

## Risks
- **Numerical accuracy**: Bezier arc length via quadrature may not be accurate enough for degenerate curves (cusps, self-intersections). Mitigation: use adaptive subdivision as fallback.
- **Performance**: Per-segment dispatch is inherently slower than the polygon fast-path. Mitigation: polygon fast-path is preserved; only bezier paths pay the cost.
- **Off-curve control point semantics**: Not well-defined for tangent/arcLength. Mitigation: research standard practice, make a decision, document it.
