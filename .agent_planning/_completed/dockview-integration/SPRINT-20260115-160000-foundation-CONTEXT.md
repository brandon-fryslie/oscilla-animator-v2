# Implementation Context: foundation - Dockview Core Infrastructure
Generated: 2026-01-15T16:00:00

## Reference Skills

Use `/dockview-with-examples` skill for:
- Working code patterns
- Component usage examples
- API examples

Use `/dockview-api-only` skill for:
- Quick type lookups
- Method signatures
- Prop interfaces

## Key Dockview Concepts

### DockviewReact Component
```typescript
import { DockviewReact, DockviewReadyEvent } from 'dockview-react';

<DockviewReact
  className="oscilla-dockview"
  onReady={(event: DockviewReadyEvent) => {
    const api = event.api;
    // Build layout here
  }}
  components={panelComponents}
/>
```

### Panel Components Map
```typescript
// Components must be a map of string -> React component
const components = {
  'block-library': BlockLibraryPanel,
  'preview': PreviewPanel,
  // etc
};
```

### Panel Component Props
```typescript
interface IDockviewPanelProps<T = any> {
  api: DockviewPanelApi;        // Panel-specific API
  containerApi: DockviewApi;    // Container-level API
  params: T;                    // Custom params passed to panel
}
```

### Creating Groups and Panels
```typescript
// First group (becomes reference point)
const leftTop = api.addGroup({ id: 'left-top' });

// Add panel to group
api.addPanel({
  id: 'block-library',
  component: 'block-library',
  position: { referenceGroup: leftTop }
});

// Add group relative to another
const center = api.addGroup({
  id: 'center',
  position: { referenceGroup: leftTop, direction: 'right' }
});

// Add panel as tab in existing group
api.addPanel({
  id: 'table-view',
  component: 'table-view',
  position: { referenceGroup: center }
});
```

### Direction Values
- `'left'` - to the left of reference
- `'right'` - to the right of reference
- `'above'` - above reference
- `'below'` - below reference
- `'within'` - as tab in same group (default)

## Files to Reference

### Current Layout (to replicate)
- `src/ui/components/app/App.tsx` lines 163-247

### Current Theme Colors
From `public/index.html`:
```css
--bg-primary: #0f0f23
--bg-secondary: #16213e
--border-color: #0f3460
--text-primary: #eee
```

### Existing Components (no changes needed)
- `src/ui/components/block-library/BlockLibrary.tsx`
- `src/ui/components/block-inspector/BlockInspector.tsx`
- `src/ui/components/table-view/TableView.tsx`
- `src/ui/components/connection-matrix/ConnectionMatrix.tsx`
- `src/ui/editors/rete/ReteEditor.tsx`
- `src/ui/editors/reactflow/ReactFlowEditor.tsx`
- `src/ui/components/canvas/CanvasTab.tsx`
- `src/ui/components/domains/DomainsPanel.tsx`
- `src/ui/components/help/HelpPanel.tsx`
- `src/ui/components/diagnostic-console/DiagnosticConsole.tsx`

## Panel Wrapper Pattern

Components may need minimal wrapping to receive Dockview props:

```typescript
// src/ui/dockview/panels/BlockLibraryPanel.tsx
import { IDockviewPanelProps } from 'dockview-react';
import { BlockLibrary } from '../../components/block-library/BlockLibrary';

export const BlockLibraryPanel: React.FC<IDockviewPanelProps> = () => {
  // BlockLibrary doesn't need dockview props, just render it
  return <BlockLibrary />;
};
```

For components that DO need dockview API:
```typescript
export const PreviewPanel: React.FC<IDockviewPanelProps> = ({ api, containerApi }) => {
  const isFloating = api.group.api.location.type === 'floating';
  return <CanvasTab isFloating={isFloating} />;
};
```

## CSS Theme Variables

Dockview uses CSS custom properties. Key ones to set:

```css
.oscilla-dockview {
  /* Tab colors */
  --dv-activegroup-visiblepanel-tab-background-color: #1a1a2e;
  --dv-activegroup-hiddenpanel-tab-background-color: #16213e;
  --dv-inactivegroup-visiblepanel-tab-background-color: #0f0f23;
  --dv-inactivegroup-hiddenpanel-tab-background-color: #0f0f23;

  /* Tab text */
  --dv-activegroup-visiblepanel-tab-color: #eee;
  --dv-activegroup-hiddenpanel-tab-color: #888;

  /* Backgrounds */
  --dv-group-view-background-color: #0f0f23;
  --dv-tabs-and-actions-container-background-color: #16213e;

  /* Borders */
  --dv-tab-divider-color: #0f3460;
  --dv-separator-border: #0f3460;
}
```

## Design Decisions (Already Resolved)

1. **Layout persistence**: Global (not per-project) - defer to Sprint 2
2. **Sidebar layout**: Stacked AND tabbed (6 groups total)
3. **Floating panels**: Enabled by default (architecture only, UI later)
4. **Popout windows**: Architecture ready, implementation deferred

## Order of Implementation

1. Delete jspanel4 files (clean slate)
2. Remove jspanel4 from package.json
3. Remove jspanel4 from vite.config.ts
4. Remove jsPanel CSS from index.html
5. `npm install dockview dockview-react`
6. Create `src/ui/dockview/` directory
7. Create panelRegistry.ts
8. Create panel wrapper components
9. Create DockviewProvider.tsx
10. Create defaultLayout.ts
11. Create theme.css
12. Create hooks.ts
13. Create index.ts (exports)
14. Update App.tsx to use DockviewProvider
15. Test and iterate on layout/sizing
16. Verify all functionality works
