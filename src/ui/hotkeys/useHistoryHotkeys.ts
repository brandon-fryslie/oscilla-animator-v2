/**
 * History Hotkeys Hook
 *
 * Owns undo/redo keybinding for BOTH editor eras. Unlike the rest of the registry
 * (whose handlers still reach into V1-specific stores and are wired only in the V1
 * shell), undo/redo are era-neutral: they call the single GraphHistoryStore, which is
 * bound to whichever era's adapter is active. So this hook mounts once at the app root
 * and works in the native (pillar) boot and the V1 boot alike. [LAW:single-enforcer]
 *
 * The shortcuts themselves live in the shared HOTKEY_REGISTRY (one source of truth for
 * key bindings); useGlobalHotkeys cedes these two actions to this owner. [LAW:one-source-of-truth]
 */

import { useHotkeys, type HotkeyItem } from '@mantine/hooks';
import { HOTKEY_REGISTRY, HISTORY_ACTIONS, type HistoryAction } from './hotkeyRegistry';
import { useStores } from '../../stores';

export function useHistoryHotkeys(): void {
  const { history } = useStores();

  const handlers: Record<HistoryAction, (event: KeyboardEvent) => void> = {
    undo: (event) => {
      event.preventDefault();
      history.undo();
    },
    redo: (event) => {
      event.preventDefault();
      history.redo();
    },
  };

  const hotkeyItems: HotkeyItem[] = HISTORY_ACTIONS.map((action) => [
    HOTKEY_REGISTRY[action].keys,
    handlers[action],
    { preventDefault: false },
  ]);

  useHotkeys(hotkeyItems);
}
