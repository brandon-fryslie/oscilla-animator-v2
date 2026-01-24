/**
 * Hotkey Registry
 *
 * Single source of truth for all keyboard shortcuts in the application.
 * To add a new hotkey:
 * 1. Add an action ID to HotkeyAction
 * 2. Add the entry to HOTKEY_REGISTRY
 * 3. Add the handler in useGlobalHotkeys.ts
 */

export type HotkeyCategory = 'general' | 'editor' | 'panels' | 'playback';

export interface HotkeyEntry {
  /** Mantine hotkey string, e.g. "mod+shift+E" */
  keys: string;
  /** Human-readable description */
  description: string;
  /** Grouping category */
  category: HotkeyCategory;
}

export type HotkeyAction =
  | 'export-patch'
  | 'reset-patch'
  | 'toggle-play'
  | 'reset-time'
  | 'zoom-fit'
  | 'delete-selected';

export const HOTKEY_REGISTRY: Record<HotkeyAction, HotkeyEntry> = {
  'export-patch': {
    keys: 'mod+shift+E',
    description: 'Export patch to clipboard',
    category: 'general',
  },
  'reset-patch': {
    keys: 'mod+shift+Backspace',
    description: 'Reset patch to default',
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
  'zoom-fit': {
    keys: 'mod+shift+F',
    description: 'Zoom to fit all nodes',
    category: 'editor',
  },
  'delete-selected': {
    keys: 'Backspace',
    description: 'Delete selected block/edge',
    category: 'editor',
  },
};
