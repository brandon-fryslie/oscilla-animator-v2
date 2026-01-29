# Definition of Done: ui-indicators Sprint

## Acceptance Criteria

### Functional Requirements

- [ ] Input ports display visual indicator when they have a default source
- [ ] Indicator distinguishes between constant defaults and rail defaults
- [ ] Hovering a port with default shows the default value/rail in a tooltip
- [ ] No separate `_ds_*` blocks visible in the patch editor
- [ ] Edges to default source blocks are not visible in editor

### Visual Requirements

- [ ] Indicator is small and unobtrusive (does not obscure port)
- [ ] Indicator uses consistent color/iconography with rest of UI
- [ ] Tooltip is readable and appropriately positioned

### Technical Requirements

- [ ] No new dependencies introduced
- [ ] Implementation uses existing block registry data
- [ ] No performance regression in editor rendering

## Verification Steps

1. Open patch with GridLayout block (has multiple default sources)
2. Verify: Input ports show indicators
3. Hover port: Verify tooltip shows default value
4. Add edge to port: Verify rendering still correct
5. Check console: No errors related to default sources

## Not In Scope

- Per-instance default customization (future sprint)
- Editing defaults from UI (future sprint)
- Patch format changes (separate sprint)
