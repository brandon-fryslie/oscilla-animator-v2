# Plan: Global Keyboard Hotkey System

## Goal

Replace the manual `addEventListener('keydown')` approach with a centralized hotkey registry using Mantine's `useHotkeys` hook, providing a single source of truth for all keyboard shortcuts across the application.

## Current State

- `src/ui/hooks/useKeyboardShortcuts.ts` - Manual keydown listener, handles only `Ctrl+Shift+E` (export)
- Called once from `App.tsx` with handler callbacks
- `@mantine/hooks` already installed (^8.3.13)
- Other components (BlockLibrary) have their own local keyboard listeners

## Design

### Architecture

```
src/ui/hotkeys/
├── index.ts                    # Public API barrel export
├── hotkeyRegistry.ts           # Central registry: all hotkey definitions
└── useGlobalHotkeys.ts         # Hook that wires registry to useHotkeys
```

**Core Idea**: A single `HOTKEY_REGISTRY` object defines every shortcut in the app - the key combo, description, category, and action name. The `useGlobalHotkeys` hook at the App root consumes this registry and dispatches actions.

### Registry Design

```typescript
// hotkeyRegistry.ts

export interface HotkeyEntry {
  /** Mantine hotkey string, e.g. "mod+shift+E" */
  keys: string;
  /** Human-readable description for help overlay */
  description: string;
  /** Grouping category (editor, panels, playback, etc.) */
  category: HotkeyCategory;
}

export type HotkeyCategory = 'general' | 'editor' | 'panels' | 'playback' | 'debug';

/**
 * Discriminated union of all hotkey action IDs.
 * Adding a new hotkey means:
 * 1. Add an entry here
 * 2. Add the handler in useGlobalHotkeys
 */
export type HotkeyAction =
  | 'export-patch'
  | 'toggle-play'
  | 'reset-time'
  | 'focus-block-library'
  | 'toggle-diagnostics'
  | 'arrange-nodes'
  | 'zoom-fit'
  | 'delete-selected';

export const HOTKEY_REGISTRY: Record<HotkeyAction, HotkeyEntry> = {
  'export-patch': {
    keys: 'mod+shift+E',
    description: 'Export patch to clipboard',
    category: 'general',
  },
  'toggle-play': {
    keys: 'Space',
    description: 'Play/pause animation',
    category: 'playback',
  },
  'reset-time': {
    keys: 'mod+shift+R',
    description: 'Reset time to zero',
    category: 'playback',
  },
  'focus-block-library': {
    keys: 'mod+K',
    description: 'Focus block library search',
    category: 'panels',
  },
  'toggle-diagnostics': {
    keys: 'mod+shift+D',
    description: 'Toggle diagnostics panel',
    category: 'panels',
  },
  'arrange-nodes': {
    keys: 'mod+shift+A',
    description: 'Auto-arrange nodes',
    category: 'editor',
  },
  'zoom-fit': {
    keys: 'mod+shift+F',
    description: 'Zoom to fit all nodes',
    category: 'editor',
  },
  'delete-selected': {
    keys: 'Delete',
    description: 'Delete selected nodes',
    category: 'editor',
  },
};
```

### Hook Design

```typescript
// useGlobalHotkeys.ts

import { useHotkeys } from '@mantine/hooks';
import { HOTKEY_REGISTRY, type HotkeyAction } from './hotkeyRegistry';

/**
 * Dispatch table: maps each HotkeyAction to its handler.
 * All handlers receive app-level dependencies via closure.
 */
export function useGlobalHotkeys(): void {
  // Access stores, editor, dockview API via hooks
  const rootStore = useStores();
  const editor = useEditor();
  const exportPatch = useExportPatch();
  // ... etc

  // Build handler map
  const handlers: Record<HotkeyAction, (event: KeyboardEvent) => void> = {
    'export-patch': async () => { /* existing export logic */ },
    'toggle-play': () => { rootStore.playbackStore.toggle(); },
    // ... etc
  };

  // Convert registry to Mantine's HotkeyItem[] format
  const hotkeyItems = Object.entries(HOTKEY_REGISTRY).map(
    ([action, entry]) => [entry.keys, handlers[action as HotkeyAction]] as const
  );

  useHotkeys(hotkeyItems);
}
```

### Integration in App.tsx

```diff
- import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
+ import { useGlobalHotkeys } from '../../hotkeys';

// In component body:
- useKeyboardShortcuts({ onExport: handleExportShortcut });
+ useGlobalHotkeys();
```

The toast feedback for actions like export will be handled inside the hook's handler functions directly (using a notification store or Mantine notifications).

## Implementation Steps

1. **Create `src/ui/hotkeys/hotkeyRegistry.ts`** - Define the `HotkeyEntry` interface, `HotkeyAction` type, and `HOTKEY_REGISTRY` constant with the initial set of shortcuts.

2. **Create `src/ui/hotkeys/useGlobalHotkeys.ts`** - Hook that reads the registry, builds handlers using app stores/context, and calls `useHotkeys()`.

3. **Create `src/ui/hotkeys/index.ts`** - Barrel export.

4. **Update `App.tsx`** - Replace `useKeyboardShortcuts` call with `useGlobalHotkeys()`. Remove now-unnecessary handler boilerplate.

5. **Delete `src/ui/hooks/useKeyboardShortcuts.ts`** - Fully replaced.

6. **Add initial hotkeys beyond export** - Wire up a few useful shortcuts (space for play/pause, delete for selected nodes) to prove the system works with multiple action types.

7. **Verify** - Run dev server, confirm existing export shortcut works, confirm new shortcuts work, confirm no conflicts with ReactFlow/Dockview built-in shortcuts.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where to define hotkeys | Single registry file | ONE SOURCE OF TRUTH - all combos visible in one place, conflict detection trivial |
| Handler wiring | Inside hook, not registry | Registry is pure data (serializable for help overlay), handlers have React dependencies |
| `useHotkeys` vs `getHotkeyHandler` | `useHotkeys` at document level | Global shortcuts need document-level capture; panel-specific shortcuts can use `getHotkeyHandler` later if needed |
| Tags to ignore | Keep Mantine defaults (INPUT, TEXTAREA, SELECT) | Prevents shortcuts from firing while typing; Space/Delete will only fire when not in an input |
| Notification feedback | Mantine notifications or existing Toast | Keep using existing Toast pattern for now |

## Conflict Avoidance

- ReactFlow has its own keyboard handlers (Delete, Backspace, Ctrl+A, etc.) - we avoid overriding those by only binding our own custom combos that don't overlap
- Dockview doesn't register global shortcuts
- The `tagsToIgnore` default in Mantine prevents conflicts with form inputs
- Space for play/pause needs care: only when not focused on an input/button

## Future Extensions

- Help overlay (mod+?) showing all registered shortcuts from the registry
- User-customizable key bindings (read overrides from localStorage, merge with registry)
- Scoped shortcuts per panel (using `getHotkeyHandler` on panel containers)

## Files Modified

- `src/ui/hotkeys/hotkeyRegistry.ts` (new)
- `src/ui/hotkeys/useGlobalHotkeys.ts` (new)
- `src/ui/hotkeys/index.ts` (new)
- `src/ui/components/app/App.tsx` (modify - replace hook call)
- `src/ui/hooks/useKeyboardShortcuts.ts` (delete)
