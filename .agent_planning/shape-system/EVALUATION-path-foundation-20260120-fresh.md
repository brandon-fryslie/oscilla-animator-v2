# EVALUATION: Path Foundation - Fresh Assessment

**Date:** 2026-01-20
**Topic:** path-foundation
**Verdict:** CONTINUE - Ready for implementation at HIGH confidence

## Executive Summary

All research tasks from the original MEDIUM confidence plan have been verified. The unified-shape-foundation sprint is COMPLETE and provides all necessary infrastructure. Path-foundation can proceed immediately.

## Research Task Results

### 1. DOMAIN_CONTROL Instance Creation ✅

**Verified:** `createInstance(domainType, count, layout)` works for any domain including DOMAIN_CONTROL.

**Evidence:** Already used in geometry-blocks.ts for CircleLayout with the same pattern.

### 2. Field<vec2> Over DOMAIN_CONTROL ✅

**Verified:** `fieldIntrinsic(instanceId, intrinsicName, type)` accepts any InstanceId.

**Required:** Add 'position' intrinsic to DOMAIN_CONTROL registry (minor change).

### 3. Path Rendering Prototype ✅

**Verified:** Renderer dispatch pattern established in Canvas2DRenderer:
- `determineShapeMode()` → `getTopology()` → `topology.render(ctx, params)`
- Pattern supports iterating verbs for paths

## What Exists (from unified-shape-foundation)

| Component | Status | Location |
|-----------|--------|----------|
| TopologyDef interface | ✅ | src/shapes/types.ts |
| ShapeRef interface | ✅ | src/shapes/types.ts |
| Topology registry | ✅ | src/shapes/registry.ts |
| TOPOLOGY_ELLIPSE, TOPOLOGY_RECT | ✅ | src/shapes/topologies.ts |
| SigExprShapeRef IR type | ✅ | src/compiler/ir/types.ts |
| Renderer topology dispatch | ✅ | src/render/Canvas2DRenderer.ts |
| Shape param evaluation | ✅ | src/runtime/ScheduleExecutor.ts |

## What's Missing (path-foundation scope)

| Component | Files | Complexity |
|-----------|-------|------------|
| PathVerb enum | src/shapes/types.ts | Low |
| PathTopologyDef interface | src/shapes/types.ts | Low |
| DOMAIN_CONTROL intrinsics | src/core/domain-registry.ts | Low |
| ProceduralPolygon block | src/blocks/path-blocks.ts (new) | Medium |
| Path rendering | src/render/Canvas2DRenderer.ts | Medium |
| Control point field handling | pass7-schedule, executor | Medium |

## Confidence Assessment

**Previous:** MEDIUM (research needed)
**Current:** HIGH (all research complete)

**Justification:**
- All three research tasks verified as feasible
- No architectural unknowns remain
- Implementation is mechanical
- Code patterns established in unified-shape-foundation

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Control point binding | LOW | Pattern proven with CircleLayout |
| Path rendering perf | LOW | Paths are rare vs particles |
| Verb/param mismatch | LOW | Add validation in constructor |

## Recommendation

**Proceed with implementation.** Update plan confidence to HIGH and execute.

## Files to Create/Modify

**New:**
- src/blocks/path-blocks.ts
- src/blocks/__tests__/path-blocks.test.ts

**Modify:**
- src/shapes/types.ts (add PathVerb, PathTopologyDef)
- src/core/domain-registry.ts (add DOMAIN_CONTROL intrinsics)
- src/render/Canvas2DRenderer.ts (path rendering)
- src/compiler/passes-v2/pass7-schedule.ts (control point field)
- src/runtime/ScheduleExecutor.ts (control point materialization)
