/**
 * EditorHandle - Generic Interface for Editor Implementations
 *
 * Provides a common abstraction over node editor libraries
 * allowing the UI to interact with the editor through a consistent API.
 */

import type { BlockId } from '../../types';

export interface EditorHandle {
  readonly type: 'reactflow';
  addBlock(blockId: BlockId, blockType: string): Promise<void>;
  removeBlock(blockId: BlockId): Promise<void>;
  zoomToFit(): Promise<void>;
  autoArrange?(): Promise<void>;
  getRawHandle(): unknown;
}
