# Definition of Done: mui-controls-migration

Sprint: Application-Wide MUI Controls Migration
Generated: 2026-01-19

## Functional Acceptance Criteria

### Reusable Components Created
1. [ ] `NumberInput` component at `src/ui/components/common/NumberInput.tsx`
2. [ ] `TextInput` component at `src/ui/components/common/TextInput.tsx`
3. [ ] `SelectInput` component at `src/ui/components/common/SelectInput.tsx`
4. [ ] `CheckboxInput` component at `src/ui/components/common/CheckboxInput.tsx`
5. [ ] `ColorInput` component at `src/ui/components/common/ColorInput.tsx`

### BlockInspector Migration
6. [ ] Text parameters use MUI TextInput
7. [ ] Numeric parameters use MUI NumberInput
8. [ ] Slider parameters use SliderWithInput
9. [ ] Boolean parameters use MUI CheckboxInput
10. [ ] Select/enum parameters use MUI SelectInput
11. [ ] Color parameters use styled ColorInput
12. [ ] All parameter types still function correctly

### Button Migration
13. [ ] Toolbar buttons use MUI Button
14. [ ] Tab navigation uses MUI Button or Tabs
15. [ ] DiagnosticConsole filter buttons use MUI ToggleButton or Chip
16. [ ] ContinuityControls action buttons use MUI Button
17. [ ] Search clear button uses MUI IconButton
18. [ ] Auto-arrange button uses MUI Button
19. [ ] Back buttons use MUI IconButton

### Theme Integration
20. [ ] ThemeProvider wraps MUI components appropriately
21. [ ] Dark theme applied consistently to all controls
22. [ ] No ThemeProvider nesting (single provider preferred)

## Technical Acceptance Criteria

1. [ ] All new components use TypeScript with proper interfaces
2. [ ] Components handle edge cases (empty, invalid, out-of-range)
3. [ ] Blur/commit behavior preserved from original implementations
4. [ ] No TypeScript errors (`npm run typecheck`)
5. [ ] No runtime errors in console
6. [ ] Old wrapper components removed from BlockInspector
7. [ ] Unused style constants removed

## Testing Criteria

1. [ ] Manual: Edit text parameter in inspector → value saves correctly
2. [ ] Manual: Edit number parameter → validates min/max
3. [ ] Manual: Drag slider → value updates live
4. [ ] Manual: Toggle checkbox → state changes
5. [ ] Manual: Select dropdown → selection applies
6. [ ] Manual: Click toolbar buttons → actions trigger (if wired)
7. [ ] Manual: Click tab buttons → panels switch
8. [ ] Manual: Click filter buttons → logs filter
9. [ ] Build: `npm run typecheck` passes
10. [ ] Tests: `npm test` passes (no regressions)

## Visual Acceptance Criteria

1. [ ] All controls use dark theme colors
2. [ ] Consistent spacing between controls
3. [ ] Value labels visible on sliders
4. [ ] Focus states visible (keyboard navigation)
5. [ ] Hover states on buttons
6. [ ] No visual regression from current appearance

## Verification Steps

1. Open http://localhost:5174
2. Select a block in the editor
3. Verify BlockInspector shows MUI-styled controls
4. Edit each parameter type (text, number, slider, checkbox, select, color)
5. Verify toolbar buttons have MUI styling
6. Switch between tabs - verify MUI styling
7. Open DiagnosticConsole - verify filter buttons styled
8. Open Continuity panel - verify all controls consistent
9. Check browser console - no errors
10. Run `npm run typecheck` - no errors
11. Run `npm test` - all pass

## Exit Criteria

- All functional criteria checked
- All technical criteria checked
- All testing criteria checked
- All visual criteria checked
- Verification steps completed without issues
- Code committed and pushed
