# Implementation Context: persistence - Layout Persistence
Generated: 2026-01-15T16:10:00

## Key Dockview APIs

### Serialization
```typescript
// Save layout to JSON
const layout: SerializedDockview = api.toJSON();

// Restore layout from JSON
api.fromJSON(layout, {
  // Component deserializer (optional if using component map)
});
```

### Layout Change Event
```typescript
api.onDidLayoutChange(() => {
  // Called when layout structure changes
  // NOT called for content changes inside panels
});
```

### Clear and Rebuild
```typescript
api.clear(); // Remove all groups and panels
// Then rebuild with addGroup/addPanel
```

## Debouncing Pattern

```typescript
import { debounce } from 'lodash-es'; // or implement simple debounce

class LayoutStore {
  private debouncedSave = debounce(() => {
    this.saveLayoutImpl();
  }, 300);

  private saveLayoutImpl() {
    if (this.api) {
      const layout = this.api.toJSON();
      localStorage.setItem('oscilla-layout', JSON.stringify(layout));
    }
  }

  // Public method calls debounced version
  saveLayout() {
    this.debouncedSave();
  }
}
```

## Error Handling Pattern

```typescript
loadLayout(): boolean {
  try {
    const saved = localStorage.getItem('oscilla-layout');
    if (!saved) return false;

    const layout = JSON.parse(saved);

    // Validate structure (optional but recommended)
    if (!layout.grid || !layout.panels) {
      console.warn('Invalid layout structure, using default');
      return false;
    }

    this.api?.fromJSON(layout);
    return true;
  } catch (e) {
    console.warn('Failed to load layout, using default:', e);
    localStorage.removeItem('oscilla-layout');
    return false;
  }
}
```

## Integration with DockviewProvider

```typescript
// In DockviewProvider.tsx
const layoutStore = useStore().layout; // From rootStore

const onReady = (event: DockviewReadyEvent) => {
  const api = event.api;
  layoutStore.setApi(api);

  // Try to load saved layout, fall back to default
  if (!layoutStore.loadLayout()) {
    applyDefaultLayout(api);
  }
};
```

## Reset Button Location

Options:
1. Toolbar button (most visible)
2. Right-click context menu on Dockview
3. Keyboard shortcut (Cmd+Shift+R or similar)

Recommendation: Toolbar button for now, easy to find.

```typescript
// In Toolbar.tsx
const handleResetLayout = () => {
  if (confirm('Reset layout to default?')) {
    layoutStore.resetLayout();
  }
};

<button onClick={handleResetLayout}>Reset Layout</button>
```

## Layout Versioning (Future-Proofing)

Consider adding a version to detect incompatible layouts:

```typescript
interface VersionedLayout {
  version: number;
  layout: SerializedDockview;
}

const LAYOUT_VERSION = 1;

saveLayout() {
  const versioned: VersionedLayout = {
    version: LAYOUT_VERSION,
    layout: this.api.toJSON(),
  };
  localStorage.setItem('oscilla-layout', JSON.stringify(versioned));
}

loadLayout(): boolean {
  const saved = localStorage.getItem('oscilla-layout');
  if (!saved) return false;

  const versioned = JSON.parse(saved);
  if (versioned.version !== LAYOUT_VERSION) {
    console.warn('Layout version mismatch, using default');
    return false;
  }

  this.api.fromJSON(versioned.layout);
  return true;
}
```

## Files to Create/Modify

### Create
- `src/stores/LayoutStore.ts`

### Modify
- `src/stores/index.ts` - add LayoutStore to rootStore
- `src/ui/dockview/DockviewProvider.tsx` - use LayoutStore
- `src/ui/components/toolbar/Toolbar.tsx` - add reset button
