# Deferred Work: RenderAssembler v2

**Parent Bead**: oscilla-animator-v2-583
**Created**: 2026-01-22

## Summary

The following work items were explicitly deferred from oscilla-animator-v2-583 to keep the initial implementation focused and non-breaking. Each item now has its own bead for tracking.

## Deferred Items

### 1. Renderer Changes (oscilla-animator-v2-46m)
- **Status**: Already tracked
- **Priority**: P1
- **Description**: Apply instance transforms instead of width/height scaling
- **Dependency**: Blocked by this bead (oscilla-animator-v2-583)

### 2. Per-instance Shapes (oscilla-animator-v2-f2w)
- **Status**: Created 2026-01-22
- **Priority**: P2
- **Description**: Support Field<shape> for different shapes per instance
- **Dependency**: Blocked by this bead

### 3. Stroke Rendering (oscilla-animator-v2-02h)
- **Status**: Created 2026-01-22
- **Priority**: P2
- **Description**: Full stroke support (width, join, cap, dash)
- **Dependency**: Blocked by this bead

### 4. SVG Renderer (oscilla-animator-v2-0uk)
- **Status**: Already tracked
- **Priority**: P3
- **Description**: SVG renderer with defs/use geometry reuse
- **Dependency**: Blocked by this bead + renderer migration

### 5. Numeric Topology IDs (oscilla-animator-v2-4h6)
- **Status**: Created 2026-01-22
- **Priority**: P3
- **Description**: Convert TopologyId from string to number
- **Dependency**: Blocked by this bead

### 6. Remove v1 Code Path (oscilla-animator-v2-ry2)
- **Status**: Created 2026-01-22
- **Priority**: P4
- **Description**: Cleanup after full v2 migration
- **Dependency**: Blocked by this bead + renderer migration

## Dependency Graph

```
oscilla-animator-v2-583 (RenderAssembler v2)
├── oscilla-animator-v2-46m (Renderer migration)
│   ├── oscilla-animator-v2-4lm (Size parameter)
│   ├── oscilla-animator-v2-qch (Default radius)
│   └── oscilla-animator-v2-ry2 (Remove v1 code)
├── oscilla-animator-v2-f2w (Per-instance shapes)
├── oscilla-animator-v2-02h (Stroke rendering)
├── oscilla-animator-v2-4h6 (Numeric topology IDs)
└── oscilla-animator-v2-0uk (SVG renderer)
```

## Recommended Implementation Order

1. **oscilla-animator-v2-583** - This bead (v2 assembly) ← CURRENT
2. **oscilla-animator-v2-46m** - Renderer migration to use v2
3. **oscilla-animator-v2-4h6** - Numeric topology IDs (can parallel with #2)
4. **oscilla-animator-v2-02h** - Stroke rendering
5. **oscilla-animator-v2-f2w** - Per-instance shapes
6. **oscilla-animator-v2-0uk** - SVG renderer
7. **oscilla-animator-v2-ry2** - v1 cleanup (last, after all migrations)

## Notes

- All deferred items are now tracked as beads with proper dependencies
- The parent bead (oscilla-animator-v2-583) is blocking multiple downstream items
- Completing this bead unblocks significant render pipeline improvements
