# Evaluation: Path System
Timestamp: 2026-02-02-103500
Git Commit: 0023fa3

## Executive Summary
Overall: 65% complete (Phase 1 polygonal) | Critical issues: 2 | Tests reliable: NO

Phase 1 (polygonal path derivatives) has working production code but the tests are theater -- they test local copies of the algorithm, not the actual production functions. There is also a stride mismatch between the test copy and production copy (vec2 vs vec3). The architectural gap for Phase 2 (bezier support) is well-defined: pathDerivative has no access to topology/verb information, which it will need for curve-aware tangent/arcLength.

## Runtime Check Results
| Check | Status | Output |
|-------|--------|--------|
| path-field.test.ts (13 tests) | PASS | All 13 pass in 3ms |
| value-expr-invariants.test.ts | PASS | All 17 pass in 4ms |
| TypeScript build | NOT RUN | - |

## Missing Checks
- Integration test that exercises PathField block through actual compilation + materializer
- Test that verifies production `fillBufferTangent` in `ValueExprMaterializer.ts` (stride 3 output, vec3)
- End-to-end test: ProceduralPolygon -> PathField -> tangent buffer verification
- No test for pathDerivative through the schedule executor path

## Findings

### PathField Block Definition (`src/blocks/shape/path-field.ts`)
**Status**: COMPLETE (for Phase 1 scope)
**Evidence**: Lines 55-146 define complete block with 4 outputs (position, index, tangent, arcLength), lower function emits correct IR nodes via `ctx.b.pathDerivative()`.
**Issues**: None for Phase 1. Phase 2 limitations are documented in comments (lines 35-38).

### pathDerivative ValueExpr (`src/compiler/ir/value-expr.ts:193-199`)
**Status**: COMPLETE (for Phase 1), ARCHITECTURAL GAP for Phase 2
**Evidence**: `kernelKind: 'pathDerivative'` variant stores only `field: ValueExprId` and `op: 'tangent' | 'arcLength'`.
**Issues**: No topology reference. For bezier-aware derivatives, the materializer needs to know which control points belong to which verb (LINE vs CUBIC vs QUAD). The current design cannot express this.

### Production Materializer (`src/runtime/ValueExprMaterializer.ts:525-537, 710-788`)
**Status**: COMPLETE (for Phase 1)
**Evidence**: `fillBufferTangent` (line 710) reads vec2 input (stride 2), outputs vec3 (stride 3) with z=0. `fillBufferArcLength` (line 761) reads vec2, outputs float. Central difference and cumulative Euclidean distance algorithms are correct for polygonal paths.
**Issues**:
1. Tangent assumes ALL control points are simple vertices (no distinction between on-curve and off-curve points)
2. Arc length assumes straight-line segments between consecutive points
3. Both are correct assumptions for polygons but will produce wrong results for bezier paths

### Test Coverage (`src/blocks/__tests__/path-field.test.ts`)
**Status**: TEST THEATER
**Evidence**: Lines 13-38 define a LOCAL copy of `fillBufferTangent` that uses stride 2 (vec2 output), while production code at `ValueExprMaterializer.ts:710-741` uses stride 3 (vec3 output). The test function is a separate implementation that happens to share the same algorithm core but with different output format.
**Issues**:
1. **Tests do not import or call production code.** They define their own `fillBufferTangent` and `fillBufferArcLength` functions.
2. **Stride mismatch**: Test uses `out[i * 2]` (vec2), production uses `out[i * 3]` (vec3 with z=0). If production code had a bug in z-component handling, tests would not catch it.
3. **Tests would pass with production functions deleted.** They are self-contained.
4. This violates CLAUDE.md rule: "Test the *interface*, not the implementation" -- but these tests don't test even the interface.

### Path-Producing Blocks
**Status**: COMPLETE (polygonal only)
**Evidence**:
- `ProceduralPolygon` (`src/blocks/shape/procedural-polygon.ts`) - Creates MOVE+LINE+CLOSE topology
- `ProceduralStar` (`src/blocks/shape/procedural-star.ts`) - Creates MOVE+LINE+CLOSE topology
- No blocks produce CUBIC or QUAD verbs
**Issues**: No bezier-producing blocks exist. This is expected for Phase 1.

