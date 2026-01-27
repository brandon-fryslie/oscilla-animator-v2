/**
 * Graph Editor Adapter System
 *
 * Provides a unified interface (GraphDataAdapter) for graph editing,
 * enabling one GraphEditorCore to work with multiple data sources.
 */

export type {
  GraphDataAdapter,
  BlockLike,
  EdgeLike,
  InputPortLike,
  OutputPortLike,
} from './types';

export { PatchStoreAdapter } from './PatchStoreAdapter';
export { CompositeStoreAdapter } from './CompositeStoreAdapter';
