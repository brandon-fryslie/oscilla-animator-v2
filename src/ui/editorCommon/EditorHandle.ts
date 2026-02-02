/**
 * EditorHandle - Generic Interface for Editor Implementations
 *
 * Provides a common abstraction over node editor libraries
 * allowing the UI to interact with the editor through a consistent API.
 */

import type { BlockId } from '../../types';

export interface AddBlockOptions {
  displayName?: string;
  position?: { x: number; y: number };
}

export interface EditorHandle {
  readonly type: string;
  /**
   * Create a block in the appropriate store and position it in the editor.
   * This is the single authority for block creation from the UI.
   * Returns the ID of the newly created block.
   */
  addBlock(blockType: string, options?: AddBlockOptions): Promise<string>;
  removeBlock(blockId: BlockId): Promise<void>;
  zoomToFit(): Promise<void>;
  autoArrange?(): Promise<void>;
  getRawHandle(): unknown;
}
