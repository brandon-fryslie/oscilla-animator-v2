# Definition of Done: unit-annotations

**Sprint**: Unit Annotation System
**Generated**: 2026-01-20T05:16:00

## Research Phase Exit Criteria

Before implementation can begin:

- [ ] Unit taxonomy documented (which units exist)
- [ ] Kernel signature format defined
- [ ] Validation insertion point chosen
- [ ] Auto-conversion policy decided
- [ ] All research tasks completed

## Implementation Acceptance Criteria

### Must Pass

- [ ] `NumericUnit` type exists with all required units
- [ ] `CanonicalType` accepts optional `unit` field
- [ ] At least sin/cos kernels have declared signatures
- [ ] Compiler validates unit compatibility (warning on mismatch)
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] No runtime performance regression

### Validation Behavior

- [ ] Phase connected to radians-expecting input → warning
- [ ] Float connected to phase-expecting input → warning
- [ ] Matching units → no warning
- [ ] No unit annotation → no warning (backwards compatible)

### Documentation

- [ ] Unit taxonomy documented in code comments
- [ ] Kernel signature format documented
- [ ] Migration guide for adding units to existing blocks

## Verification Steps

1. Create test patch with intentional unit mismatch
2. Verify warning is emitted during compilation
3. Fix mismatch, verify warning disappears
4. Run existing tests - all must pass
