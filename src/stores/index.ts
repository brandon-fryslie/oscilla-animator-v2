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
export { SelectionStore } from './SelectionStore';
export { ViewportStore, type Pan } from './ViewportStore';
export { PlaybackStore } from './PlaybackStore';
export {
  DiagnosticsStore,
  type LogLevel,
  type LogEntry,
} from './DiagnosticsStore';

// React integration
export { StoreProvider, useStores, useStore } from './context';

// Singleton instance for non-React code
export { rootStore } from './instance';

// Note: internal.ts is NOT exported
// Note: configure.ts is NOT exported (used internally by RootStore)
