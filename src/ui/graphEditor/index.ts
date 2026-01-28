/**
 * Graph Editor System
 *
 * Provides:
 * - GraphEditorCore: Reusable ReactFlow-based editor component
 * - UnifiedNode: Shared node rendering component
 * - GraphDataAdapter: Unified interface for graph editing
 * - PatchStoreAdapter & CompositeStoreAdapter: Data layer implementations
 */

export { GraphEditorCore, GraphEditorCoreInner, type GraphEditorCoreProps, type GraphEditorCoreHandle, type GraphEditorFeatures } from './GraphEditorCore';
export { UnifiedNode } from './UnifiedNode';
export { GraphEditorProvider, useGraphEditor, type GraphEditorContextValue } from './GraphEditorContext';
export { PatchStoreAdapter } from './PatchStoreAdapter';
export { CompositeStoreAdapter } from './CompositeStoreAdapter';
export type { GraphDataAdapter, BlockLike, EdgeLike, InputPortLike, OutputPortLike } from './types';
export { reconcileNodesFromAdapter, createNodeFromBlockLike, createEdgeFromEdgeLike, type UnifiedNodeData, type PortData, type ParamData } from './nodeDataTransform';
