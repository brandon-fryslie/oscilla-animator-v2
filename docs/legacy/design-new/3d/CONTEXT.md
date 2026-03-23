# 3D System: Context Index

Pointers to where things are. Read the source directly — don't rely on stale descriptions.

## Pipeline (per-frame execution order)

See `src/runtime/ScheduleExecutor.ts:executeFrame()` (line ~195) for the real sequence:
1. `evalSig` — signal evaluation → `src/runtime/SignalEvaluator.ts`
2. `materialize` — field buffers → `src/runtime/Materializer.ts` using kernels from `src/runtime/FieldKernels.ts`
3. `continuityApply` — world-space gauge/slew → `src/runtime/ContinuityApply.ts`
4. `render` — assembles passes → `src/runtime/RenderAssembler.ts:assembleRenderPass()`
5. Backend draws → `src/render/Canvas2DRenderer.ts`, `src/render/SVGRenderer.ts`

The 3D projection stage lives between (3) and (4) — inside `assembleRenderPass`.

## Spec References

| Topic | Canonical Spec File |
|-------|---------------------|
| System invariants | `design-docs/CANONICAL-oscilla-v2.5-20260109/00-invariants.md` |
| Essential spec (condensed) | `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` |
| Coordinate spaces | `ESSENTIAL-SPEC.md` §Coordinate Spaces (Topic 16) |
| Renderer contract | `ESSENTIAL-SPEC.md` §Renderer (I15, I16) |
| Runtime execution model | `ESSENTIAL-SPEC.md` §Runtime |
| Continuity | `design-docs/CANONICAL-oscilla-v2.5-20260109/11-continuity-system.md` |
| 3D projection design | `design-docs/_new/3d/2-Ortho+3d-OnDemand.md` |
| CombineMode restriction | `design-docs/_new/3d/4-CombineMode-Layer-Answer.md` |

## Source Files by Domain

### Types & Compilation
| File | Index Into |
|------|-----------|
| `src/types/index.ts` | PayloadType, CanonicalType, Extent, BlockRole |
| `src/compiler/ir/types.ts` | SigExpr, FieldExpr, Step variants, InstanceDecl |
| `src/compiler/ir/program.ts` | CompiledProgramIR output structure |
| `src/compiler/compile.ts` | 7-pass pipeline entry point |

### Runtime
| File | Index Into |
|------|-----------|
| `src/runtime/ScheduleExecutor.ts` | `executeFrame()`, RenderFrameIR, RenderPassIR |
| `src/runtime/RuntimeState.ts` | ValueStore, state slots |
| `src/runtime/Materializer.ts` | FieldExpr → typed array buffers |
| `src/runtime/FieldKernels.ts` | Layout kernels (circleLayout, gridLayout, lineLayout) |
| `src/runtime/RenderAssembler.ts` | `assembleRenderPass()`, `projectInstances()`, AssemblerContext |
| `src/runtime/BufferPool.ts` | Buffer allocation/recycling |

### 3D Projection (implemented by this work)
| File | Index Into |
|------|-----------|
| `src/projection/ortho-kernel.ts` | `projectFieldOrtho()`, ORTHO_CAMERA_DEFAULTS |
| `src/projection/perspective-kernel.ts` | `projectFieldPerspective()`, PERSP_CAMERA_DEFAULTS, `deriveCamPos()` |
| `src/projection/fields.ts` | `createPositionField()`, `writePosition()`, `createSizeField()` |
| `src/projection/layout-kernels.ts` | `gridLayout3D()`, `lineLayout3D()`, `circleLayout3D()` |

### Continuity
| File | Index Into |
|------|-----------|
| `src/runtime/ContinuityApply.ts` | `applyContinuity()` — world-space, per-element |
| `src/runtime/ContinuityMapping.ts` | `detectDomainChange()` — instance identity |

### Rendering
| File | Index Into |
|------|-----------|
| `src/render/Canvas2DRenderer.ts` | Canvas backend — screenPos × viewport only |
| `src/render/SVGRenderer.ts` | SVG backend — same contract |
| `src/shapes/registry.ts` | Topology registry |

## Key Interfaces (read source for current shape)

| Interface | Defined In | What To Check |
|-----------|-----------|---------------|
| `RenderPassIR` | `ScheduleExecutor.ts:~98` | screen-space fields: screenPosition, screenRadius, depth, visible |
| `AssemblerContext` | `RenderAssembler.ts:~122` | camera?: CameraParams |
| `CameraParams` | `RenderAssembler.ts:~61` | union of ortho/perspective param types |
| `ProjectionOutput` | `RenderAssembler.ts:~69` | screenPosition, screenRadius, depth, visible |
| `CompiledProgramIR` | `compiler/ir/program.ts` | schedule, signalExprs, fieldExprs, slotMeta |

## Test Infrastructure

```bash
npm run test              # all tests
npm run test:watch        # watch mode
npx vitest run <path>     # specific file
```

3D tests: `src/projection/__tests__/level{N}-*.test.ts`

## Architecture Invariants (for 3D work)

These are not re-explanations — read the spec references above for full context.

1. **Projection is a leaf** — depends on world-space buffers, nothing depends on it except backends
2. **World buffers are read-only to projection** — separate screen-space output allocations
3. **Camera is a viewer param** — not in CompiledProgramIR, RuntimeState, or ContinuityState
4. **Kernels are pure** — zero imports from `src/runtime/`, `src/compiler/`
5. **Backends are screen-space only** — zero imports from `src/projection/`
6. **One camera defaults source** — ORTHO_CAMERA_DEFAULTS, PERSP_CAMERA_DEFAULTS
