/**
 * ExpressionEditorStore - Active context for the Expression Editor panel.
 *
 * Keeps one source of truth for which Expression block is currently being
 * edited in the docked workbench panel.
 */

import { makeAutoObservable } from 'mobx';
import type { BlockId } from '../types';

export class ExpressionEditorStore {
  activeBlockId: BlockId | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  openForBlock(blockId: BlockId): void {
    this.activeBlockId = blockId;
  }

  clearActiveBlock(): void {
    this.activeBlockId = null;
  }
}
