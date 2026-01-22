# Evaluation: RenderAssembler v2

**Bead**: oscilla-animator-v2-583
**Created**: 2026-01-22

## Codebase Analysis

### Files Examined

| File | Lines | Purpose | Relevance |
|------|-------|---------|-----------|
| `src/runtime/RenderAssembler.ts` | 294 | Current v1 assembly | Primary target |
| `src/runtime/ScheduleExecutor.ts` | 410 | Frame execution | Consumer of assembler |
| `src/render/future-types.ts` | 202 | Target type definitions | Types to implement |
| `src/render/Canvas2DRenderer.ts` | 283 | Current renderer | Unchanged (this sprint) |
| `src/runtime/Materializer.ts` | 668 | Field materialization | Used by assembler |
| `src/shapes/registry.ts` | 69 | Topology registry | Topology lookup |
| `src/shapes/types.ts` | 142 | Shape/topology types | Type definitions |

### Spec Documents Examined

| Document | Sections | Key Insights |
|----------|----------|--------------|
| `3-local-space-spec-deeper.md` | §6 RenderAssembler Algorithm | Step-by-step algorithm |
| `8-before-render.md` | Full doc | Architecture rationale |
| `9-renderer.md` | Full doc | Renderer contract |

## Current Implementation Analysis

### RenderAssembler.ts Structure

```
assembleRenderPass(step, context)
├── Get instance from instances map
├── Resolve count
├── Read position buffer from slot
├── Read color buffer from slot
├── resolveScale(step.scale, signals, state)
├── resolveShape(step.shape, signals, state)
├── resolveControlPoints(step.controlPoints, state)
└── resolveShapeFully(shape, controlPoints)
    └── Returns ResolvedShape
```

**Strengths:**
- Clean separation of concerns
- Topology lookup centralized
- Control points resolved correctly
- Good error messages

**Gaps for v2:**
- Output structure doesn't match `DrawPathInstancesOp`
- Geometry and instances not separated
- Style not explicit (just color buffer)
- No rotation/scale2 support

### Coordinate Space Verification

**Confirmed**: Control points are already local-space.

Evidence from `Materializer.ts` lines 46-49:
```typescript
*   polygonVertex(index, sides, radiusX, radiusY) → vec2
*     LOCAL-SPACE - centered at (0,0), outputs control points
```

Evidence from `FieldKernels.ts` (polygonVertex kernel):
```typescript
const angle = (index / sides) * TWO_PI - Math.PI / 2;
outArr[i*2+0] = radiusX * Math.cos(angle);
outArr[i*2+1] = radiusY * Math.sin(angle);
```
This outputs points centered at origin with configurable radius - pure local-space.

**No kernel changes needed.**

### Type Alignment Check

`future-types.ts` defines:

```typescript
interface PathGeometry {
  readonly topologyId: number;      // ← Note: number, not TopologyId
  readonly verbs: Uint8Array;
  readonly points: Float32Array;
  readonly pointsCount: number;
  readonly flags?: number;
}
```

Current `TopologyId` is `string`. This is a known gap (tracked separately). For now, we can cast or use the string directly since the renderer will still use string-based registry lookup.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking v1 path | Low | High | V2 is purely additive |
| Type mismatches | Medium | Medium | Import from future-types.ts |
| Test gaps | Low | Medium | Write focused unit tests |
| Performance regression | Low | Low | Same algorithm, different structure |

## Estimation

| Task | Lines | Complexity | Time |
|------|-------|------------|------|
| Helper functions | ~60 | Low | 15 min |
| assembleDrawPathInstancesOp | ~50 | Medium | 20 min |
| assembleRenderFrame_v2 | ~20 | Low | 10 min |
| Exports | ~5 | Trivial | 5 min |
| Unit tests | ~100 | Medium | 30 min |
| **Total** | **~235** | | **~80 min** |

## Recommendation

**Proceed with implementation.** The work is well-scoped:
- Types already defined
- Algorithm documented in spec
- Control points already local-space
- V1 path remains unchanged
- Clear acceptance criteria

No blockers identified. Ready to implement.
