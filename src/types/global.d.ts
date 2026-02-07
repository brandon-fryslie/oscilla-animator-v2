/**
 * Global Window augmentation for cross-boundary communication.
 *
 * These properties enable communication between main.ts (bootstrap)
 * and React components without prop drilling through the entire tree.
 */

interface HclDemoInfo {
  name: string;
  filename: string;
}

interface Window {
  /** Stats display callback, set by App.tsx, called by main.ts render loop */
  __setStats?: (text: string) => void;

  /** Available HCL demo patches for the toolbar dropdown */
  __oscilla_demos?: HclDemoInfo[];

  /** Switch to a different demo by filename */
  __oscilla_switchDemo?: (filename: string) => void;

  /** Currently loaded demo filename, or null if custom/restored patch */
  __oscilla_currentDemo?: string | null;

  /** Port context menu handler, set by ReactFlowEditor, read by OscillaNode */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __reactFlowPortContextMenu?: (...args: any[]) => void;
}
