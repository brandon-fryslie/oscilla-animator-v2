/**
 * Global Hotkeys Hook
 *
 * Wires the hotkey registry to Mantine's useHotkeys, dispatching actions
 * to stores and editor context. Called once at the App root.
 */

import { useCallback } from 'react';
import { useHotkeys, type HotkeyItem } from '@mantine/hooks';
import { HOTKEY_REGISTRY, type HotkeyAction } from './hotkeyRegistry';
import { useStores } from '../../stores';
import { useEditor } from '../editorCommon';
import { useExportPatch } from '../hooks/useExportPatch';

export interface HotkeyFeedback {
  message: string;
  severity: 'success' | 'error';
}

export interface UseGlobalHotkeysOptions {
  onFeedback?: (feedback: HotkeyFeedback) => void;
}

export function useGlobalHotkeys(options: UseGlobalHotkeysOptions = {}): void {
  const rootStore = useStores();
  const { editorHandle } = useEditor();
  const exportPatch = useExportPatch();
  const { onFeedback } = options;

  const showFeedback = useCallback(
    (message: string, severity: 'success' | 'error' = 'success') => {
      onFeedback?.({ message, severity });
    },
    [onFeedback],
  );

  const handlers: Record<HotkeyAction, (event: KeyboardEvent) => void> = {
    'export-patch': async () => {
      const result = await exportPatch();
      showFeedback(result.message, result.success ? 'success' : 'error');
      if (!result.success && result.error) {
        console.error('Export error:', result.error);
      }
    },

    'reset-patch': (event) => {
      event.preventDefault();
      rootStore.demo.loadDefault();
      showFeedback('Patch reset to default');
    },

    'toggle-play': () => {
      rootStore.playback.togglePlayPause();
    },

    'reset-time': (event) => {
      event.preventDefault();
      rootStore.playback.setTime(0);
      rootStore.playback.pause();
    },

    'zoom-fit': (event) => {
      event.preventDefault();
      if (editorHandle) {
        editorHandle.zoomToFit();
      }
    },

    'delete-selected': () => {
      const { selection, patch } = rootStore;
      if (selection.selectedBlockId) {
        patch.removeBlock(selection.selectedBlockId);
        selection.clearSelection();
      } else if (selection.selectedEdgeId) {
        patch.removeEdge(selection.selectedEdgeId);
        selection.clearSelection();
      }
    },
  };

  const hotkeyItems: HotkeyItem[] = (
    Object.keys(HOTKEY_REGISTRY) as HotkeyAction[]
  ).map((action) => [
    HOTKEY_REGISTRY[action].keys,
    handlers[action],
    { preventDefault: false },
  ]);

  useHotkeys(hotkeyItems);
}
