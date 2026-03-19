/**
 * ExpressionEditorStore - Active context for the Expression Editor panel.
 *
 * Keeps one source of truth for which Expression block is currently being
 * edited in the docked workbench panel.
 */

import { makeAutoObservable } from 'mobx';
import type { BlockId } from '../types';

interface ExpressionDraftState {
  draftValue: string;
  persistedValue: string;
}

export class ExpressionEditorStore {
  activeBlockId: BlockId | null = null;
  private readonly drafts = new Map<BlockId, ExpressionDraftState>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  openForBlock(blockId: BlockId): void {
    this.activeBlockId = blockId;
  }

  clearActiveBlock(): void {
    this.activeBlockId = null;
  }

  getDraftValue(blockId: BlockId, persistedValue: string): string {
    return this.drafts.get(blockId)?.draftValue ?? persistedValue;
  }

  getPersistedValue(blockId: BlockId, persistedValue: string): string {
    return this.drafts.get(blockId)?.persistedValue ?? persistedValue;
  }

  syncPersistedValue(blockId: BlockId, persistedValue: string): void {
    const existing = this.drafts.get(blockId);
    if (!existing) {
      this.drafts.set(blockId, { draftValue: persistedValue, persistedValue });
      return;
    }

    const isClean = existing.draftValue === existing.persistedValue;
    existing.persistedValue = persistedValue;
    if (isClean) {
      existing.draftValue = persistedValue;
    }
  }

  setDraftValue(blockId: BlockId, draftValue: string): void {
    const existing = this.drafts.get(blockId);
    if (existing) {
      existing.draftValue = draftValue;
      return;
    }
    this.drafts.set(blockId, { draftValue, persistedValue: draftValue });
  }

  commitDraftValue(blockId: BlockId, persistedValue: string): void {
    this.drafts.set(blockId, { draftValue: persistedValue, persistedValue });
  }
}
