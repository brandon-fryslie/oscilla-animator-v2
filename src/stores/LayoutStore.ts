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

  /**
   * Monotonic counter bumped on every position mutation. Layout is UI state the
   * undo history must track, but it lives here rather than in the patch — so this
   * counter is the cheap observable the history change-token folds in, letting a
   * drag-end be one checkpoint without deep-observing the map. [LAW:one-source-of-truth]
   */
  revision = 0;

  constructor() {
    makeObservable(this, {
      positions: observable,
      revision: observable,
      setPosition: action,
      setPositions: action,
      removePosition: action,
      pruneOrphans: action,
      clear: action,
    });
  }

  /**
   * Sets position for a single node. Bumps `revision` only on a real coordinate
   * change, so a re-set to the same spot mints no spurious undo checkpoint.
   * [LAW:dataflow-not-control-flow]
   */
  setPosition(blockId: BlockId, pos: NodePosition): void {
    const prev = this.positions.get(blockId);
    if (prev && prev.x === pos.x && prev.y === pos.y) return;
    this.positions.set(blockId, pos);
    this.revision++;
  }

  /**
   * Bulk-sets positions (e.g., after ELK layout). Bumps `revision` once iff at least
   * one coordinate actually changed. [LAW:dataflow-not-control-flow]
   */
  setPositions(map: ReadonlyMap<BlockId, NodePosition>): void {
    let changed = false;
    for (const [id, pos] of map) {
      const prev = this.positions.get(id);
      if (prev && prev.x === pos.x && prev.y === pos.y) continue;
      this.positions.set(id, pos);
      changed = true;
    }
    if (changed) this.revision++;
  }

  /**
   * Gets stored position for a node, or undefined if none.
   */
  getPosition(blockId: BlockId): NodePosition | undefined {
    return this.positions.get(blockId);
  }

  /**
   * Removes position for a deleted node. Bumps `revision` only if a position existed.
   * [LAW:dataflow-not-control-flow]
   */
  removePosition(blockId: BlockId): void {
    if (this.positions.delete(blockId)) this.revision++;
  }

  /**
   * Remove positions for blocks no longer in the graph.
   * Call after block removal to prevent unbounded growth. Bumps `revision` only if
   * an orphan was actually removed. [LAW:dataflow-not-control-flow]
   */
  pruneOrphans(activeBlockIds: ReadonlySet<BlockId>): void {
    let changed = false;
    for (const id of this.positions.keys()) {
      if (!activeBlockIds.has(id)) {
        this.positions.delete(id);
        changed = true;
      }
    }
    if (changed) this.revision++;
  }

  /**
   * Clears all stored positions (e.g., on patch load). Bumps `revision` only if there
   * was anything to clear. [LAW:dataflow-not-control-flow]
   */
  clear(): void {
    if (this.positions.size === 0) return;
    this.positions.clear();
    this.revision++;
  }
}
