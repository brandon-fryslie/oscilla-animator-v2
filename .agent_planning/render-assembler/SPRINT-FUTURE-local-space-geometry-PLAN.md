# Sprint: local-space-geometry - Control Points in Local Space
Generated: 2026-01-21T21:15:00Z
Confidence: LOW
Status: DEFERRED - EXPLORATION REQUIRED

## Sprint Goal
Implement local-space geometry where control points are centered at origin and instance transforms applied at render time.

## Current Understanding
Currently:
- Some kernels output local-space points (polygonVertex: centered at origin)
- Some output world-space (circleLayout: [0,1] centered at 0.5, 0.5)
- Renderer scales control points by viewport dimensions

Target architecture (from future-types.ts):
- All geometry in local space, |p| ≈ O(1)
- Instance transforms: position, size, rotation, scale2
- Renderer applies transforms: translate → rotate → scale → draw

## Major Unknowns
1. **Kernel changes**: Which kernels need updating?
   - Impact: polygonVertex OK, circleLayout needs change, others?
2. **Backward compatibility**: Existing patches expect current behavior
   - Impact: Could break visual output
3. **Transform order**: Is translate → rotate → scale correct for all cases?
   - Impact: Incorrect order = wrong visuals

## Exploration Options

### Option A: All Kernels Output Local Space
| Aspect | Assessment |
|--------|------------|
| Complexity | High |
| Risk | High |
| Pros | Clean architecture, consistent behavior |
| Cons | Many kernels to update, breaking change |

### Option B: New "Local" Kernel Variants
| Aspect | Assessment |
|--------|------------|
| Complexity | Medium |
| Risk | Low |
| Pros | Non-breaking, gradual migration |
| Cons | Duplicated kernels, more surface area |

## Questions for User
1. Is local-space geometry a priority for current use cases?
2. Which shapes/layouts are used most frequently?
3. Acceptable to break existing patch visuals during migration?

## Exit Criteria (to reach MEDIUM confidence)
- [ ] Full kernel audit complete
- [ ] Migration strategy chosen
- [ ] Transform order validated

## Dependencies
Depends on: render-ir-v2 (v2 format supports InstanceTransforms)

## Rationale for Deferral
Current world-space approach works for basic cases. This is an optimization for future extensibility.
