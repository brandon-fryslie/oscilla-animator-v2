# Sprint: path-operators - Synth-Native Path Operators

**Generated:** 2026-01-20
**Confidence:** LOW
**Status:** EXPLORATION REQUIRED

## Sprint Goal

Create "synth-native" path operators that make paths feel like oscillators and filters - continuously modulatable, composable, and fun.

## Current Understanding

Paths should feel like a modular synth:
- Signal graph is continuous and predictably modulatable
- Combinators (mixing, stacking, warping) compose naturally
- Small set of primitives unlocks large space via modulation
- Topology-stable operations preferred during playback
- Topology-changing ops are discrete events (not per-frame)

## Major Unknowns

1. **Which operators are essential?**
   - Impact: Determines scope and API surface
   - Candidates: Trim, Dash, WarpNoise, Resample, TangentNormal, Offset

2. **Topology-stable vs topology-changing classification**
   - Impact: Determines which ops are continuous vs discrete
   - Examples: Trim (stable), Boolean ops (changing), Stroke-to-outline (changing)

3. **Field-based warping semantics**
   - Impact: How noise/attractor warps apply to control points
   - Questions: Pre-interpolation or post-interpolation? Per-control-point or per-sample?

4. **Instance-along-path mechanics**
   - Impact: How to place instances (circles, rects) along a path
   - Questions: By arc length? By parameter? With rotation to tangent?

## Exploration Options

### Option A: Minimal Operator Set

Focus on topology-stable operators only:

| Operator | Input | Output | Stable? |
|----------|-------|--------|---------|
| Trim | path + start/end phase | path (partial) | Yes |
| WarpNoise | path + amplitude/freq | path (warped points) | Yes |
| TangentField | path | Field<angle> | Yes |
| PositionField | path | Field<vec2> | Yes |

**Complexity:** Low
**Risk:** May feel limited
**Pros:** Clean semantics, predictable, fast
**Cons:** No boolean ops, no stroke-to-outline

### Option B: Full Operator Suite

Include topology-changing operators with discrete semantics:

| Operator | Input | Output | Stable? |
|----------|-------|--------|---------|
| All from Option A | ... | ... | Yes |
| StrokeToOutline | path + width | path (new topology) | No |
| BooleanUnion | path + path | path (new topology) | No |
| Simplify | path + tolerance | path (new topology) | No |
| Resample | path + count | path (new topology) | No |

**Complexity:** High
**Risk:** Topology churn, state migration complexity
**Pros:** Maximum expressiveness
**Cons:** Lots of guardrails needed

### Option C: Deferred - Paths as Instance Targets Only

Don't implement path operators yet. Just enable:
- Placing instances along a path (position + rotation from tangent)
- This covers 80% of visual use cases

**Complexity:** Minimal
**Risk:** Feels incomplete
**Pros:** Ship faster, validate path fundamentals first
**Cons:** Paths are passive (can't modulate the path itself)

## Questions for User

1. Is placing instances along paths the primary use case, or do you need to modulate paths themselves?
2. Should topology-changing ops be supported, or explicitly out of scope for v1?
3. What's the expected complexity of paths? (Simple polygons? Complex SVG imports?)

## Exit Criteria (to reach MEDIUM confidence)

- [ ] Essential operator set defined (3-5 operators)
- [ ] Topology-stable vs topology-changing boundaries clear
- [ ] One operator fully prototyped (likely Trim or WarpNoise)
- [ ] Performance characteristics understood

## Dependencies

- Sprint: path-topology (path representation must exist first)
- Sprint: shape-fundamentals (rendering pipeline must work)

## Risks

| Risk | Mitigation |
|------|------------|
| Over-engineering operators | Start with Option C, add operators based on demand |
| Topology churn in boolean ops | Defer boolean ops to v2 |
| Performance of per-frame warping | Profile; may need GPU acceleration later |
