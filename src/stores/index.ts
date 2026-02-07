/**
 * Store Module - Public API
 *
 * This is the ONLY file that components should import from.
 * Internal types and helpers are NOT exported.
 *
 * Architectural constraints:
 * - Only this module may import 'mobx'
 * - Components import from 'src/stores' or 'mobx-react-lite'
 * - Internal types (PatchData, etc.) are NOT exported
 */

// Store classes
export { RootStore } from './RootStore';
export { PatchStore, type ImmutablePatch, type BlockOptions } from './PatchStore';
export type { LensAttachment } from '../graph/Patch';
export { SelectionStore } from './SelectionStore';
export { ViewportStore, type Pan } from './ViewportStore';
export { PlaybackStore } from './PlaybackStore';
export { PortHighlightStore } from './PortHighlightStore';
export { DebugStore, formatDebugValue } from './DebugStore';
export { LayoutStore, type NodePosition } from './LayoutStore';
export {
  DiagnosticsStore,
  type LogLevel,
  type LogEntry,
} from './DiagnosticsStore';
export { CompositeEditorStore } from './CompositeEditorStore';
export { StepDebugStore } from './StepDebugStore';

// React integration
export { StoreProvider, useStores, useStore } from './context';

// Note: rootStore singleton removed - components should use StoreProvider/useStores
// Note: internal.ts is NOT exported
// Note: configure.ts is NOT exported (used internally by RootStore)
