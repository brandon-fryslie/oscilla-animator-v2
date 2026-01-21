# Sprint: remove-legacy-shape-paths - Remove All Legacy Shape Encoding
Generated: 2026-01-21
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Remove all legacy numeric shape encoding and fallback paths. Make proper topology-based ShapeDescriptor the ONLY method for shape representation.

## Scope
**Deliverables:**
- Remove legacy numeric encoding (0=circle, 1=square) from resolveShapeFully
- Create DEFAULT_SHAPE constant as proper ShapeDescriptor
- Update resolveShape to use DEFAULT_SHAPE
- Make ArrayBufferView case throw explicit error (not implemented)
- Verify all tests pass
- Verify demos compile and render

## Work Items

### P0: Create DEFAULT_SHAPE constant
**Acceptance Criteria:**
- [ ] DEFAULT_SHAPE defined as ShapeDescriptor with topology 'ellipse'
- [ ] Default params use topology defaults (radiusX=1, radiusY=1)
- [ ] Exported from RenderAssembler

**Technical Notes:**
```typescript
export const DEFAULT_SHAPE: ShapeDescriptor = {
  topologyId: 'ellipse',
  params: { radiusX: 1, radiusY: 1 },
};
```

### P1: Update resolveShape to use DEFAULT_SHAPE
**Acceptance Criteria:**
- [ ] When shapeSpec is undefined, return DEFAULT_SHAPE (not 0)
- [ ] No numeric return from resolveShape

**Technical Notes:**
- Line 132: Change `return 0` to `return DEFAULT_SHAPE`

### P2: Remove legacy numeric encoding from resolveShapeFully
**Acceptance Criteria:**
- [ ] Remove `typeof shape === 'number'` branch (lines 209-229)
- [ ] Function only accepts ShapeDescriptor
- [ ] Type signature updated to remove `| number`

**Technical Notes:**
- The number case should never be reached after P1
- Make it throw if reached (defensive)

### P3: Make ArrayBufferView case explicit error
**Acceptance Criteria:**
- [ ] Per-particle shapes (ArrayBufferView) throw NotImplementedError
- [ ] Clear error message about feature not being supported yet
- [ ] No silent fallback to ellipse

**Technical Notes:**
- Lines 231-246: Replace fallback with throw
- Message: "Per-particle shapes (Field<shape>) not yet implemented"

### P4: Update function signatures
**Acceptance Criteria:**
- [ ] resolveShape return type: ShapeDescriptor | ArrayBufferView (no number)
- [ ] resolveShapeFully parameter type: ShapeDescriptor | ArrayBufferView (no number)

### P5: Verify tests and demos
**Acceptance Criteria:**
- [ ] All 657+ tests pass
- [ ] Build succeeds
- [ ] No TypeScript errors

## Dependencies
- None - this is cleanup of existing code

## Risks
- LOW: Some code may have depended on legacy numeric encoding
- Mitigation: Tests will catch any breakage
