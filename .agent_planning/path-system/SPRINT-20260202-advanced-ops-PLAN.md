# Sprint: advanced-ops - Advanced Path Operations
Generated: 2026-02-02
Confidence: HIGH: 0, MEDIUM: 1, LOW: 3
Status: RESEARCH REQUIRED
Source: EVALUATION-20260202.md
Bead: oscilla-animator-v2-olit (Phase 3: Advanced Path Operations)

## Sprint Goal
Research and implement advanced per-point path operations: curvature, normals, uniform parameterization, and offset paths.

## Scope
**Deliverables:**
- Curvature computation (second derivative magnitude)
- Normal vectors (perpendicular to tangent)
- Path parameterization (uniform t via arc length reparameterization)
- Offset paths (parallel curve at distance d)

## Work Items

### P2 WI-1: Normal vectors [MEDIUM]

**Dependencies**: Sprint bezier-support complete (tangent must work for all path types)
**Spec Reference**: N/A | **Status Reference**: EVALUATION-20260202.md "Phase 2 Enhancements"

#### Description
Normal vectors are perpendicular to tangent vectors. In 2D (z=0 plane), the normal is simply the tangent rotated 90 degrees: normal = (-tangent.y, tangent.x, 0). This is straightforward once tangent computation works correctly for all path types.

Add a new `op` value to pathDerivative: `'normal'`.

#### Acceptance Criteria
- [ ] `pathDerivative` op union extended with `'normal'`
- [ ] Normal computed as 90-degree rotation of tangent (2D convention)
- [ ] Normal output is vec3 (z=0) matching tangent convention
- [ ] Unit tests verify normal perpendicularity to tangent at sample points
- [ ] PathField block exposes optional `normal` output

#### Technical Notes
- This is the simplest of the advanced operations -- it's a trivial transformation of tangent.
- The materializer can compute normal by first computing tangent, then rotating.
- Alternatively, compute tangent and normal in the same pass for efficiency (avoid redundant tangent computation).
- Convention: right-hand normal (counterclockwise rotation of tangent).

---

### P3 WI-2: Curvature computation [LOW]

**Dependencies**: WI-1 (normals), Sprint bezier-support (tangent for all types)
**Spec Reference**: N/A | **Status Reference**: EVALUATION-20260202.md "Phase 2 Enhancements"

#### Description
Curvature = |dT/ds| where T is the unit tangent and s is arc length. For parametric curves: kappa = |x'y'' - y'x''| / (x'^2 + y'^2)^(3/2).

For polygonal paths, curvature is concentrated at vertices (delta function). Options:
1. Approximate curvature from finite differences of tangent direction
2. Return discrete turning angle at vertices
3. Return curvature only for bezier segments

#### Acceptance Criteria
- [ ] Curvature computation produces correct values for known curves (circle = 1/r)
- [ ] Curvature for straight line segments is zero
- [ ] Curvature output is float (scalar per control point)
- [ ] PathField block exposes optional `curvature` output

#### Unknowns to Resolve
1. **Polygon curvature semantics**: Should curvature at polygon vertices be the turning angle, the discrete curvature (2*tan(angle/2)/edge_length), or zero? Research: discrete differential geometry conventions.
2. **Second derivative for bezier**: Need B''(t) for cubic and quad. Cubic B''(t) = 6[(1-t)(P2-2P1+P0) + t(P3-2P2+P1)]. Need to evaluate at segment endpoints.
3. **Numerical stability**: Curvature formula has (magnitude)^3 in denominator. Near-zero tangent magnitude causes division instability. Research: clamping or regularization strategies.

#### Exit Criteria (to reach MEDIUM confidence)
- [ ] Curvature formula chosen and validated for polygon and bezier cases
- [ ] Numerical stability strategy decided
- [ ] Polygon curvature convention documented

---

### P3 WI-3: Uniform path parameterization [LOW]

**Dependencies**: Sprint bezier-support (arc length must work for all types)
**Spec Reference**: N/A | **Status Reference**: EVALUATION-20260202.md "Phase 2 Enhancements"

#### Description
Provide a uniform t parameter [0, 1] along the path where t is proportional to arc length (not parameter space). This requires inverting the arc length function: given desired arc length s, find parameter t such that arcLength(t) = s.

This enables effects like "uniform speed along path" and "evenly spaced points along path."

#### Acceptance Criteria
- [ ] Uniform t parameter computed per control point
- [ ] t=0 at path start, t=1 at path end (or last point for open paths)
- [ ] Uniform spacing verified: equal t increments correspond to equal arc length increments
- [ ] Performance acceptable for paths up to 200 segments

#### Unknowns to Resolve
1. **Implementation approach**: Options: (a) precompute arc length lookup table and binary search, (b) Newton iteration on arc length integral, (c) subdivision-based approach. Research: standard approaches in path animation.
2. **Resolution/accuracy**: How many samples in the lookup table? What error tolerance for Newton iteration?
3. **Integration with field system**: Does this become a new pathDerivative op, or a separate block that takes arcLength as input and normalizes it?

#### Exit Criteria (to reach MEDIUM confidence)
- [ ] Implementation approach chosen and validated
- [ ] Performance profiled for target path sizes
- [ ] Integration approach with field system decided

---

### P3 WI-4: Offset paths [LOW]

**Dependencies**: WI-1 (normals), Sprint bezier-support
**Spec Reference**: N/A | **Status Reference**: N/A (not in evaluation)

#### Description
Offset paths are parallel curves at a fixed distance d from the original path. The offset point at each position is: P_offset = P + d * N, where N is the unit normal.

For simple cases (convex paths, small offset), this is straightforward. For complex cases (concave paths, large offset, self-intersecting offset), this is a hard computational geometry problem.

#### Acceptance Criteria
- [ ] Offset path computed for simple convex paths (polygon, circle approximation)
- [ ] Offset distance is a signal input (can be animated)
- [ ] Self-intersection handling documented (even if not implemented)
- [ ] Output is a new field of vec2 control points (same cardinality)

#### Unknowns to Resolve
1. **Self-intersection handling**: Offset of concave paths can self-intersect. Options: (a) ignore (user's problem), (b) detect and clip, (c) limit offset distance. Research: standard approaches.
2. **Block design**: Should offset be a new block (OffsetPath) or an output of PathField? A separate block is cleaner (takes path + distance, outputs offset path).
3. **Topology changes**: The offset of a bezier is NOT a bezier. Should the output topology be resampled to LINE segments, or approximated with new bezier segments?

#### Exit Criteria (to reach MEDIUM confidence)
- [ ] Simple offset (convex, small d) implemented and tested
- [ ] Self-intersection strategy documented
- [ ] Output topology decision made

## Dependencies
```
Sprint bezier-support ──> All WIs in this sprint

WI-1 (normals) ──> WI-2 (curvature)
              ──> WI-4 (offset paths)
Sprint bezier-support (arc length) ──> WI-3 (parameterization)
```

## Risks
- **Scope creep**: Each of these operations has deep rabbit holes (numerical stability, degenerate cases, performance). Mitigation: Start with simple cases, document limitations, defer hard cases.
- **Curvature numerical instability**: Division by near-zero tangent magnitude. Mitigation: regularization (clamp denominator to epsilon).
- **Offset path self-intersection**: Hard unsolved problem in computational geometry. Mitigation: Start with convex-only, document limitation.
