# Sprint: buffer-stride - Update Position Buffer Tests for Projection Stride-2
Generated: 2026-01-24-214109
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260124-213847.md

## Sprint Goal
Update three test files to expect stride-2 screen-space positions instead of stride-3 world-space, aligning tests with the implemented projection behavior.

## Background

The projection system was added after these tests were written. The RenderAssembler now:
1. Transforms world-space vec3 positions (stride-3) to screen-space vec2 positions (stride-2)
2. Creates new output buffers (projection output is separate from world-space input)

The implementation is correct per `ProjectionOutput` interface at `src/runtime/RenderAssembler.ts:87-89`:
```typescript
export interface ProjectionOutput {
  /** Screen-space positions (Float32Array, stride 2, normalized [0,1]) */
  screenPosition: Float32Array;
  ...
}
```

## Scope

**Deliverables:**
- Updated `RenderAssembler.test.ts` - Fix reference equality assertion
- Updated `RenderAssembler-per-instance-shapes.test.ts` - Fix stride-3 to stride-2
- Updated `level1-vec3-data.test.ts` - Fix stride-3 buffer length expectation

**NOT in scope:**
- Steel-thread test failures (unrelated type system issue)
- Implementation changes (implementation is correct)

## Work Items

### [P0] Update RenderAssembler.test.ts Reference Equality Check
**Confidence**: HIGH
**Dependencies**: None
**Spec Reference**: N/A (test-only change)
**Status Reference**: EVALUATION-20260124-213847.md "Position Buffer Contract" section

#### Description
At line 231, the test uses `.toBe(positionBuffer)` which checks reference equality. After projection, the position is a new buffer (projection creates separate output arrays). The test should verify the buffer contains correct projected values instead.

The input buffer at line 171 is:
```typescript
const positionBuffer = new Float32Array([0.1, 0.2, 0.3, 0.4]); // 2 instances
```

This is stride-2 input (2 instances x 2 floats = 4 floats total). After orthographic projection with DEFAULT_CAMERA, values should be similar but in a new buffer.

#### Acceptance Criteria
- [ ] Line 231 no longer uses `.toBe()` reference equality check
- [ ] Test verifies position buffer is a Float32Array with correct length
- [ ] Test verifies projected position values are numerically reasonable (finite, in expected range)
- [ ] Test passes when run with `npm test RenderAssembler.test.ts`

#### Technical Notes
- The projection is orthographic with DEFAULT_CAMERA
- Input positions are in [0,1] normalized space
- Output positions remain in [0,1] normalized space after ortho projection
- Use `.toBeInstanceOf(Float32Array)` for type check
- Use `.toHaveLength(4)` for stride-2 x 2 instances

---

### [P0] Update RenderAssembler-per-instance-shapes.test.ts Stride Expectation
**Confidence**: HIGH
**Dependencies**: None
**Spec Reference**: N/A (test-only change)
**Status Reference**: EVALUATION-20260124-213847.md "Position Buffer Contract" section

#### Description
At lines 433-436 and 444-447, the test expects stride-3 vec3 positions with z values:
```typescript
expect(circleOp.instances.position).toEqual(new Float32Array([
  0.1, 0.1, 0, // instance 0 (vec3)
  0.4, 0.4, 0, // instance 3 (vec3)
]));
```

After projection, positions are stride-2 vec2 (screen-space, no z):
```typescript
expect(circleOp.instances.position).toEqual(new Float32Array([
  0.1, 0.1, // instance 0 (vec2)
  0.4, 0.4, // instance 3 (vec2)
]));
```

The input buffer at lines 375-380 uses stride-3 format, but output is stride-2.

#### Acceptance Criteria
- [ ] Lines 433-436 updated to expect stride-2 positions for circle instances (4 floats, not 6)
- [ ] Lines 444-447 updated to expect stride-2 positions for square instances (4 floats, not 6)
- [ ] All z values removed from expected position arrays
- [ ] Test passes when run with `npm test RenderAssembler-per-instance-shapes.test.ts`

#### Technical Notes
- Circle instances are at original positions (0.1, 0.1) and (0.4, 0.4)
- Square instances are at original positions (0.2, 0.2) and (0.3, 0.3)
- After ortho projection with DEFAULT_CAMERA, x/y values remain similar
- Use `toBeCloseTo` or reasonable tolerance if exact match fails

---

### [P0] Update level1-vec3-data.test.ts Buffer Length Expectation
**Confidence**: HIGH
**Dependencies**: None
**Spec Reference**: N/A (test-only change)
**Status Reference**: EVALUATION-20260124-213847.md "Position Buffer Contract" section

#### Description
At line 233, the test expects stride-3 buffer length:
```typescript
expect(position.length).toBe(N * 3); // 16 instances x 3 floats per position
```

After projection, the output is stride-2:
```typescript
expect(position.length).toBe(N * 2); // 16 instances x 2 floats per position
```

The entire test from lines 231-243 validates world-space z values, which no longer apply to projected output.

#### Acceptance Criteria
- [ ] Line 233 updated to expect `N * 2` (32 floats, not 48)
- [ ] Lines 236-242 z-value validation loop updated for stride-2 iteration
- [ ] Test verifies x,y values are finite (z is no longer present)
- [ ] Comment at line 231 updated to reflect stride-2 projected output
- [ ] Test passes when run with `npm test level1-vec3-data.test.ts`

#### Technical Notes
- N = 16 (instances from 4x4 grid layout)
- World-space z validation is no longer applicable after projection
- Only x,y need finite checks (stride-2 means no z component)
- Update loop to iterate by 2 instead of 3

## Dependencies

None - all three work items are independent and can be done in parallel.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Projection transforms x,y values unexpectedly | Low | Medium | Check ortho-kernel.ts projection math; values should remain in [0,1] |
| Other tests also expect stride-3 | Low | Low | Run full test suite after changes; evaluation found only these 3 |
| DEFAULT_CAMERA differs from expected | Low | Low | Verify camera config in test setup |
