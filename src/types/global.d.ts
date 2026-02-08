/**
 * Global Window augmentation for cross-boundary communication.
 *
 * These properties enable communication between main.ts (bootstrap)
 * and React components without prop drilling through the entire tree.
 *
 * Demo-related globals have been removed — DemoStore owns demo state.
 */

interface Window {
  /** Stats display callback, set by App.tsx, called by AnimationLoop */
  __setStats?: (text: string) => void;

  /** Port context menu handler, set by ReactFlowEditor, read by OscillaNode */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __reactFlowPortContextMenu?: (...args: any[]) => void;
}
