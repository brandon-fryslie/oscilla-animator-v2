# Runtime Findings: Dockview Integration

**Scope:** dockview-integration  
**Last Updated:** 2026-01-15T18:40:47  
**Confidence:** FRESH

## Critical Integration Requirements

### Dockview CSS Import (REQUIRED)
**Status:** Missing in initial implementation

The dockview library REQUIRES importing base CSS before use:
```typescript
import 'dockview/dist/styles/dockview.css';
```

**Location:** Must be imported in DockviewProvider.tsx or main entry point

**Impact if missing:**
- Layout structure will not render
- Tabs will not display
- Split view separators missing
- Visual layout completely broken

**Source:** `/node_modules/dockview/README.md`

### Dockview Theme Class (REQUIRED)
**Status:** Missing in initial implementation

A dockview theme class MUST be applied to a containing element:
```html
<body class="dockview-theme-dark">
```

or

```html
<div class="dockview-theme-light">
```

**Available themes:**
- `dockview-theme-dark`
- `dockview-theme-light`

**Impact if missing:**
- Theme CSS variables won't apply
- Colors, hover states, focus indicators broken
- Custom theme.css won't work correctly

**Source:** `/node_modules/dockview/README.md`

## Verified Working Patterns

### Panel Registry Structure
10 panels organized by group:
- left-top: Library
- left-bottom: Inspector
- center (tabbed): Blocks, Matrix, Rete, Flow, Preview
- right-top: Domains
- right-bottom: Help
- bottom: Console

### Panel Wrapper Pattern
```typescript
import type { IDockviewPanelProps } from 'dockview';

export const SomePanelWrapper: React.FC<IDockviewPanelProps> = () => {
  return <ActualComponent />;
};
```

For panels with callbacks:
```typescript
export const EditorPanel: React.FC<IDockviewPanelProps<{ 
  onEditorReady?: (handle: EditorHandle) => void 
}>> = ({ params }) => {
  return <Editor onEditorReady={params?.onEditorReady} />;
};
```

### Layout Creation Pattern
```typescript
// Add first panel (creates group)
api.addPanel({
  id: 'panel1',
  component: 'panel1',
  title: 'Panel 1',
});

// Add to same group as tabs
api.addPanel({
  id: 'panel2',
  component: 'panel2',
  title: 'Panel 2',
  position: { referencePanel: 'panel1' },
});

// Add to different group (positional)
api.addPanel({
  id: 'panel3',
  component: 'panel3',
  title: 'Panel 3',
  position: { 
    referencePanel: 'panel1', 
    direction: 'below' 
  },
});
```

## Testing Checklist

After CSS import and theme class are added:

1. Visual structure
   - [ ] 6 groups visible (left-top, left-bottom, center, right-top, right-bottom, bottom)
   - [ ] All 10 panels render
   - [ ] Tab headers visible in center group
   - [ ] Split view separators visible and draggable

2. Tab switching
   - [ ] Click Blocks tab → TableView renders
   - [ ] Click Matrix tab → ConnectionMatrix renders
   - [ ] Click Rete tab → ReteEditor renders
   - [ ] Click Flow tab → ReactFlowEditor renders
   - [ ] Click Preview tab → CanvasTab renders
   - [ ] Active tab indicator shows

3. Theme
   - [ ] Panel backgrounds: #0f0f23
   - [ ] Headers: #16213e
   - [ ] Borders: #0f3460
   - [ ] Active tab: #1a1a2e with #4ecdc4 bottom border
   - [ ] Tab hover effects work

4. Console
   - [ ] No errors in browser console
   - [ ] No warnings about missing CSS
   - [ ] No dockview initialization errors

## Known Issues to Check

1. Editor context switching - verify activePanel changes update EditorContext
2. Canvas ready callback - verify Preview panel calls onCanvasReady
3. Panel resize - verify dockview resize handles work
4. Tab drag/drop - out of scope for foundation sprint but should not error

## Integration Notes

### Dockview Version
Using dockview ^4.13.1 (unified package, includes React components)

### CSS Loading Order
1. Dockview base CSS (from node_modules)
2. Custom theme.css (local overrides)

Base CSS must load first or custom variables won't apply.

### Theme Customization Pattern
Custom theme.css uses CSS custom properties:
```css
.oscilla-dockview {
  --dv-group-view-background-color: #0f0f23;
  --dv-tabs-and-actions-container-background-color: #16213e;
  /* ... more overrides */
}
```

Applied via className on DockviewReact component.
