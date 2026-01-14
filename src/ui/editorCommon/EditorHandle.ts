/**
 * EditorHandle - Generic Interface for Editor Implementations
 *
 * Provides a common abstraction over different node editor libraries
 * (Rete.js, ReactFlow, etc.) allowing the UI to interact with any
 * editor implementation through a consistent API.
 */

import type { BlockId } from '../../types';

export interface EditorHandle {
  readonly type: 'rete' | 'reactflow';
  addBlock(blockId: BlockId, blockType: string): Promise<void>;
  removeBlock(blockId: BlockId): Promise<void>;
  zoomToFit(): Promise<void>;
  autoArrange?(): Promise<void>;
  getRawHandle(): unknown;
}
