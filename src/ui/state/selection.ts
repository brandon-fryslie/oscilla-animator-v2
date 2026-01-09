/**
 * Selection State Management
 *
 * Manages the current selection state for the UI.
 * Tracks selected blocks, edges, and ports.
 */

import type { BlockId } from '../../types';

/**
 * Selection type discriminated union.
 */
export type Selection =
  | { readonly kind: 'none' }
  | { readonly kind: 'block'; readonly blockId: BlockId }
  | { readonly kind: 'edge'; readonly edgeId: string }
  | { readonly kind: 'port'; readonly blockId: BlockId; readonly portId: string };

/**
 * Selection change callback.
 */
export type SelectionChangeCallback = (selection: Selection, previous: Selection) => void;

/**
 * Selection state manager.
 * Singleton managing the current UI selection.
 */
export class SelectionState {
  private static instance: SelectionState | null = null;

  private current: Selection = { kind: 'none' };
  private listeners: Set<SelectionChangeCallback> = new Set();

  private constructor() {}

  /**
   * Get singleton instance.
   */
  static getInstance(): SelectionState {
    if (!SelectionState.instance) {
      SelectionState.instance = new SelectionState();
    }
    return SelectionState.instance;
  }

  /**
   * Get current selection.
   */
  getSelection(): Selection {
    return this.current;
  }

  /**
   * Set selection to a block.
   */
  selectBlock(blockId: BlockId): void {
    this.setSelection({ kind: 'block', blockId });
  }

  /**
   * Set selection to an edge.
   */
  selectEdge(edgeId: string): void {
    this.setSelection({ kind: 'edge', edgeId });
  }

  /**
   * Set selection to a port.
   */
  selectPort(blockId: BlockId, portId: string): void {
    this.setSelection({ kind: 'port', blockId, portId });
  }

  /**
   * Clear selection.
   */
  clearSelection(): void {
    this.setSelection({ kind: 'none' });
  }

  /**
   * Set selection and notify listeners.
   */
  private setSelection(selection: Selection): void {
    if (this.selectionsEqual(this.current, selection)) {
      return; // No change
    }

    const previous = this.current;
    this.current = selection;

    // Notify all listeners
    for (const listener of this.listeners) {
      try {
        listener(this.current, previous);
      } catch (err) {
        console.error('Error in selection change listener:', err);
      }
    }
  }

  /**
   * Check if two selections are equal.
   */
  private selectionsEqual(a: Selection, b: Selection): boolean {
    if (a.kind !== b.kind) return false;

    switch (a.kind) {
      case 'none':
        return true;
      case 'block':
        return b.kind === 'block' && a.blockId === b.blockId;
      case 'edge':
        return b.kind === 'edge' && a.edgeId === b.edgeId;
      case 'port':
        return b.kind === 'port' && a.blockId === b.blockId && a.portId === b.portId;
      default:
        return false;
    }
  }

  /**
   * Subscribe to selection changes.
   * Returns an unsubscribe function.
   */
  subscribe(callback: SelectionChangeCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Check if a specific block is selected.
   */
  isBlockSelected(blockId: BlockId): boolean {
    return this.current.kind === 'block' && this.current.blockId === blockId;
  }

  /**
   * Check if a specific edge is selected.
   */
  isEdgeSelected(edgeId: string): boolean {
    return this.current.kind === 'edge' && this.current.edgeId === edgeId;
  }

  /**
   * Check if a specific port is selected.
   */
  isPortSelected(blockId: BlockId, portId: string): boolean {
    return this.current.kind === 'port' &&
           this.current.blockId === blockId &&
           this.current.portId === portId;
  }
}

/**
 * Get the global selection state instance.
 */
export function getSelectionState(): SelectionState {
  return SelectionState.getInstance();
}
