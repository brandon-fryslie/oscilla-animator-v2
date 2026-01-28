# Sprint: features - Stroke Rendering and Signal Swizzle

**Generated**: 2026-01-27-200500
**Confidence**: HIGH: 0, MEDIUM: 1, LOW: 1
**Status**: RESEARCH REQUIRED

## Sprint Goal

Implement missing rendering capabilities: stroke rendering and multi-component signal returns for swizzle operations.

## Scope

**Deliverables:**
1. Stroke rendering in RenderAssembler (strokeColor, strokeWidth)
2. Multi-component signal returns for swizzle (if still needed after Sprint 1 verification)

## Work Items

### P1: Implement Stroke Rendering [MEDIUM]

**Acceptance Criteria:**
- [ ] `PathStyle.strokeColor` is applied to rendered shapes
- [ ] `PathStyle.strokeWidth` controls stroke width
- [ ] Stroke-only rendering supported (fill: null, stroke: color)
- [ ] Combined fill+stroke rendering supported

**Technical Notes:**
- `PathStyle` in `src/render/types.ts` already has `strokeColor`, `strokeWidth` fields
- `buildPathStyle()` in `src/runtime/RenderAssembler.ts:1120` only sets `fillColor`
- Need to extend `buildPathStyle()` to include stroke properties
- Need block-level inputs for stroke styling (possibly new StrokeStyle block or extend existing)

#### Unknowns to Resolve
- How should stroke be specified at block level?
- Should strokes go through same rendering path as fills?
- Canvas2D vs SVG renderer differences for strokes?

#### Exit Criteria
- Design decision documented
- Implementation approach identified

### P2: Multi-component Signal Swizzle [LOW]

**Acceptance Criteria:**
- [ ] `makeVec2Sig`, `makeVec3Sig`, `makeColorSig` don't throw "not yet supported"
- [ ] Multi-component swizzle patterns (.xy, .rgb) work at signal level

**Technical Notes:**
- Currently these throw errors in SignalEvaluator
- Single-component extraction (.x, .r) works fine
- Multi-slot signal value handling needed

#### Unknowns to Resolve
- Is this actually blocking any workflows?
- What's the MVP implementation?
- Can this wait for a dedicated swizzle system sprint?

#### Exit Criteria
- Confirm if blocking (test in demos)
- If blocking: implement minimal fix
- If not blocking: defer to separate sprint

## Dependencies

- Sprint 1 (build-fix) must complete first
- Sprint 2 (dev-experience) recommended first for faster iteration

## Risks

| Risk | Mitigation |
|------|------------|
| Stroke rendering affects Canvas2D perf | Benchmark before/after |
| Swizzle changes cascade to IR | Keep changes minimal, add proper tests |
| Scope creep into full swizzle system | Strict MVP scope, defer complex patterns |
