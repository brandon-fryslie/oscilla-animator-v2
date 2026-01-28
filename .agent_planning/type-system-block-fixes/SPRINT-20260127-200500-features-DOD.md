# Definition of Done: features Sprint

**Sprint**: Stroke Rendering and Signal Swizzle
**Generated**: 2026-01-27-200500

## Completion Checklist

### Stroke Rendering
- [ ] `buildPathStyle()` includes strokeColor and strokeWidth
- [ ] Canvas2DRenderer draws strokes correctly
- [ ] At least one demo shows stroke rendering
- [ ] Tests verify stroke rendering path

### Signal Swizzle (if needed)
- [ ] Multi-component swizzle errors removed or deferred with ticket
- [ ] No regressions in single-component extraction
- [ ] If implemented: test coverage for vec2, vec3, color swizzle

### Quality
- [ ] No TypeScript errors
- [ ] All existing tests pass
- [ ] Performance not regressed (strokes don't break hot loop)

## Out of Scope

- Full path-as-value redesign
- Per-element state blocks
- Complete swizzle DSL overhaul
