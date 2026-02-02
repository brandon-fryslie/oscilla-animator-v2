# Sprint: phase1-fix - Fix Phase 1 Foundation
Generated: 2026-02-02
Confidence: HIGH: 5, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260202.md

## Sprint Goal
Fix test theater, add topologyId to pathDerivative kernel, and write integration tests that exercise production code through the compiler-materializer pipeline.

## Scope
**Deliverables:**
- Delete test theater tests that duplicate production code locally
- Add `topologyId: TopologyId` (required) to pathDerivative kernel variant
- Update IRBuilder interface + implementation to pass topologyId
- Update PathField block lowering to thread topologyId from shapeRef context
- Update polygon block lowering (ProceduralPolygon, ProceduralStar) to pass topologyId
- Update materializer to receive topologyId (no behavior change for polygons)
- Write integration tests exercising production code through compiler -> materializer

## Work Items

### P0 WI-1: Add topologyId to pathDerivative kernel

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md (all values carry full context) | **Status Reference**: EVALUATION-20260202.md "Architectural Gap for Phase 2"

#### Description
The pathDerivative kernel variant currently lacks topology information. Add `readonly topologyId: TopologyId` as a required field. This is the architecture decision: Option A with required topologyId (not optional). Polygons get real topologies too -- no dual-mode API.

#### Acceptance Criteria
- [ ] `ValueExprKernel` pathDerivative variant includes `readonly topologyId: TopologyId`
- [ ] `IRBuilder.pathDerivative()` signature accepts `topologyId: TopologyId` parameter
- [ ] `IRBuilderImpl.pathDerivative()` passes topologyId through to the expression
- [ ] TypeScript compiles with no errors (`npm run typecheck`)
- [ ] Existing invariant tests in `value-expr-invariants.test.ts` updated and passing

#### Technical Notes
- The field is required (not optional) per architecture decision. Polygons have real TopologyIds already (assigned by `registerDynamicTopology`).
- This is a breaking change to the IRBuilder interface. All callers must be updated in the same commit.
- The `topologyId` follows the same pattern as `ValueExprShapeRef` which already carries `topologyId`.

---

### P0 WI-2: Update PathField block lowering to thread topologyId

**Dependencies**: WI-1
**Spec Reference**: CLAUDE.md "Block System Rules" | **Status Reference**: EVALUATION-20260202.md "PathField Block Definition"

#### Description
PathField's `lower()` function currently calls `ctx.b.pathDerivative(controlPointsFieldId, 'tangent', tanType)` without a topologyId. It needs to receive the topologyId from the upstream shapeRef context and pass it through to pathDerivative.

