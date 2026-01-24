/**
 * Global Window augmentation for cross-boundary communication.
 *
 * These properties enable communication between main.ts (bootstrap)
 * and React components without prop drilling through the entire tree.
 */

interface OscillaPresetOption {
  label: string;
  value: string;
}

interface Window {
  /** Stats display callback, set by App.tsx, called by main.ts render loop */
  __setStats?: (text: string) => void;

  /** Available preset patches for the toolbar dropdown */
  __oscilla_presets?: OscillaPresetOption[];

  /** Currently active preset index (as string) */
  __oscilla_currentPreset?: string;

  /** Default preset index (as string) */
  __oscilla_defaultPreset?: string;

  /** Switch to a different preset by index string */
  __oscilla_switchPreset?: (index: string) => void;

  /** Port context menu handler, set by ReactFlowEditor, read by OscillaNode */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __reactFlowPortContextMenu?: (...args: any[]) => void;
}
