# Definition of Done: patch-format Sprint

Updated: 2026-01-18T19:20:00 (raised to HIGH confidence)

## Acceptance Criteria

### Data Model (P0)

- [ ] Block interface includes `inputDefaults?: Readonly<Record<string, DefaultSource>>`
- [ ] PatchBuilder can accept input defaults when adding blocks
- [ ] No TypeScript errors in codebase

### Pass1 Behavior (P1)

- [ ] Pass1 checks `block.inputDefaults[input.id]` before registry
- [ ] Falls back to registry default when no instance override
- [ ] Derived blocks created correctly from both sources
- [ ] Existing patches compile without changes

### PatchStore API (P2)

- [ ] `updateBlockInputDefault(blockId, inputId, defaultSource)` method exists
- [ ] Method registered as MobX action
- [ ] Setting undefined clears the override (uses registry default)
- [ ] Setting a value creates/updates the override

### UI Indicators (P3)

- [ ] Input ports display indicator when default exists
- [ ] Indicator distinguishes constant from rail
- [ ] Hover shows tooltip with default value
- [ ] Indicator does not interfere with handle functionality

## Verification Steps

1. **Build Check**: `npm run typecheck` passes
2. **Unit Test**: Add test for pass1 with instance defaults
3. **Integration Test**:
   - Add block to patch
   - Set instance default via `updateBlockInputDefault()`
   - Compile - verify derived block uses instance default
4. **UI Check**:
   - Open patch in editor
   - Verify indicators on ports with defaults
   - Hover to verify tooltips

## Not In Scope

- Patch serialization to disk
- UI for editing defaults (could be future sprint)
- Migration of existing patches (none exist as files)
