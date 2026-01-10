/**
 * UI Components
 *
 * Reusable UI components for the Oscilla editor.
 */

// App components (new React root structure)
export * from './app';

// Legacy components (will be removed in cleanup)
export { TabbedContent } from './TabbedContent';
export type { TabConfig as LegacyTabConfig, TabChangeCallback } from './TabbedContent';

// Feature components
export { TableView } from './TableView';
export { ConnectionMatrix } from './ConnectionMatrix';
export { BlockInspector } from './BlockInspector';
export { BlockLibrary } from './BlockLibrary';
export { DomainsPanel } from './DomainsPanel';

export { InspectorContainer } from './InspectorContainer';
export type { InspectorContainerProps } from './InspectorContainer';
