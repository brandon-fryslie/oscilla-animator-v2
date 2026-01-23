---
topic: 17
name: Layout System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/17-layout-system.md
generated: 2026-01-23T00:00:00Z
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: []
---

# Context: Topic 17 — Layout System

## What the Spec Requires

1. Layout is Field<vec2> in world-space [0,1]x[0,1] produced by field expressions and field kernels
2. Single layout engine: field expressions + kernels only. No InstanceDecl.layout, no FieldExprLayout, no position/radius intrinsics
3. Intrinsic set is CLOSED: only {index, normalizedIndex, randomId}
4. index: lane index i for [0, N-1]
5. normalizedIndex: i/(N-1) for N>1; **0.5 for N=1**
6. randomId: deterministic PRNG from (instanceId, i) and seed
7. circleLayout kernel: t_i = **clamp(t[i], 0, 1)**; theta_i = **phase + 2pi * t_i**; x = 0.5 + r*cos(theta); y = 0.5 + r*sin(theta). Phase is in **radians**.
8. lineLayout kernel: t_i = clamp(t[i], 0, 1); x = (1-t)*x0 + t*x1; y = (1-t)*y0 + t*y1
9. gridLayout kernel: idx = clamp(floor(k[i]), 0, totalCount-1); col = idx%cols; row = floor(idx/cols); x = col/(cols-1) or 0.5; y = row/(rows-1) or 0.5
10. Layout kernels use PureFn kind: 'kernel' with name in field-kernel registry
11. Layout blocks at graph level take signals + intrinsic fields, output Field<vec2>
12. Compile to FieldExprZipSig { kind: 'zipSig', field: intrinsic, signals: [...], fn: kernel, type: Field<vec2> }
13. StepRender positionSlot must reference Field<vec2> over instanceId
14. All field-backed inputs in StepRender must be over same instanceId
15. No InstanceDecl.layout property consulted for rendering
16. No position/radius intrinsics present in IR

## Current State (Topic-Level)

### How It Works Now

The layout system is largely implemented correctly. Layout blocks (GridLayout, LineLayout, CircleLayout) in `src/blocks/instance-blocks.ts` and `src/blocks/geometry-blocks.ts` emit FieldExprZipSig with the appropriate kernel names. The kernels themselves are implemented in `src/runtime/FieldKernels.ts` as part of the `applyFieldKernelZipSig` function. The intrinsic set is correctly closed to {index, normalizedIndex, randomId} in `src/compiler/ir/types.ts`. There are no FieldExprLayout nodes or position/radius intrinsics. However, there are two behavioral divergences from spec: the normalizedIndex N=1 case returns 0 instead of 0.5, and the circleLayout phase parameter is treated as normalized [0,1] instead of radians.

### Patterns to Follow

- Layout blocks in `src/blocks/instance-blocks.ts` (GridLayout, LineLayout, CircleLayout)
- CircularLayout also in `src/blocks/geometry-blocks.ts`
- Field kernels in `src/runtime/FieldKernels.ts` (applyFieldKernelZipSig)
- Kernel tests in `src/runtime/__tests__/field-kernel-contracts.test.ts`
- FieldExprZipSig in `src/compiler/ir/types.ts:216-223`

## Work Items

### WI-1: Fix normalizedIndex for N=1

**Status**: WRONG
**Spec requirement**: "normalizedIndex: i/(N-1) for N>1; 0.5 for N=1"
**Files involved**:
| File | Role |
|------|------|
| src/runtime/Materializer.ts:404-410 | fillBufferIntrinsic normalizedIndex case |
| src/runtime/__tests__/ | Tests to update |

**Current state**: `arr[i] = N > 1 ? i / (N - 1) : 0;` — returns 0 for single-element
**Required state**: `arr[i] = N > 1 ? i / (N - 1) : 0.5;` — returns 0.5 for single-element
**Suggested approach**:
1. Change the ternary false branch from `0` to `0.5` in Materializer.ts line 408
2. Update any tests that assert the N=1 case
3. Verify circleLayout with N=1 still produces reasonable output (single point at center+radius)
**Risks**: Low. This is a one-character fix. May affect existing patches with single-element arrays — they would shift from (0,0) corner to center placement.
**Depends on**: none

### WI-2: Fix circleLayout Phase Unit (Radians vs Normalized)

**Status**: WRONG
**Spec requirement**: "theta_i = phase + 2pi * t_i" where phase is in radians (unit: 'radians')
**Files involved**:
| File | Role |
|------|------|
| src/runtime/FieldKernels.ts:453-480 | circleLayout kernel |
| src/blocks/geometry-blocks.ts:84 | CircularLayout block (phase input) |
| src/blocks/instance-blocks.ts:249-253 | CircleLayout block |
| src/runtime/__tests__/field-kernel-contracts.test.ts | circleLayout tests |

**Current state**: `angle = TWO_PI * (indexArr[i] + phase)` — phase is normalized [0,1] where 1.0 = full rotation. Comment says "phase in [0,1] for full rotation".
**Required state**: `angle = phase + TWO_PI * indexArr[i]` — phase is in radians where 2*pi = full rotation.
**Suggested approach**:
1. Change formula to `angle = phase + TWO_PI * indexArr[i]`
2. Update block definitions: CircularLayout phase input should have unit 'radians' not unitPhase01()
3. Update tests to pass phase in radians
4. Check if any demo patches pass phase values that assume [0,1] semantics — they would need conversion
**Risks**: Breaking change for existing patches/demos that use phase as normalized value. The geometry-blocks.ts CircularLayout already uses `unitPhase01()` which implies the current [0,1] convention is intentional for the UI.
**Depends on**: none

### WI-3: Add circleLayout Input Clamping

**Status**: MISSING
**Spec requirement**: "t_i = clamp(t[i], 0, 1)" before computing angle
**Files involved**:
| File | Role |
|------|------|
| src/runtime/FieldKernels.ts:476-479 | circleLayout inner loop |
| src/runtime/__tests__/field-kernel-contracts.test.ts | Add clamp test |

**Current state**: `indexArr[i]` used directly without clamping. lineLayout (line 587) and gridLayout (line 615) both clamp their inputs.
**Required state**: `const t_i = Math.max(0, Math.min(1, indexArr[i]));` before computing angle.
**Suggested approach**:
1. Add `const t = Math.max(0, Math.min(1, indexArr[i]));` before angle computation
2. Use `t` instead of `indexArr[i]` in the angle formula
3. Add test case with out-of-range input values
**Risks**: Very low. Adds minor cost per-lane. May change behavior if any code passes unclamped values, but normalizedIndex already produces [0,1] so practical impact is minimal.
**Depends on**: none
