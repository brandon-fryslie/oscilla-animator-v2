/**
 * Keyboard Shortcuts Hook
 *
 * Provides global keyboard shortcut handling.
 * Currently supports:
 * - Ctrl+Shift+E: Export patch to clipboard
 */

import { useEffect } from 'react';

export interface KeyboardShortcutHandlers {
  onExport?: () => void;
}

/**
 * Hook to register global keyboard shortcuts.
 * Must be called at app root level to ensure global capture.
 *
 * @param handlers - Object with handler functions for each shortcut
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Shift+E - Export patch
      if (event.ctrlKey && event.shiftKey && event.key === 'E') {
        event.preventDefault(); // Prevent default browser behavior
        handlers.onExport?.();
        return;
      }

      // Add more shortcuts here as needed
    };

    // Register global listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handlers]);
}
