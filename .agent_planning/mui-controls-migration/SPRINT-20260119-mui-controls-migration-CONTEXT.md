# Implementation Context: mui-controls-migration

## Key Files

### To Create (Common Components)
- `src/ui/components/common/NumberInput.tsx`
- `src/ui/components/common/TextInput.tsx`
- `src/ui/components/common/SelectInput.tsx`
- `src/ui/components/common/CheckboxInput.tsx`
- `src/ui/components/common/ColorInput.tsx`
- `src/ui/components/common/index.ts` (barrel export)

### To Modify
- `src/ui/components/BlockInspector.tsx` - Major migration (lines 1098-1290)
- `src/ui/components/app/Toolbar.tsx` - Button migration (lines 56-96)
- `src/ui/components/app/Tabs.tsx` - Tab buttons (lines 56-87)
- `src/ui/components/app/DiagnosticConsole.tsx` - Filter buttons (lines 175-191)
- `src/ui/components/app/ContinuityControls.tsx` - Action buttons (lines 116-149)
- `src/ui/components/BlockLibrary.tsx` - Clear button (lines 197-204)
- `src/ui/reactFlowEditor/ReactFlowEditor.tsx` - Auto-arrange button (lines 350-356)
- `src/ui/components/InspectorContainer.tsx` - Back button (lines 63-69)

### Reference Files
- `src/ui/theme.ts` - Dark theme with MUI component overrides
- `src/ui/components/common/SliderWithInput.tsx` - Reference implementation
- `src/ui/components/ConnectionMatrix.tsx` - MUI DataGrid usage example

## Existing Theme Configuration (theme.ts)

```typescript
// Already configured in theme.ts:
MuiSlider: { root: { color: colors.primary }, thumb: { width: 14, height: 14 } }
MuiTextField: { outlined input with borderColor: colors.border }
MuiButton: { textTransform: 'none', borderRadius: 4 }
MuiIconButton: { borderRadius: 4, padding: 6 }
MuiSelect: { root: { borderRadius: 4 } }
MuiMenuItem: { hover: bgHover, selected: primary with opacity }
```

## BlockInspector Structure

The inspector has these key components to migrate:

### HintedControl (lines 1088-1145)
Switch on `hint` type:
- `'select'` → `<select>` with options
- `'boolean'` → `<input type="checkbox">`
- `'color'` → `<input type="color">`
- `'int'` → `<NumberInput>` (custom wrapper)
- default → `<NumberInput>` (custom wrapper)

### Custom Wrapper Components (to replace)
```typescript
// TextInput (1206-1235) - replace with MUI
function TextInput({ value, onChange, ... }) {
  // Native <input type="text">
}

// NumberInput (1160-1197) - replace with MUI
function NumberInput({ value, onChange, min, max, ... }) {
  // Native <input type="number">
}

// SliderControl (1246-1262) - replace with SliderWithInput
function SliderControl({ value, onChange, min, max, step }) {
  // Native <input type="range">
}
```

### Style Constants to Remove (1269-1287)
```typescript
const inputStyle = { ... }  // → Use MUI TextField
const selectStyle = { ... } // → Use MUI Select
```

## Component Interface Patterns

### NumberInput
```typescript
interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  helperText?: string;
  disabled?: boolean;
  size?: 'small' | 'medium';
  unit?: string;
}
```

### TextInput
```typescript
interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
  size?: 'small' | 'medium';
}
```

### SelectInput
```typescript
interface SelectInputProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label?: string;
  helperText?: string;
  disabled?: boolean;
  size?: 'small' | 'medium';
}
```

### CheckboxInput
```typescript
interface CheckboxInputProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}
```

### ColorInput
```typescript
interface ColorInputProps {
  value: string; // hex color
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}
```

## Button Migration Patterns

### Standard Button
```tsx
// Before
<button onClick={...} style={{...}}>Text</button>

// After
<Button variant="text" onClick={...}>Text</Button>
<Button variant="outlined" onClick={...}>Text</Button>
<Button variant="contained" onClick={...}>Text</Button>
```

### Icon Button
```tsx
// Before
<button onClick={...}>×</button>

// After
<IconButton size="small" onClick={...}>
  <CloseIcon />
</IconButton>
```

### Toggle Button (DiagnosticConsole filters)
```tsx
// Before
<button style={{ background: active ? '#color' : 'transparent' }}>filter</button>

// After
<ToggleButtonGroup value={filters} onChange={...}>
  <ToggleButton value="info">Info</ToggleButton>
  <ToggleButton value="warn">Warn</ToggleButton>
</ToggleButtonGroup>
```

## Commit Strategy

1. `feat(ui): Create reusable NumberInput component`
2. `feat(ui): Create reusable TextInput component`
3. `feat(ui): Create reusable SelectInput component`
4. `feat(ui): Create reusable CheckboxInput and ColorInput components`
5. `refactor(ui): Migrate BlockInspector to MUI components`
6. `refactor(ui): Migrate Toolbar buttons to MUI Button`
7. `refactor(ui): Migrate tab navigation to MUI`
8. `refactor(ui): Migrate DiagnosticConsole filters to MUI ToggleButton`
9. `refactor(ui): Migrate remaining buttons to MUI`
10. `chore(ui): Remove unused wrapper components and styles`

## Notes

### Color Picker
MUI doesn't have a native color picker. Options:
1. Keep native `<input type="color">` with MUI-like wrapper styling
2. Use third-party: `mui-color-input` or `react-colorful`
3. Build custom with Popover + color swatches

**Recommendation**: Option 1 (keep native) for simplicity, wrap with styled Box.

### Tab Component Choice
Options:
1. Keep custom Tab buttons with MUI Button
2. Use MUI Tabs/Tab components

**Recommendation**: Use MUI Tabs for proper tab semantics and styling, but this may require more refactoring if the current tabs have custom behavior.

### ThemeProvider Location
Current state: ThemeProvider used per-component (ContinuityControls, ConnectionMatrix).

**Recommendation**: Move to App level to avoid nesting and ensure all components inherit theme. Check if there's an App.tsx or main entry point.
