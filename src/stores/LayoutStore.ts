/**
 * LayoutStore - Node Position Persistence
 *
 * Owns node positions for the graph editor. Positions are UI state,
 * NOT graph topology (which belongs to PatchStore).
 *
 * Positions survive patch mutations (add/remove edges/blocks) and
 * are only reset by explicit user action (Auto Arrange button) or
 * when a new patch is loaded.
 */

import { makeObservable, observable, action } from 'mobx';
import type { BlockId } from '../types';

export interface NodePosition {
  readonly x: number;
  readonly y: number;
}

export class LayoutStore {
  positions: Map<BlockId, NodePosition> = new Map();

  constructor() {
    makeObservable(this, {
      positions: observable,
      setPosition: action,
      setPositions: action,
      removePosition: action,
      clear: action,
    });
  }

  /**
   * Sets position for a single node.
   */
  setPosition(blockId: BlockId, pos: NodePosition): void {
    this.positions.set(blockId, pos);
  }

  /**
   * Bulk-sets positions (e.g., after ELK layout).
   */
  setPositions(map: ReadonlyMap<BlockId, NodePosition>): void {
    for (const [id, pos] of map) {
      this.positions.set(id, pos);
    }
  }

  /**
   * Gets stored position for a node, or undefined if none.
   */
  getPosition(blockId: BlockId): NodePosition | undefined {
    return this.positions.get(blockId);
  }

  /**
   * Removes position for a deleted node.
   */
  removePosition(blockId: BlockId): void {
    this.positions.delete(blockId);
  }

  /**
   * Clears all stored positions (e.g., on patch load).
   */
  clear(): void {
    this.positions.clear();
  }
}
