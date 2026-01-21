/**
 * Export Patch Hook
 *
 * Provides patch export functionality that can be used by both
 * the toolbar button and keyboard shortcuts.
 */

import { useCallback } from 'react';
import { useStores } from '../../stores/context';
import { exportToMarkdown } from '../../services/PatchExporter';

export interface ExportResult {
  success: boolean;
  message: string;
  error?: Error;
}

/**
 * Hook to export the current patch to clipboard.
 * Returns a callback that performs the export and shows appropriate feedback.
 */
export function useExportPatch() {
  const rootStore = useStores();

  const exportPatch = useCallback(async (): Promise<ExportResult> => {
    try {
      // Get current patch from store
      const patch = rootStore.patch.patch;
      const diagnostics = rootStore.diagnostics;

      // Export to markdown
      const markdown = exportToMarkdown(patch, diagnostics);

      // Copy to clipboard
      await navigator.clipboard.writeText(markdown);

      return {
        success: true,
        message: 'Copied patch to clipboard',
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      return {
        success: false,
        message: error.message || 'Failed to copy to clipboard',
        error,
      };
    }
  }, [rootStore]);

  return exportPatch;
}