### Rendering Pipeline
**Status**: COMPLETE (including bezier rendering)
**Evidence**:
- `Canvas2DRenderer.ts:319-329` handles CUBIC via `ctx.bezierCurveTo()`
- `Canvas2DRenderer.ts:333-340` handles QUAD via `ctx.quadraticCurveTo()`
- `SVGRenderer.ts:54-66` handles CUBIC via `C` command
- `SVGRenderer.ts:67-76` handles QUAD via `Q` command
**Issues**: None. Renderers are bezier-ready.

### Topology Registry (`src/shapes/registry.ts`)
**Status**: COMPLETE
**Evidence**: Dynamic topology registration works (line 95-106). Both polygon and star blocks successfully register topologies. PathTopologyDef includes verbs/pointsPerVerb for bezier support.
**Issues**: None.

### Topology Information Flow (Architecture)
**Status**: ARCHITECTURAL GAP for Phase 2
**Evidence**: The `pathDerivative` kernel (ValueExpr) references only `field: ValueExprId` (the control points). It has no reference to the topology that produced those control points. The materializer at line 525-537 receives control points but has no way to look up which verb sequence corresponds to those points.
**Issues**: For bezier tangent/arcLength, the materializer needs:
1. The verb array (to know which points are control points vs endpoints)
2. The pointsPerVerb array (to know how many points each verb consumes)
3. Whether the path is closed

The `ValueExprShapeRef` (line 228-239) DOES carry `topologyId` and `controlPointField`, so the topology information exists in the IR -- it just isn't threaded to pathDerivative.

## Ambiguities Found
| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| Tangent output format | Should tangent be vec2 (matching input) or vec3? | Production chose vec3 (z=0), tests chose vec2 | LOW - vec3 is correct for render pipeline compatibility. But the test/production mismatch means the vec3 decision is untested. |
| Open vs closed paths | Should tangent/arcLength handle open paths? | Both assume closed (wrapping at boundaries). PathField comments say "Phase 2" for open path support. | LOW for Phase 1 - all current blocks produce closed paths. |
| Topology threading | How should pathDerivative access topology for bezier support? | Not addressed - Phase 1 deliberately avoids this. | HIGH for Phase 2 - this is the primary architectural question. |
| Control point interpretation | For bezier paths, which points are "on-curve" vs "off-curve"? | Not addressed. Verb sequence in PathTopologyDef defines this implicitly. | HIGH for Phase 2 - tangent computation differs fundamentally for bezier curves. |

## Architecture Assessment: What ValueExpr Migration Enables

The unified ValueExpr system provides a clean path forward for Phase 2:

**Option A: Add topology reference to pathDerivative kernel**
```typescript
// Add topologyId to the pathDerivative variant
readonly kernelKind: 'pathDerivative';
readonly field: ValueExprId;
readonly op: 'tangent' | 'arcLength';
readonly topologyId?: TopologyId;  // NEW: for bezier-aware computation
```
The materializer could then look up PathTopologyDef from registry and dispatch to bezier-specific algorithms.

**Option B: Make pathDerivative consume shapeRef directly**
Instead of the control point field, pathDerivative could reference the shapeRef ValueExpr and extract both topology and control points from it. This is more principled (single source of truth) but requires the materializer to traverse the expression graph.

**Option C: Separate kernel kinds for polygon vs bezier derivatives**
Add `bezierTangent`/`bezierArcLength` kernel kinds. Simplest but creates a mode explosion.

The current IR design does not force any particular choice -- all three options are viable from the current state.

## Recommendations
1. **Fix test theater immediately.** Export `fillBufferTangent` and `fillBufferArcLength` from the materializer (or a shared module) and test the actual production code. The stride mismatch (vec2 in test vs vec3 in production) means the vec3 z-component behavior is completely untested.
2. **Add an integration test** that creates a ProceduralPolygon, compiles it, connects PathField, and verifies tangent/arcLength buffers through the materializer.
3. **Design decision needed for Phase 2**: How to thread topology to the materializer. Option A (add topologyId to pathDerivative kernel) is the simplest change and follows the existing pattern where shapeRef already carries topologyId.
4. **No urgency on bezier blocks** -- renderers are ready, but the derivative computation architecture needs to be settled first.

## Verdict
- [x] CONTINUE - Issues clear, implementer can fix

The path system Phase 1 is functionally complete but undertested. The two critical issues are:
1. Test theater (tests don't exercise production code) -- fixable in ~30 minutes
2. Phase 2 architecture gap (topology threading) -- design decision needed but not blocking Phase 1

Phase 1 can ship after fixing tests. Phase 2 requires a design decision on topology threading before implementation begins.
