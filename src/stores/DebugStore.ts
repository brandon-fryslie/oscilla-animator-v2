/**
 * DebugStore - MobX Store for Debug/Probe State
 *
 * Manages debug panel visibility and provides reactive access to
 * runtime values via the DebugService singleton.
 *
 * Responsibilities:
 * - Track debug panel enabled state
 * - Track currently hovered edge for probing
 * - Provide reactive value lookups
 * - Format values based on signal type
 * - Report debug service health status
 */

import { makeAutoObservable, runInAction } from 'mobx';
import { debugService, type EdgeValueResult, type DebugServiceStatus } from '../services/DebugService';
import type { SignalType } from '../core/canonical-types';

/**
 * Format a numeric value based on its signal type.
 */
export function formatDebugValue(value: number, type: SignalType): string {
  const payload = type.payload;

  switch (payload) {
    case 'color':
      // Color is packed RGB, display as hex
      return `#${Math.floor(value).toString(16).padStart(6, '0')}`;

    case 'float':
    case 'int':
      // Numeric values, show 2 decimal places
      return value.toFixed(2);

    default:
      // Unknown type, show raw value
      return value.toFixed(3);
  }
}

export class DebugStore {
  /** Whether debug panel/probing is enabled */
  enabled: boolean = true;

  /** Currently hovered edge ID for probing */
  hoveredEdgeId: string | null = null;

  /** Cached edge value result (updated via polling) */
  private _cachedEdgeValue: EdgeValueResult | null = null;

  /** Polling interval handle */
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    makeAutoObservable(this, {
      // Don't make poll interval observable
    });
  }

  /**
   * Toggle debug panel enabled state.
   */
  toggleEnabled(): void {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopPolling();
      this._cachedEdgeValue = null;
    }
  }

  /**
   * Set debug panel enabled state.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopPolling();
      this._cachedEdgeValue = null;
    }
  }

  /**
   * Set the hovered edge ID for probing.
   * Starts polling for value updates.
   */
  setHoveredEdge(edgeId: string | null): void {
    this.hoveredEdgeId = edgeId;

    if (edgeId && this.enabled) {
      this.startPolling();
    } else {
      this.stopPolling();
      this._cachedEdgeValue = null;
    }
  }

  /**
   * Get the current edge value (cached, updated via polling).
   */
  get edgeValue(): EdgeValueResult | null {
    return this._cachedEdgeValue;
  }

  /**
   * Query current value for an edge by ID.
   * Direct query without caching - useful for one-off lookups.
   */
  getEdgeValue(edgeId: string): EdgeValueResult | undefined {
    if (!this.enabled) return undefined;
    return debugService.getEdgeValue(edgeId);
  }

  /**
   * Query current value for a port by block ID and port name.
   * Useful for querying unconnected output ports.
   */
  getPortValue(blockId: string, portName: string): EdgeValueResult | undefined {
    if (!this.enabled) return undefined;
    return debugService.getPortValue(blockId, portName);
  }

  /**
   * Format the cached edge value for display.
   */
  get formattedValue(): string | null {
    if (!this._cachedEdgeValue) return null;
    return formatDebugValue(this._cachedEdgeValue.value, this._cachedEdgeValue.type);
  }

  /**
   * Get debug service health status.
   * Used by UI to display mapping errors.
   */
  get status(): DebugServiceStatus {
    return debugService.getStatus();
  }

  /**
   * Start polling for edge value updates (1Hz).
   */
  private startPolling(): void {
    this.stopPolling();

    // Query immediately
    this.pollValue();

    // Set up 1Hz polling
    this.pollInterval = setInterval(() => this.pollValue(), 1000);
  }

  /**
   * Stop polling for edge value updates.
   */
  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Poll current value from debug service.
   */
  private pollValue(): void {
    if (!this.hoveredEdgeId || !this.enabled) {
      runInAction(() => {
        this._cachedEdgeValue = null;
      });
      return;
    }

    const result = debugService.getEdgeValue(this.hoveredEdgeId);
    runInAction(() => {
      this._cachedEdgeValue = result || null;
    });
  }

  /**
   * Cleanup resources.
   */
  dispose(): void {
    this.stopPolling();
  }
}
