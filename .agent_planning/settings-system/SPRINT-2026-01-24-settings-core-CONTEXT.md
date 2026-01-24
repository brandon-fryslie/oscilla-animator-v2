# Implementation Context: settings-core

## Existing Patterns to Follow

### Store Pattern (from CameraStore, DebugStore)
```typescript
import { makeAutoObservable } from 'mobx';

export class SettingsStore {
  constructor() {
    makeAutoObservable(this);
  }
  // Actions are auto-inferred by makeAutoObservable
}
```

### RootStore Integration
```typescript
// In RootStore.ts:
import { SettingsStore } from './SettingsStore';

export class RootStore {
  readonly settings: SettingsStore;

  constructor() {
    this.settings = new SettingsStore();
    // ... existing stores
  }
}
```

### Hook Pattern (from context.tsx)
```typescript
// useSettings builds on useStore('settings')
export function useSettings<T>(token: SettingsToken<T>): [T, (partial: Partial<T>) => void] {
  const store = useStore('settings');
  store.register(token); // idempotent
  return [store.get(token), (partial) => store.update(token, partial)];
}
```

### Component Pattern
```typescript
import { observer } from 'mobx-react-lite';

export const SettingsPanel: React.FC = observer(() => {
  const settings = useStore('settings');
  // iterate settings.registeredTokens
});
```

### localStorage Pattern (from main.ts)
```typescript
// Key format: 'oscilla-v2-settings:debug'
const STORAGE_PREFIX = 'oscilla-v2-settings:';

function loadNamespace(namespace: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${namespace}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // Corrupt data, use defaults
  }
}

function saveNamespace(namespace: string, values: Record<string, unknown>): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${namespace}`, JSON.stringify(values));
  } catch {
    // Quota exceeded or other error - silently fail
  }
}
```

### Dockview Panel Registration (from App.tsx)
- Panels are registered in the Dockview component factory
- Each panel is a React component wrapped in a Dockview panel adapter
- Add 'settings' to the panel type union and factory map

### Mantine Drawer (for toolbar trigger)
```typescript
import { Drawer, ActionIcon } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react'; // or similar

// In Toolbar:
<ActionIcon onClick={() => setDrawerOpen(true)}>
  <IconSettings size={16} />
</ActionIcon>

// Drawer wrapping SettingsPanel:
<Drawer opened={drawerOpen} onClose={() => setDrawerOpen(false)} title="Settings">
  <SettingsPanel />
</Drawer>
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/stores/RootStore.ts` | Add `readonly settings: SettingsStore` + construction |
| `src/ui/components/app/App.tsx` | Register settings Dockview panel |
| `src/ui/components/app/Toolbar.tsx` | Add gear icon + Drawer |
| `src/stores/DebugStore.ts` | Read initial `enabled` from settings token |
| `src/ui/reactFlowEditor/ReactFlowEditor.tsx` | Read minimap visibility from settings |
| `src/main.ts` | Read default patch from settings |

## Key Files to Create

| File | Purpose |
|------|---------|
| `src/settings/types.ts` | SettingsToken, FieldUIHint, SettingsUIConfig types |
| `src/settings/defineSettings.ts` | Token factory function |
| `src/settings/useSettings.ts` | React hook |
| `src/settings/index.ts` | Public API barrel export |
| `src/settings/tokens/app-settings.ts` | Default patch token |
| `src/settings/tokens/debug-settings.ts` | Debug on/off token |
| `src/settings/tokens/editor-settings.ts` | Minimap token |
| `src/stores/SettingsStore.ts` | MobX settings store |
| `src/ui/components/SettingsPanel.tsx` | Settings panel UI |

## Serialization Strategy

Settings values must be JSON-serializable. Supported types:
- `boolean` → toggle control
- `number` → number input or slider control
- `string` → text input or select control

Complex types (arrays, nested objects) are not supported in v1 of the settings system.

## Persistence Debouncing

Use MobX `reaction` with `delay` option:
```typescript
reaction(
  () => JSON.stringify(this.getAll(token)),
  (serialized) => saveNamespace(token.namespace, JSON.parse(serialized)),
  { delay: 500 }
);
```

This ensures we don't thrash localStorage on rapid slider drags.

## Token Isolation Convention

Until an ESLint rule is added, enforce via file structure:
- Tokens live in `src/settings/tokens/<feature>-settings.ts`
- Each token file is imported ONLY by the owning feature's components/stores
- The settings system itself (`SettingsStore`, `SettingsPanel`) accesses tokens generically via the registry — never imports specific tokens

The `src/settings/index.ts` barrel exports:
- `defineSettings` (the factory)
- `useSettings` (the hook)
- Types

It does NOT re-export individual tokens. Features import their own token directly.
