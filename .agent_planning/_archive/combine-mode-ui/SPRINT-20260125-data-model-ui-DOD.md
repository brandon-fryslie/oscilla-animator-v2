# Definition of Done: data-model-ui

**Sprint:** Combine Mode Data Model and Port Inspector UI
**Generated:** 2026-01-25

## Functional Criteria

- [ ] Input port inspector shows "Combine Mode" dropdown
- [ ] Dropdown shows only valid modes for the port's type (e.g., color shows last/first/layer only)
- [ ] Selecting a combine mode updates the patch
- [ ] Combine mode persists after page reload (serialized correctly)
- [ ] Output ports do NOT show combine mode control

## Technical Criteria

- [ ] `InputPort` interface has `combineMode?: CombineMode` field
- [ ] `PatchStore.updateInputPort()` handles combineMode updates
- [ ] TypeScript compiles without errors related to combineMode
- [ ] Undefined combineMode treated as 'last' (default)

## Verification Method

1. Open app, select a block with inputs
2. Click on an input port to open port inspector
3. Verify "Combine Mode" dropdown appears
4. Verify dropdown shows type-appropriate options:
   - Float port: sum, average, max, min, mul, last, first
   - Color port: last, first, layer
   - Bool port: last, first, or, and
5. Change combine mode and reload page
6. Verify selection persisted

## Out of Scope

- Graph editor visual dimming (Sprint 2)
- Compiler reading combineMode from port (needs verification, may be follow-up)
