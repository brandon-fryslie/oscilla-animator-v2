# Sprint: path-topology - Path Topology + Fields Architecture

**Generated:** 2026-01-20
**Confidence:** MEDIUM
**Status:** RESEARCH REQUIRED

## Sprint Goal

Implement paths as "Topology + Fields" - stable topology at compile-time, continuously-modulatable control points as fields at runtime.

## Known Elements

- Path = static topology (verbs, segment structure) + dynamic fields (control points, style params)
- Control points map naturally to instance system (DOMAIN_CONTROL)
- Existing Field<vec2> infrastructure handles per-control-point positions
- Materializer pattern works for path interpolation
- Canvas Path2D API available for rendering

## Unknowns to Resolve

1. **Curve representation** - How to encode segment types (linear, quadratic, cubic)?
   - Research: Review Canvas path commands, SVG path spec
   - Options: Per-segment verb enum, or uniform Catmull-Rom everywhere

2. **Topology asset format** - Where/how to store path topologies?
   - Research: Check if IR has asset registry pattern
   - Options: Inline in IR, separate asset table, or compile-time generation

3. **Sampling strategy** - How many points to interpolate per segment?
   - Research: Performance vs quality tradeoffs
   - Options: Fixed per-segment, adaptive, user-configurable

4. **Path block API** - How do users create/reference paths?
   - Research: Review similar blocks (GridLayout, Array)
   - Options: AssetPath (load SVG), ProceduralPath (polygon, star, spiral)

## Tentative Deliverables

- [ ] DOMAIN_CONTROL domain type for control point instances
- [ ] PathTopology asset format (verbs + control point refs)
- [ ] Path materializer (interpolates topology + control fields → positions)
- [ ] PathLayout block (like GridLayout but along a path)
- [ ] At least one path source: ProceduralPolygon or AssetPath

## Research Tasks

- [ ] Review Canvas Path2D API and performance characteristics
- [ ] Study existing LayoutSpec patterns for extension approach
- [ ] Prototype path interpolation in isolation (Catmull-Rom or Bezier)
- [ ] Evaluate SVG path parsing complexity (for AssetPath)

## Exit Criteria (to reach HIGH confidence)

- [ ] Curve representation decided (Bezier control points vs algorithmic)
- [ ] Topology storage location decided (IR asset vs inline)
- [ ] Sampling strategy decided (fixed vs adaptive)
- [ ] Block API sketched (inputs, outputs, params)
- [ ] Performance budget established (max control points, max samples)

## Architecture Alignment

This maps cleanly to existing Oscilla architecture:

| Path Concept | Oscilla Concept |
|--------------|-----------------|
| Static topology | cardinality: zero (compile-time) |
| Control point collection | InstanceDecl with DOMAIN_CONTROL |
| Per-point position | Field<vec2> with control instance |
| Per-point modulation | Field<float> with same instance |
| Interpolated samples | FieldExprLayout with path-topology |
| Tangent/normal | Computed fields from path materializer |

## Dependencies

- Sprint: shape-fundamentals (establishes shape encoding pattern)

## Risks

| Risk | Mitigation |
|------|------------|
| Topology changes break continuity | Use existing continuityMapBuild for domain changes |
| Path interpolation performance | Pre-compute in materializer, not renderer |
| SVG parsing complexity | Start with procedural paths only |
