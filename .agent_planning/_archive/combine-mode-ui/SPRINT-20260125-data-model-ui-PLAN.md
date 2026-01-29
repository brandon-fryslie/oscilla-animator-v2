# Sprint: data-model-ui - Combine Mode Data Model and Port Inspector UI

**Generated:** 2026-01-25
**Confidence:** HIGH: 3, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Add combineMode field to InputPort, create UI control in port inspector, and persist changes to patch.

## Scope

**Deliverables:**
1. Add `combineMode` field to `InputPort` interface
2. Update `PatchStore.updateInputPort()` to handle combineMode
3. Add combine mode dropdown to port inspector
4. Validation feedback for invalid mode/type combinations

## Work Items

### P0: Add combineMode to InputPort [HIGH]

**Acceptance Criteria:**
- [ ] `InputPort` interface in `src/graph/Patch.ts` has `combineMode?: CombineMode`
- [ ] Type imports updated
- [ ] Undefined combineMode defaults to 'last' (backward compatible)

**Technical Notes:**
- Location: `src/graph/Patch.ts:60-65`
- Add: `readonly combineMode?: CombineMode;`
- Import CombineMode from `../types`

### P1: Add combine mode dropdown to PortInspectorStandalone [HIGH]

**Acceptance Criteria:**
- [ ] Input ports show combine mode dropdown in port inspector
- [ ] Dropdown shows only valid modes for the port's payload type
- [ ] Changing dropdown updates the patch
- [ ] Current value reflects port's combineMode or 'last' default
- [ ] Output ports do NOT show combine mode (only inputs)

**Technical Notes:**
- Location: `src/ui/components/BlockInspector.tsx`, `PortInspectorStandalone` component
- Use existing `MuiSelectInput` component
- Filter options using `validateCombineMode()` from combine-utils
- Place between Signal Type and Default Source sections

### P2: Validation feedback [HIGH]

**Acceptance Criteria:**
- [ ] If user selects invalid mode (shouldn't happen with filtered dropdown), show error
- [ ] Dropdown options are dynamically filtered based on port's payload type
- [ ] Boolean ports only show: last, first, or, and
- [ ] Color ports only show: last, first, layer
- [ ] Numeric ports show all modes

**Technical Notes:**
- Use `validateCombineMode()` to filter options
- Pass `world: 'signal'` for most ports (config world handled separately if needed)

## Dependencies

- `validateCombineMode()` in `src/compiler/passes-v2/combine-utils.ts`
- Existing `MuiSelectInput` component
- Existing `PatchStore.updateInputPort()` method

## Risks

| Risk | Mitigation |
|------|------------|
| Compiler doesn't read combineMode from port | Verify compiler reads port.combineMode; may need follow-up |
| Serialization/migration | Default undefined = 'last' ensures backward compatibility |
