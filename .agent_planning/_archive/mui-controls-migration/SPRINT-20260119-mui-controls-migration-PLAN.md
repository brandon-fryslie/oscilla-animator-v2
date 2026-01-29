# Sprint: mui-controls-migration - Application-Wide MUI Controls

Generated: 2026-01-19
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Standardize all UI controls across the application to use Material UI components, replacing native HTML inputs, selects, checkboxes, and buttons. This creates visual consistency, improves accessibility, and leverages the existing dark theme configuration.

## Current State Analysis

### Native Controls Found (to migrate)

| Component | File | Control Type | Count |
|-----------|------|--------------|-------|
| BlockInspector | BlockInspector.tsx | `<input type="text">` | 1 |
| BlockInspector | BlockInspector.tsx | `<input type="number">` | 4+ |
| BlockInspector | BlockInspector.tsx | `<input type="range">` | 1 |
| BlockInspector | BlockInspector.tsx | `<input type="checkbox">` | 1 |
| BlockInspector | BlockInspector.tsx | `<input type="color">` | 1 |
| BlockInspector | BlockInspector.tsx | `<select>` | 1 |
| Toolbar | Toolbar.tsx | `<button>` | 3 |
| Tabs | Tabs.tsx | `<button>` | multiple |
| DiagnosticConsole | DiagnosticConsole.tsx | `<button>` | 5+ |
| BlockLibrary | BlockLibrary.tsx | `<button>` | 1 |
| ContinuityControls | ContinuityControls.tsx | `<button>` | 2 |
| ReactFlowEditor | ReactFlowEditor.tsx | `<button>` | 1 |

### Already Using MUI
- `SliderWithInput` component (Slider + TextField)
- Test Pulse button in ContinuityControls (Button)
- ConnectionMatrix (DataGrid, ThemeProvider)
- Theme configuration in `src/ui/theme.ts`

## Work Items

### P0: Create Reusable MUI Control Components

Create a library of reusable form controls that wrap MUI components with consistent styling.

#### P0.1: NumberInput Component
**File**: `src/ui/components/common/NumberInput.tsx`

**Acceptance Criteria:**
- [ ] MUI TextField with `type="number"`
- [ ] Props: `value`, `onChange`, `min`, `max`, `step`, `label`, `helperText`, `disabled`
- [ ] Handles blur validation and Enter key commit
- [ ] Clamps values to min/max range
- [ ] Compact size variant for panel use
- [ ] Optional unit label suffix

#### P0.2: TextInput Component
**File**: `src/ui/components/common/TextInput.tsx`

**Acceptance Criteria:**
- [ ] MUI TextField with outlined variant
- [ ] Props: `value`, `onChange`, `label`, `placeholder`, `helperText`, `disabled`
- [ ] Handles blur and Enter key commit
- [ ] Compact size variant for panel use

#### P0.3: SelectInput Component
**File**: `src/ui/components/common/SelectInput.tsx`

**Acceptance Criteria:**
- [ ] MUI Select with FormControl wrapper
- [ ] Props: `value`, `onChange`, `options`, `label`, `helperText`, `disabled`
- [ ] Options as `{value: string, label: string}[]`
- [ ] Compact size for panel use
- [ ] Dark theme styling

#### P0.4: CheckboxInput Component
**File**: `src/ui/components/common/CheckboxInput.tsx`

**Acceptance Criteria:**
- [ ] MUI Checkbox with FormControlLabel
- [ ] Props: `checked`, `onChange`, `label`, `disabled`
- [ ] Uses theme primary color
- [ ] Compact layout

#### P0.5: ColorInput Component
**File**: `src/ui/components/common/ColorInput.tsx`

**Acceptance Criteria:**
- [ ] Native `<input type="color">` wrapped with MUI styling
- [ ] MUI doesn't have color picker - native is acceptable
- [ ] Props: `value`, `onChange`, `label`, `disabled`
- [ ] Styled to match MUI TextField appearance
- [ ] Optional: integrate with MUI InputAdornment for preview swatch

### P1: Migrate BlockInspector Controls

**File**: `src/ui/components/BlockInspector.tsx`

This is the largest migration - the inspector has custom wrapper components that need replacement.

