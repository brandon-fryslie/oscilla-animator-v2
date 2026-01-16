# Dockview Integration: Architectural Plan

## Current State Summary

- **jspanel4**: Infrastructure exists (PanelManager, types) but is **completely unused dead code**
- **Current layout**: Pure React + CSS flexbox, hardcoded in App.tsx
- **Components**: All UI panels are React components (BlockLibrary, BlockInspector, editors, etc.)
- **State**: MobX stores with single source of truth pattern
- **Preview**: Renders in canvas tab, will become popout window

## Requirements

1. Replace jspanel4 completely with Dockview
2. Comprehensive integration - use all Dockview features
3. Architecture must scale 5-10x current complexity
4. Preview will be popout window (design for this, don't implement fully)
5. Controls may become popout later

---

# Plan A: Dockview as Layout Engine (Recommended)

## Philosophy
Dockview becomes THE layout system. All panels are Dockview panels. The current React layout disappears entirely.

## Architecture

```
App
└── DockviewProvider (context for API access)
    └── DockviewReact
        ├── Group: Left Sidebar
        │   ├── Panel: BlockLibrary
        │   └── Panel: BlockInspector
        ├── Group: Center (tabbed)
        │   ├── Panel: TableView
        │   ├── Panel: ConnectionMatrix
        │   ├── Panel: ReteEditor
        │   ├── Panel: ReactFlowEditor
        │   └── Panel: Preview
        ├── Group: Right Sidebar (tabbed)
        │   ├── Panel: DomainsPanel
        │   └── Panel: HelpPanel
        └── Group: Bottom
            └── Panel: DiagnosticConsole
```

## Key Design Decisions

### 1. Panel Registry Pattern
```typescript
// Single source of truth for panel definitions
const PANEL_REGISTRY = {
  'block-library': {
    component: BlockLibrary,
    title: 'Block Library',
    defaultLocation: { group: 'left-sidebar', position: 0 },
  },
  'preview': {
    component: CanvasTab,
    title: 'Preview',
    defaultLocation: { group: 'center', position: 4 },
    popoutCapable: true,  // Mark panels that can popout
  },
  // ... etc
} as const;
```

### 2. Layout State Management
```typescript
// New store for layout persistence
class LayoutStore {
  @observable private _layout: SerializedDockview | null = null;

  @action saveLayout(api: DockviewApi) {
    this._layout = api.toJSON();
    localStorage.setItem('layout', JSON.stringify(this._layout));
  }

  @action loadLayout(api: DockviewApi) {
    const saved = localStorage.getItem('layout');
    if (saved) {
      api.fromJSON(JSON.parse(saved), { /* panel factory */ });
    } else {
      this.applyDefaultLayout(api);
    }
  }
}
```

### 3. Dockview Context (global API access)
```typescript
const DockviewContext = createContext<DockviewApi | null>(null);

function useDockview(): DockviewApi {
  const api = useContext(DockviewContext);
  if (!api) throw new Error('useDockview must be within DockviewProvider');
  return api;
}

// Usage in components
function BlockLibrary() {
  const dockview = useDockview();

  const openInspector = () => {
    dockview.addPanel({ id: 'inspector', component: 'block-inspector' });
  };
}
```

### 4. Popout-Ready Architecture
```typescript
// Preview panel designed for popout
const PreviewPanel: React.FC<IDockviewPanelProps> = ({ api, containerApi }) => {
  // Detect if we're in popout window
  const isPopout = api.location.type === 'popout';

  // Canvas rendering works same in both contexts
  return <CanvasRenderer isPopout={isPopout} />;
};
```

### 5. Floating Panels (enabled by default)
```typescript
// DockviewReact configured for floating
<DockviewReact
  disableFloatingGroups={false}  // enabled by default
  floatingGroupBounds="boundedWithinViewport"
  // ...
/>

// Any panel can become floating via drag or API
api.addPanel({
  id: 'quick-inspector',
  component: 'block-inspector',
  floating: { width: 300, height: 400 },  // starts floating
});
```

## Foundational Implementation Steps

### Phase 1: Core Infrastructure (do first)
1. Remove all jspanel4 code (PanelManager, types, deps, CSS)
2. Install dockview: `npm install dockview dockview-react`
3. Create `src/ui/dockview/` directory structure:
   - `DockviewProvider.tsx` - Context wrapper
   - `panelRegistry.ts` - Panel definitions
   - `layoutStore.ts` - Layout state management
   - `theme.ts` - Dockview CSS theming
4. Create popout.html for future popout windows

### Phase 2: Panel Migration
1. Create panel wrapper components that adapt existing components
2. Wire up DockviewReact in App.tsx with onReady handler
3. Register all panels in component map
4. Apply default layout on first load

### Phase 3: Layout Persistence
1. Implement save/load via toJSON/fromJSON
2. Add layout reset to defaults action
3. Wire up auto-save on layout changes

## Pros
- Clean architecture - one layout system
- Full Dockview feature access (floating, popout, drag-drop)
- Natural path to popout Preview
- Scales well - just add panels to registry

## Cons
- Bigger initial change
- All existing layout code replaced at once

---

# Plan B: Hybrid Integration (Incremental)

## Philosophy
Keep existing React layout structure, embed Dockview only in specific regions. Migrate incrementally.

## Architecture

```
App (existing flexbox layout)
├── Left Sidebar (existing SplitPanel)
│   └── DockviewReact (mini instance)
│       ├── BlockLibrary
│       └── BlockInspector
├── Center Region (existing)
│   └── DockviewReact (main instance)
│       ├── TableView, Matrix, Rete, Flow, Preview
├── Right Sidebar (existing)
│   └── DockviewReact (mini instance)
│       ├── DomainsPanel
│       └── HelpPanel
└── Bottom (existing DiagnosticConsole)
```

## Key Design Decisions

### 1. Multiple Dockview Instances
```typescript
// Separate contexts for each region
<LeftDockviewProvider>
  <DockviewReact ... />
</LeftDockviewProvider>

<CenterDockviewProvider>
  <DockviewReact ... />
</CenterDockviewProvider>
```

### 2. Cross-Instance Communication
```typescript
// Panels can move between instances via drag handlers
const handleExternalDrop = (event: DockviewDndEvent) => {
  // Detect panel from another Dockview instance
  // Re-create in this instance
};
```

## Foundational Implementation Steps

### Phase 1: Center Region Only
1. Replace center Tabs with DockviewReact
2. Keep left/right/bottom as-is
3. Migrate editor tabs to Dockview panels

### Phase 2: Sidebars
1. Add Dockview to left sidebar
2. Add Dockview to right sidebar
3. Implement cross-region drag-drop

### Phase 3: Unification (optional)
1. Eventually merge into single Dockview instance
2. Or keep separate if regions remain fixed

## Pros
- Incremental migration, lower risk
- Can validate Dockview before full commitment
- Existing layout code still works during transition

## Cons
- Multiple Dockview instances = complexity
- Cross-region drag-drop is harder
- Eventually want single instance anyway (Plan A)
- More code to maintain during transition

---

# Plan C: Dockview + Region Constraints

## Philosophy
Single Dockview instance, but with strict region constraints. Panels can move within regions but not across them (initially).

## Architecture

```
DockviewReact (single instance, constrained)
├── LockedGroup: Left Sidebar (no tabs, stacked)
│   ├── BlockLibrary (locked position)
│   └── BlockInspector (locked position)
├── Group: Center (tabbed, flexible)
│   ├── TableView, Matrix, Rete, Flow, Preview
├── LockedGroup: Right Sidebar (tabbed)
│   ├── DomainsPanel
│   └── HelpPanel
└── LockedGroup: Bottom (single panel)
    └── DiagnosticConsole
```

## Key Design Decisions

### 1. Group Constraints
```typescript
// Use Dockview's constraint system
api.addGroup({
  id: 'left-sidebar',
  locked: 'no-drop-target',  // Can't drop panels here
});

// Or use custom drop logic
onWillDrop={(event) => {
  if (isLockedRegion(event.target)) {
    event.preventDefault();
  }
}}
```

### 2. Progressive Unlocking
```typescript
// Start constrained, unlock as users become familiar
const layoutMode = useLayoutMode(); // 'beginner' | 'advanced'

<DockviewReact
  disableDnd={layoutMode === 'beginner'}
  // ...
/>
```

## Pros
- Single Dockview instance (clean)
- Familiar layout for users initially
- Can progressively unlock flexibility
- Easier popout implementation than Plan B

## Cons
- Fighting Dockview's natural flexibility
- Constraint logic adds complexity
- May feel limited compared to full Dockview

---

# Recommendation: Plan A with Phased Rollout

**Why Plan A:**
1. jspanel4 code is 100% dead - no migration needed, just deletion
2. Single Dockview instance is cleanest architecture
3. Directly supports popout windows for Preview
4. Scales naturally - add panels to registry
5. Full Dockview feature set available immediately

**Phased Approach:**
1. **Foundation**: Delete jspanel4, add Dockview infrastructure
2. **Core Migration**: Move all panels to Dockview, match current layout
3. **Enhancement**: Enable floating panels, save/restore layouts
4. **Popout**: Implement Preview popout window (separate task)

## Default Layout Design

Sidebars are **stacked AND tabbed** - multiple groups vertically, each can have tabs:

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar                                                          │
├──────────────┬───────────────────────────────┬──────────────────┤
│ Library      │ Blocks │ Matrix │ Rete │ Flow │ Domains │ Props  │
│ ────────────── ├───────────────────────────────┤ ──────────────── │
│              │                               │                  │
│ (BlockLib)   │                               │ (tabbed top)     │
│              │                               │                  │
├──────────────┤    (Center Editor Area)      ├──────────────────┤
│ Inspector    │                               │ Help             │
│ ────────────── │                               │ ──────────────── │
│              │                               │                  │
│ (BlockInsp)  │                               │ (stacked bottom) │
│              │                               │                  │
├──────────────┴───────────────────────────────┴──────────────────┤
│ Console │ Events │ Stats                                        │
└─────────────────────────────────────────────────────────────────┘
```

This allows:
- Dragging panels between sidebar groups
- Adding tabs to any group
- Flexible reorganization while maintaining structure

---

# Foundational Implementation Plan (Plan A)

## Step 1: Remove jspanel4 (cleanup)

**Files to delete:**
- `src/ui/panel/PanelManager.ts`
- `src/ui/panel/types.ts`
- `src/ui/panel/__tests__/PanelManager.test.ts`
- `src/ui/types/jspanel.d.ts`
- `src/ui/layout/AppLayout.ts`
- `src/ui/layout/regions.ts`

**Files to modify:**
- `package.json` - remove jspanel4, @jspanel/* deps
- `vite.config.ts` - remove jspanel4 alias
- `public/index.html` - remove jsPanel CSS overrides

## Step 2: Install and configure Dockview

```bash
npm install dockview dockview-react
```

**Create files:**
- `src/ui/dockview/index.ts` - exports
- `src/ui/dockview/DockviewProvider.tsx` - context wrapper
- `src/ui/dockview/panelRegistry.ts` - panel definitions
- `src/ui/dockview/hooks.ts` - useDockview, usePanelApi
- `src/ui/dockview/theme.css` - dark theme overrides
- `public/popout.html` - popout window template

## Step 3: Create panel registry

```typescript
// src/ui/dockview/panelRegistry.ts
export const PANELS = {
  'block-library': { component: BlockLibrary, title: 'Block Library' },
  'block-inspector': { component: BlockInspector, title: 'Inspector' },
  'table-view': { component: TableView, title: 'Blocks' },
  'connection-matrix': { component: ConnectionMatrix, title: 'Matrix' },
  'rete-editor': { component: ReteEditor, title: 'Rete' },
  'reactflow-editor': { component: ReactFlowEditor, title: 'Flow' },
  'preview': { component: CanvasTab, title: 'Preview' },
  'domains-panel': { component: DomainsPanel, title: 'Domains' },
  'help-panel': { component: HelpPanel, title: 'Help' },
  'diagnostic-console': { component: DiagnosticConsole, title: 'Console' },
} as const;
```

## Step 4: Create DockviewProvider

```typescript
// src/ui/dockview/DockviewProvider.tsx
export function DockviewProvider({ children }: { children: React.ReactNode }) {
  const [api, setApi] = useState<DockviewApi | null>(null);

  const onReady = (event: DockviewReadyEvent) => {
    setApi(event.api);
    applyDefaultLayout(event.api);
  };

  return (
    <DockviewContext.Provider value={api}>
      <DockviewReact
        className="oscilla-dockview"
        onReady={onReady}
        components={PANEL_COMPONENTS}
      />
      {children}
    </DockviewContext.Provider>
  );
}
```

## Step 5: Refactor App.tsx

Replace entire layout with:
```typescript
function App() {
  return (
    <StoreProvider>
      <EditorProvider>
        <div className="app-root">
          <Toolbar />
          <DockviewProvider />
        </div>
      </EditorProvider>
    </StoreProvider>
  );
}
```

## Step 6: Create default layout

```typescript
function applyDefaultLayout(api: DockviewApi) {
  // Left sidebar - TWO stacked groups
  const leftTopGroup = api.addGroup({ id: 'left-top' });
  api.addPanel({ id: 'block-library', component: 'block-library', position: { referenceGroup: leftTopGroup } });

  const leftBottomGroup = api.addGroup({ id: 'left-bottom', position: { referenceGroup: leftTopGroup, direction: 'below' } });
  api.addPanel({ id: 'block-inspector', component: 'block-inspector', position: { referenceGroup: leftBottomGroup } });

  // Center group (tabbed)
  const centerGroup = api.addGroup({ id: 'center', position: { referenceGroup: leftTopGroup, direction: 'right' } });
  api.addPanel({ id: 'table-view', component: 'table-view', position: { referenceGroup: centerGroup } });
  api.addPanel({ id: 'connection-matrix', component: 'connection-matrix', position: { referenceGroup: centerGroup } });
  api.addPanel({ id: 'rete-editor', component: 'rete-editor', position: { referenceGroup: centerGroup } });
  api.addPanel({ id: 'reactflow-editor', component: 'reactflow-editor', position: { referenceGroup: centerGroup } });
  api.addPanel({ id: 'preview', component: 'preview', position: { referenceGroup: centerGroup } });

  // Right sidebar - TWO stacked groups
  const rightTopGroup = api.addGroup({ id: 'right-top', position: { referenceGroup: centerGroup, direction: 'right' } });
  api.addPanel({ id: 'domains-panel', component: 'domains-panel', position: { referenceGroup: rightTopGroup } });
  // Future: props panel can be added as tab here

  const rightBottomGroup = api.addGroup({ id: 'right-bottom', position: { referenceGroup: rightTopGroup, direction: 'below' } });
  api.addPanel({ id: 'help-panel', component: 'help-panel', position: { referenceGroup: rightBottomGroup } });

  // Bottom group (tabbed - can add Events, Stats panels later)
  const bottomGroup = api.addGroup({ id: 'bottom', position: { referenceGroup: centerGroup, direction: 'below' } });
  api.addPanel({ id: 'diagnostic-console', component: 'diagnostic-console', position: { referenceGroup: bottomGroup } });

  // Set initial sizes (approximate percentages)
  api.setGroupSize('left-top', 280);
  api.setGroupSize('right-top', 300);
}
```

## Step 7: Theme Dockview

```css
/* src/ui/dockview/theme.css */
.oscilla-dockview {
  --dv-activegroup-visiblepanel-tab-background-color: #1a1a2e;
  --dv-activegroup-hiddenpanel-tab-background-color: #16213e;
  --dv-inactivegroup-visiblepanel-tab-background-color: #0f0f23;
  --dv-inactivegroup-hiddenpanel-tab-background-color: #0f0f23;
  --dv-tab-divider-color: #0f3460;
  --dv-group-view-background-color: #0f0f23;
  --dv-tabs-and-actions-container-background-color: #16213e;
  /* ... match existing theme */
}
```

## Step 8: Layout persistence (LayoutStore)

```typescript
// src/stores/LayoutStore.ts
export class LayoutStore {
  private api: DockviewApi | null = null;

  setApi(api: DockviewApi) {
    this.api = api;
    api.onDidLayoutChange(() => this.saveLayout());
  }

  saveLayout() {
    if (this.api) {
      const layout = this.api.toJSON();
      localStorage.setItem('oscilla-layout', JSON.stringify(layout));
    }
  }

  loadLayout() {
    const saved = localStorage.getItem('oscilla-layout');
    if (saved && this.api) {
      this.api.fromJSON(JSON.parse(saved));
    }
  }

  resetLayout() {
    localStorage.removeItem('oscilla-layout');
    if (this.api) {
      this.api.clear();
      applyDefaultLayout(this.api);
    }
  }
}
```

---

# Future: Preview Popout (not in this plan)

The architecture above directly supports popout via:

```typescript
// When user clicks "popout preview" button
const popoutPreview = () => {
  const previewPanel = api.getPanel('preview');
  if (previewPanel) {
    api.addPopoutGroup(previewPanel, {
      popoutUrl: '/popout.html',
    });
  }
};
```

The `popout.html` file will load a minimal React app that reconnects to the same stores and renders the canvas.

---

# Design Decisions (Resolved)

1. **Layout persistence**: Global (not per-project)
2. **Sidebar layout**: Both stacked AND tabbed (groups within groups)
3. **Floating panels**: Enabled by default (defer implementation, architect for it)
4. **Lock panels**: Not now
