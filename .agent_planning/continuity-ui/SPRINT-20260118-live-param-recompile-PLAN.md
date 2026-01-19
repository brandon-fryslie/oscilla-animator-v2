# Sprint: live-param-recompile - Live Parameter Editing with Recompile

Generated: 2026-01-18
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Enable live parameter editing that triggers recompile, allowing users to change Array count and see continuity in action.

## Scope

**Deliverables:**
1. Auto-recompile when block params change
2. Hot-swap program while preserving continuity state
3. Count slider for Array block with immediate visual feedback

## Work Items

### P0: Wire PatchStore param changes to recompile

**Acceptance Criteria:**
- [ ] Changing block params in BlockInspector triggers recompile
- [ ] Recompile is debounced (100-200ms) to avoid thrashing
- [ ] Errors during recompile are shown in LogPanel

**Technical Notes:**
- Add MobX reaction in main.ts watching `rootStore.patch.patch.blocks`
- Use `setTimeout`/`clearTimeout` for debounce
- Catch compile errors, log them, keep running old program

### P1: Preserve continuity state across recompile

**Acceptance Criteria:**
- [ ] RuntimeState.continuity survives program swap
- [ ] Existing targets maintain their gauge/slew buffers
- [ ] New targets are initialized cleanly

**Technical Notes:**
- Do NOT recreate RuntimeState on recompile
- Only resize buffers if slot count changes
- Keep continuity state intact

### P2: Add count slider to Array block

**Acceptance Criteria:**
- [ ] Array block definition has uiHint for count param
- [ ] Slider shows in BlockInspector when Array selected
- [ ] Slider range: 1-10000, step: 1

**Technical Notes:**
- Update Array block definition in registry
- Add `uiHint: { kind: 'slider', min: 1, max: 10000, step: 1 }`

## Dependencies

- BlockInspector (exists, working)
- PatchStore.updateBlockParams (exists)
- Compiler (exists)

## Risks

| Risk | Mitigation |
|------|------------|
| Compile errors break app | Catch errors, show in log, keep old program |
| Too many recompiles | Debounce param changes |
| Buffer size mismatch | Resize buffers when slot count differs |
