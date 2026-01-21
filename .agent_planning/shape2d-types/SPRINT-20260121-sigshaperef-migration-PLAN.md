# Sprint: sigshaperef-migration - sigShapeRef Packed Output Migration
Generated: 2026-01-21
Confidence: LOW → DEFERRED
Status: RESEARCH COMPLETE - REQUIRES LARGER REFACTOR

## Research Findings (2026-01-21)

### Current State
- Shapes are **never materialized to slots** - they're reconstructed each frame
- sigShapeRef produces SigExprShapeRef with `topologyId + paramSignals[]`
- RenderAssembler evaluates param signals on-the-fly in `resolveShape()`
- No dedicated shape evaluation schedule step exists

### Required Changes (Larger Than Anticipated)

1. **Create new StepMaterializeShape schedule step**
   - Evaluate all paramSignals into packed array
   - Write to shape2d storage slot

2. **Update IRBuilder/IRBuilderImpl**
   - Add `stepMaterializeShape()` to schedule shape evaluation
   - Allocate shape2d slots via `allocValueSlot(shape2dType)`

3. **Update ScheduleExecutor**
   - Add case for StepMaterializeShape
   - Handle shape2d storage in slot writes

4. **Update RenderAssembler**
   - Read pre-packed shape2d from slot instead of evaluating signals
   - Unpack params from binary format
   - Bypass current on-the-fly signal evaluation

### Decision: DEFER

This work is deferred because:
1. The packed shape2d bank infrastructure is now in place (Sprint 2)
2. Current shape handling works correctly (just not packed)
3. The migration requires schedule system changes beyond scope
4. Can be done incrementally when shape performance becomes critical

### What Was Completed
- [x] Packed shape2d storage bank added to RuntimeState
- [x] Shape2DWord enum and pack/unpack utilities created
- [x] Compiler routes 'shape' payload to 'shape2d' storage kind
- [x] Storage infrastructure ready for future use

### Future Work (oscilla-animator-v2-1y8.5, 1y8.6)
- Create StepMaterializeShape schedule step
- Update sigShapeRef to emit shape materialization
- Update RenderAssembler to read packed shapes
