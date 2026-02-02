# Definition of Done: advanced-ops
Generated: 2026-02-02
Status: RESEARCH REQUIRED
Plan: SPRINT-20260202-advanced-ops-PLAN.md

## Acceptance Criteria

### Normal Vectors (WI-1)
- [ ] pathDerivative op union includes 'normal'
- [ ] Normal = 90-degree rotation of tangent (2D)
- [ ] Output is vec3 (z=0)
- [ ] Perpendicularity verified in tests
- [ ] PathField exposes normal output

### Curvature (WI-2)
- [ ] Correct for known curves (circle = 1/r)
- [ ] Zero for straight line segments
- [ ] Scalar float output per control point
- [ ] Numerical stability for near-zero tangents
- [ ] PathField exposes curvature output

### Uniform Parameterization (WI-3)
- [ ] t in [0, 1] proportional to arc length
- [ ] Uniform spacing verified
- [ ] Performance acceptable for 200+ segments

### Offset Paths (WI-4)
- [ ] Correct for simple convex paths
- [ ] Offset distance is animatable signal input
- [ ] Self-intersection behavior documented

## Exit Criteria (for LOW items to reach MEDIUM)
- [ ] Curvature: formula chosen and validated, polygon convention documented
- [ ] Parameterization: implementation approach chosen, performance profiled
- [ ] Offset paths: simple case working, self-intersection strategy documented
- [ ] All research questions in PLAN answered with evidence
