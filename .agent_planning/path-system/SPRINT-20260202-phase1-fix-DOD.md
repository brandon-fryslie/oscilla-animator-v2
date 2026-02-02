# Definition of Done: phase1-fix
Generated: 2026-02-02
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260202-phase1-fix-PLAN.md

## Acceptance Criteria

### IR Change (WI-1)
- [ ] `pathDerivative` variant in `ValueExprKernel` has `readonly topologyId: TopologyId`
- [ ] `IRBuilder.pathDerivative()` accepts `topologyId: TopologyId` parameter
- [ ] `IRBuilderImpl.pathDerivative()` passes topologyId to expression
- [ ] `value-expr-invariants.test.ts` updated and passing
- [ ] `npm run typecheck` passes

### PathField Lowering (WI-2)
- [ ] PathField `lower()` resolves topologyId from input provenance
- [ ] Both pathDerivative calls pass resolved topologyId
- [ ] Missing topologyId produces compile error, not runtime crash

### Polygon/Star Verification (WI-3)
- [ ] Verified ProceduralPolygon shapeRef carries correct topologyId
- [ ] Verified ProceduralStar shapeRef carries correct topologyId
- [ ] TopologyId accessible when PathField consumes controlPoints

### Materializer (WI-4)
- [ ] Materializer reads `expr.topologyId` in pathDerivative case
- [ ] Polygon behavior unchanged
- [ ] No runtime regressions

### Integration Tests (WI-5)
- [ ] Old test theater deleted entirely
- [ ] 3+ integration tests exercise production compile -> materialize pipeline
- [ ] Tangent verified as vec3 (stride 3, z=0)
- [ ] ArcLength verified as monotonically increasing, starts at 0
- [ ] Known-value test (e.g., unit square tangent directions match expected)
- [ ] `npm run test` passes with zero failures
