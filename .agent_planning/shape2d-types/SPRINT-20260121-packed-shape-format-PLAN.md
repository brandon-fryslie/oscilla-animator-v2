# Sprint: packed-shape-format - Packed Shape2D Storage Format
Generated: 2026-01-21
Confidence: MEDIUM
Status: RESEARCH REQUIRED

## Sprint Goal
Raise confidence to HIGH by researching the packed shape format implementation, then implement typed shape2d scalar bank storage.

## Known Elements
- RuntimeState has typed banks for f64/f32/i32/u32
- SlotMetaEntry defines storage kinds
- Shapes currently stored as JS objects in generic Map
- Target: 8-word Uint32Array packed format

## Unknowns to Resolve
1. **Slot allocation strategy** - How to allocate slots in shape2d bank vs object Map?
   - Research: Check how existing scalar banks handle allocation
2. **Backward compatibility** - Can we support both object and packed format during transition?
   - Research: Check if dual-path is feasible in RenderAssembler
3. **Field slot reference** - How to reference control points FieldSlot from packed format?
   - Research: Verify FieldSlot ID fits in u32

## Tentative Deliverables
- Shape2DWord enum defining packed record layout
- ScalarStorageKind extended with 'shape2d'
- RuntimeState.scalarsShape2D bank (Uint32Array)
- Pack/unpack utility functions

## Research Tasks
- [ ] Analyze existing scalar bank allocation in compiler
- [ ] Verify FieldSlot/TopologyId fit in u32
- [ ] Design dual-format support for transition period
- [ ] Determine if slot offset calculation needs changes

## Exit Criteria (to reach HIGH confidence)
- [ ] Slot allocation strategy confirmed
- [ ] Backward compatibility approach defined
- [ ] All packed field sizes verified