**Acceptance Criteria:**
- [ ] Replace `TextInput` wrapper with MUI `TextInput` component
- [ ] Replace `NumberInput` wrapper with MUI `NumberInput` component
- [ ] Replace `SliderControl` wrapper with `SliderWithInput` component
- [ ] Replace native checkbox with `CheckboxInput` component
- [ ] Replace native select with `SelectInput` component
- [ ] Update `ColorInput` with styled wrapper
- [ ] Remove old wrapper components (lines 1160-1290)
- [ ] Wrap inspector in ThemeProvider if not already
- [ ] Verify all parameter types still work correctly

**Technical Notes:**
- BlockInspector has a `HintedControl` component that switches on param type
- Need to maintain the same onChange callback patterns
- The existing wrappers have debounce/blur behavior that must be preserved

### P2: Migrate Button Components

#### P2.1: Toolbar Buttons
**File**: `src/ui/components/app/Toolbar.tsx`

**Acceptance Criteria:**
- [ ] Replace native buttons with MUI Button
- [ ] Use `variant="text"` for toolbar style
- [ ] Add proper icons if desired
- [ ] Maintain existing layout/spacing

#### P2.2: Tab Navigation
**File**: `src/ui/components/app/Tabs.tsx`

**Acceptance Criteria:**
- [ ] Replace native buttons with MUI Button or Tab components
- [ ] Consider using MUI Tabs component for proper tab behavior
- [ ] Maintain active/inactive visual states
- [ ] Preserve click handlers

#### P2.3: DiagnosticConsole Filter Buttons
**File**: `src/ui/components/app/DiagnosticConsole.tsx`

**Acceptance Criteria:**
- [ ] Replace filter buttons with MUI ToggleButton or Chip
- [ ] ToggleButtonGroup for mutually exclusive options
- [ ] Or Chip with `clickable` and `color` props for tags
- [ ] Maintain filter state logic

#### P2.4: ContinuityControls Action Buttons
**File**: `src/ui/components/app/ContinuityControls.tsx`

**Acceptance Criteria:**
- [ ] Replace "Reset to Defaults" with MUI Button
- [ ] Replace "Clear State" with MUI Button (warning color)
- [ ] Consistent with existing Test Pulse button style

#### P2.5: Other Buttons
**Files**: `BlockLibrary.tsx`, `ReactFlowEditor.tsx`, `InspectorContainer.tsx`

**Acceptance Criteria:**
- [ ] Replace search clear button with MUI IconButton
- [ ] Replace auto-arrange button with MUI Button
- [ ] Replace back buttons with MUI IconButton

### P3: Add ThemeProvider Wrappers

Ensure all components using MUI are wrapped in ThemeProvider.

**Acceptance Criteria:**
- [ ] Audit all files using MUI components
- [ ] Add ThemeProvider at appropriate level (App root or per-panel)
- [ ] Avoid ThemeProvider nesting (performance)
- [ ] Consider single ThemeProvider at App level

### P4: Cleanup and Polish

**Acceptance Criteria:**
- [ ] Remove unused style constants from BlockInspector
- [ ] Remove old wrapper component code
- [ ] Ensure consistent spacing across all controls
- [ ] Test dark theme appearance
- [ ] Verify accessibility (keyboard navigation, focus states)

## Dependencies

- MUI already installed (`@mui/material: ^7.3.7`)
- Dark theme configured in `src/ui/theme.ts`
- `SliderWithInput` as reference implementation

## Risks

| Risk | Mitigation |
|------|------------|
| Visual regression | Test each component visually in context |
| Behavior changes | Preserve blur/commit patterns from existing code |
| Performance | Avoid unnecessary ThemeProvider nesting |
| Breaking inspector | Thorough testing of all parameter types |

## Testing

1. **Build**: `npm run typecheck` passes after each work item
2. **Unit Tests**: Existing tests still pass
3. **Manual**: Each control type works correctly
4. **Visual**: Dark theme styling consistent
5. **A11y**: Keyboard navigation works

## Success Criteria

- All native HTML form controls replaced with MUI equivalents
- Consistent visual appearance across entire app
- Reusable component library in `src/ui/components/common/`
- No functionality regressions
- Theme applied consistently

## Estimated Effort

- P0 (Control Components): 2 hours
- P1 (BlockInspector): 2 hours
- P2 (Buttons): 1.5 hours
- P3 (ThemeProvider): 0.5 hours
- P4 (Cleanup): 0.5 hours

Total: ~6.5 hours
