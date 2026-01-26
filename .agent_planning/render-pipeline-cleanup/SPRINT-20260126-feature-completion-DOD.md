# Definition of Done: feature-completion Sprint

## Completion Criteria

### ms5.15: Wire rotation and scale2

- [ ] `src/blocks/render-blocks.ts` RenderInstances2D has `rotation` input
- [ ] `src/blocks/render-blocks.ts` RenderInstances2D has `scale2` input
- [ ] Block `lower()` function emits `rotationSlot` when rotation connected
- [ ] Block `lower()` function emits `scale2Slot` when scale2 connected
- [ ] Test: Patch with rotation input compiles successfully
- [ ] Test: Runtime produces correct rotated output
- [ ] `npm run test` passes

### ms5.14: Fix StepRender optionality

- [ ] Runtime behavior documented or types updated
- [ ] No mismatch between IR type optionality and runtime requirements
- [ ] If changed: All StepRender emission sites updated
- [ ] `npm run typecheck` passes

### ms5.13: Golden angle turns parameter

- [ ] `fieldGoldenAngle` accepts `turns` parameter
- [ ] Default value is 50 (backward compatible)
- [ ] Test: `fieldGoldenAngle(n, 100)` produces different pattern than `fieldGoldenAngle(n, 50)`
- [ ] `npm run test` passes

### ms5.17: PureFn 'expr' kind

- [ ] `applyPureFn` case 'expr' implemented (not throwing)
- [ ] Test: Expression `x * 2` evaluates correctly
- [ ] `npm run test` passes

## Verification Commands

```bash
# Check rotation/scale2 in render blocks
grep -n "rotation\|scale2" src/blocks/render-blocks.ts

# Check PureFn expr implementation
grep -A5 "case 'expr'" src/runtime/SignalEvaluator.ts

# Run tests
npm run test

# Type check
npm run typecheck
```

## Exit Criteria

Sprint complete when:
1. All acceptance criteria checked
2. All tests pass
3. Beads ms5.13, ms5.14, ms5.15, ms5.17 can be closed