The challenge: PathField receives `controlPoints` (a field), not a shapeRef. The topologyId must be threaded from the block that produced the control points. Two approaches:
1. Pass topologyId via lowering context (e.g., `ctx.topologyId` or extracted from the input's provenance)
2. Require PathField to have a `shape` input (signal carrying shapeRef) in addition to controlPoints

Approach 1 is simpler and maintains the current PathField interface. The lowering system can inspect the input expression graph to find the shapeRef that produced the control points and extract its topologyId.

#### Acceptance Criteria
- [ ] PathField's `lower()` resolves topologyId from its input's provenance (shapeRef)
- [ ] Both `pathDerivative` calls (tangent, arcLength) pass the resolved topologyId
- [ ] If no topologyId can be resolved, lowering produces a clear compile error (not a runtime crash)
- [ ] TypeScript compiles with no errors

#### Technical Notes
- The input `controlPoints` is a `ValueExprId`. The lowering context or IRBuilder should provide a way to look up the shapeRef that produced a given field. Since `ValueExprShapeRef` has `controlPointField?: ValueExprId`, we can trace backward from the controlPoints input to find the shapeRef.
- If backward tracing is too complex, an alternative is to add an explicit `topologyId` config parameter to PathField, populated by the graph normalization pass that wires up PathField to a shape-producing block.

---

### P0 WI-3: Update ProceduralPolygon and ProceduralStar lowering

**Dependencies**: WI-1
**Spec Reference**: CLAUDE.md "Adding a New Block Type" | **Status Reference**: EVALUATION-20260202.md "Path-Producing Blocks"

#### Description
ProceduralPolygon and ProceduralStar already call `registerDynamicTopology()` and get a `topologyId`. They already pass it to `ctx.b.shapeRef()`. No changes needed to these blocks themselves for the topologyId threading -- the topologyId is already available in the shapeRef they emit.

However, verify that the topologyId flows correctly through the graph when PathField consumes controlPoints from these blocks. This WI is about verification and any small adjustments needed.

#### Acceptance Criteria
- [ ] ProceduralPolygon's lowered shapeRef carries correct topologyId (already true -- verify)
- [ ] ProceduralStar's lowered shapeRef carries correct topologyId (already true -- verify)
- [ ] When PathField consumes controlPoints from either block, the topologyId is accessible
- [ ] No changes needed to polygon/star lowering if topology threading works via shapeRef inspection

#### Technical Notes
- ProceduralPolygon: `src/blocks/shape/procedural-polygon.ts:132` calls `registerDynamicTopology(topology, 'polygon-${sides}')` and passes result to `ctx.b.shapeRef()` at line 214.
- ProceduralStar: `src/blocks/shape/procedural-star.ts:138` and line 251.
- These blocks may need no code changes -- this WI is about verifying the topology threading path.

---

### P0 WI-4: Update materializer to receive topologyId

**Dependencies**: WI-1
**Spec Reference**: CLAUDE.md "Runtime Rules" | **Status Reference**: EVALUATION-20260202.md "Production Materializer"

#### Description
The materializer's pathDerivative case at `ValueExprMaterializer.ts:525-537` currently ignores topology. Update it to read `expr.topologyId` from the kernel expression. For Phase 1, the behavior is unchanged (polygon fast-path), but the topologyId is now available for Phase 2 dispatch.

#### Acceptance Criteria
- [ ] Materializer pathDerivative case reads `expr.topologyId` from the kernel expression
- [ ] Polygon behavior is unchanged (fillBufferTangent, fillBufferArcLength still called for polygon topologies)
- [ ] TopologyId is available in the case block for future bezier dispatch (Phase 2)
- [ ] No runtime regressions

#### Technical Notes
- The materializer can look up `PathTopologyDef` from the topology registry using `expr.topologyId`.
- For now, no dispatch logic changes -- just make topologyId available and verify polygon paths still work.
- In Phase 2, this case will dispatch: polygon fast-path vs per-segment bezier based on topology flags.

---

### P0 WI-5: Delete test theater and write integration tests

**Dependencies**: WI-1, WI-2, WI-3, WI-4
**Spec Reference**: CLAUDE.md "Tests assert behavior, not structure" | **Status Reference**: EVALUATION-20260202.md "Test Coverage: TEST THEATER"

#### Description
Delete the entire contents of `src/blocks/__tests__/path-field.test.ts` which contains local copies of `fillBufferTangent` and `fillBufferArcLength` (vec2 stride, not matching production vec3 stride). Replace with integration tests that:

1. Create a ProceduralPolygon patch (compile-time)
2. Connect PathField to consume its controlPoints
3. Compile the patch through the compiler pipeline
4. Materialize the tangent and arcLength outputs
5. Verify the output buffers contain correct values (vec3 tangent with z=0, float arcLength)

#### Acceptance Criteria
- [ ] Old test-theater code is deleted entirely (no local copies of fill functions)
- [ ] At least 3 integration tests that exercise production code through compile -> materialize
- [ ] Tests verify tangent output is vec3 (stride 3) with z=0 component
- [ ] Tests verify arcLength output starts at 0 and increases monotonically
- [ ] Tests verify correct values for a known polygon (e.g., unit square: tangent directions, arc length distances)

#### Technical Notes
- Use existing test fixtures/patterns from `src/compiler/__tests__/` for building test patches.
- The test should create a minimal Patch with ProceduralPolygon + PathField, compile it, create RuntimeState, and call the materializer.
- Edge case tests (N=0, N=1, degenerate) can be unit tests of the exported fill functions if they are exported, but the primary tests MUST go through the pipeline.

## Dependencies
```
WI-1 (IR change) ──> WI-2 (PathField lowering)
                 ──> WI-3 (Polygon/Star verification)
                 ──> WI-4 (Materializer update)
WI-2, WI-3, WI-4 ──> WI-5 (Integration tests)
```

## Risks
- **TopologyId resolution in PathField lowering**: PathField receives controlPoints, not a shapeRef. Resolving the topologyId requires either backward graph traversal or an explicit config parameter. If the lowering context doesn't support backward traversal, WI-2 may need to add a shape/topology input to PathField.
  - **Mitigation**: Check if the lowering context already provides expression graph inspection. If not, the simpler path is adding a `topologyId` config to PathField that the graph normalization pass populates.
