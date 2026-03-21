/**
 * PortHighlightStore - Port Hover & Compatibility State
 *
 * Tracks which port is currently hovered and computes which ports are compatible.
 * Used to highlight compatible ports when hovering over a port.
 *
 * Architectural invariants:
 * - Only stores hover state (not connection data)
 * - Derives compatibility via type validation
 * - No data duplication
 */

import { makeObservable, observable, computed, action } from 'mobx';
import type { BlockId, PortId, PortEndpointRef } from '../types';
import type { PatchStore } from './PatchStore';
import type { FrontendResultStore } from './FrontendResultStore';
import { getHoverCompatiblePortsForPort } from '../ui/authoring/semanticQueries';

export class PortHighlightStore {
  // Observable state - hover tracking only
  hoveredPort: PortEndpointRef & { direction: 'input' | 'output' } | null = null;

  constructor(
    private patchStore: PatchStore,
    private readonly frontendStore: FrontendResultStore,
  ) {
    makeObservable(this, {
      hoveredPort: observable,
      compatiblePorts: computed,
      setHoveredPort: action.bound,
      clearHoveredPort: action.bound,
      isPortCompatible: action.bound,
      isPortHighlighted: action.bound,
    });
  }

  // =============================================================================
  // Computed Getters
  // =============================================================================

  /**
   * Returns a set of compatible port references.
   * When an OUTPUT port is hovered, returns compatible INPUT ports.
   * When an INPUT port is hovered, returns compatible OUTPUT ports.
   */
  get compatiblePorts(): ReadonlySet<string> {
    if (!this.hoveredPort) return new Set();

    const patch = this.patchStore.patch;
    if (!patch) return new Set();

    const { blockId: hoveredBlockId, portId: hoveredPortId, direction: hoveredDirection } = this.hoveredPort;
    const compatible = getHoverCompatiblePortsForPort(
      patch,
      this.frontendStore,
      hoveredBlockId,
      hoveredPortId,
      hoveredDirection === 'input',
    );
    return new Set(compatible.map((port) => `${port.blockId}:${port.portId}`));
  }

  // =============================================================================
  // Actions
  // =============================================================================

  /**
   * Sets the hovered port.
   */
  setHoveredPort(blockId: BlockId, portId: PortId, direction: 'input' | 'output'): void {
    this.hoveredPort = { blockId, portId, direction };
  }

  /**
   * Clears the hovered port.
   */
  clearHoveredPort(): void {
    this.hoveredPort = null;
  }

  /**
   * Check if a port is compatible with the currently hovered port.
   */
  isPortCompatible(blockId: BlockId, portId: PortId): boolean {
    const key = `${blockId}:${portId}`;
    return this.compatiblePorts.has(key);
  }

  /**
   * Check if a port should be highlighted (compatible or hovered).
   */
  isPortHighlighted(blockId: BlockId, portId: PortId): boolean {
    // Hovered port itself
    if (this.hoveredPort?.blockId === blockId && this.hoveredPort?.portId === portId) {
      return true;
    }

    // Compatible port
    return this.isPortCompatible(blockId, portId);
  }
}
