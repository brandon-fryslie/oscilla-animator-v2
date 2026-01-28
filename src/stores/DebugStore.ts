/**
 * DebugStore - MobX Store for Debug/Probe State
 *
 * Manages debug panel visibility and provides reactive access to
 * runtime values via the DebugService singleton.
 *
 * Responsibilities:
 * - Track debug panel enabled state (synced with settings)
 * - Track currently hovered edge for probing
 * - Manage field tracking (demand-driven materialization)
 * - Provide reactive value lookups
 * - Format values based on signal type
 * - Report debug service health status
 */

import { makeAutoObservable, runInAction, reaction } from 'mobx';
import { debugService, type EdgeValueResult, type DebugServiceStatus } from '../services/DebugService';
import type { CanonicalType } from '../core/canonical-types';
import type { ValueSlot } from '../types';
import type { DebugTargetKey } from '../ui/debug-viz/types';
import type { SettingsStore } from './SettingsStore';
import { debugSettings, type DebugSettings } from '../settings/tokens/debug-settings';

/**
 * Format a numeric value based on its signal type.
 */
export function formatDebugValue(value: number, type: CanonicalType): string {
  const payload = type.payload;

  switch (payload.kind) {
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

  /** Currently tracked field slot (for cleanup on unhover) */
  private _trackedFieldSlot: ValueSlot | null = null;

  /** Currently tracked history key (for signal micro-history) */
  private _trackedHistoryKey: DebugTargetKey | null = null;

  /** Polling interval handle */
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  /** Settings sync disposal */
  private settingsSyncDisposer: (() => void) | null = null;

  constructor(settingsStore?: SettingsStore) {
    makeAutoObservable(this, {
      // Don't make poll interval observable
      // status reads from non-observable debugService, so exclude from computed
      status: false,
    });

    // Sync with settings if provided
    if (settingsStore) {
      this.setupSettingsSync(settingsStore);
    }
  }

  /** Reference to settings store for two-way sync */
  private settingsStore: SettingsStore | null = null;

  /**
   * Set up two-way sync with settings.
   * - Load initial value from settings
   * - React to settings changes → update DebugStore
   * - DebugStore toggles → update settings (via updateSettingsEnabled)
   */
  private setupSettingsSync(settingsStore: SettingsStore): void {
    this.settingsStore = settingsStore;

    // Register settings token
    settingsStore.register(debugSettings);

    // Load initial value
    const values = settingsStore.get(debugSettings) as DebugSettings;
    this.enabled = values.enabled;

    // React to settings changes (settings panel → DebugStore)
    this.settingsSyncDisposer = reaction(
      () => (settingsStore.get(debugSettings) as DebugSettings).enabled,
      (enabled: boolean) => {
        if (this.enabled !== enabled) {
          this.enabled = enabled;
          if (!enabled) {
            this.stopPolling();
            this.untrackCurrentField();
            this._cachedEdgeValue = null;
          }
        }
      }
    );
  }

  /**
   * Writes current enabled state back to settings store.
   * Called when debug is toggled via UI controls (not via settings panel).
   */
  private updateSettingsEnabled(): void {
    if (this.settingsStore) {
      this.settingsStore.update(debugSettings, { enabled: this.enabled });
    }
  }

  /**
   * Toggle debug panel enabled state.
   * Syncs back to settings for persistence.
   */
  toggleEnabled(): void {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopPolling();
      this.untrackCurrentField();
      this._cachedEdgeValue = null;
    }
    this.updateSettingsEnabled();
  }

  /**
   * Set debug panel enabled state.
   * Syncs back to settings for persistence.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.updateSettingsEnabled();
    if (!enabled) {
      this.stopPolling();
      this.untrackCurrentField();
      this._cachedEdgeValue = null;
    }
  }

  /**
   * Set the hovered edge ID for probing.
   * If edge is a field, automatically tracks it for demand-driven materialization.
   */
  setHoveredEdge(edgeId: string | null): void {
    // Untrack previous if switching edges
    if (this.hoveredEdgeId !== edgeId) {
      this.untrackCurrentField();
      this.untrackCurrentHistory();
    }

    this.hoveredEdgeId = edgeId;

    if (edgeId && this.enabled) {
      const meta = debugService.getEdgeMetadata(edgeId);
      if (meta?.cardinality === 'field') {
        // Field edge: track for demand-driven materialization
        debugService.trackField(meta.slotId);
        this._trackedFieldSlot = meta.slotId;
      } else if (meta?.cardinality === 'signal') {
        // Signal edge: track in HistoryService for micro-history
        const key: DebugTargetKey = { kind: 'edge', edgeId };
        debugService.historyService.track(key);
        this._trackedHistoryKey = key;
      }
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
   * Returns undefined if edge is not mapped or query fails.
   */
  getEdgeValue(edgeId: string): EdgeValueResult | undefined {
    if (!this.enabled) return undefined;
    try {
      return debugService.getEdgeValue(edgeId);
    } catch (err) {
      // Log but don't crash - hover shouldn't bring down the app
      // TODO: Route this through a proper diagnostics channel once available
      console.warn(`[DebugStore.getEdgeValue] Failed for edge '${edgeId}':`, err instanceof Error ? err.message : err);
      return undefined;
    }
  }

  /**
   * Query current value for a port by block ID and port name.
   * Returns undefined if port is not mapped or query fails.
   */
  getPortValue(blockId: string, portName: string): EdgeValueResult | undefined {
    if (!this.enabled) return undefined;
    try {
      return debugService.getPortValue(blockId, portName);
    } catch (err) {
      // Log but don't crash - hover shouldn't bring down the app
      // TODO: Route this through a proper diagnostics channel once available
      console.warn(`[DebugStore.getPortValue] Failed for port '${blockId}:${portName}':`, err instanceof Error ? err.message : err);
      return undefined;
    }
  }

  /**
   * Format the cached edge value for display.
   */
  get formattedValue(): string | null {
    if (!this._cachedEdgeValue) return null;
    switch (this._cachedEdgeValue.kind) {
      case 'signal':
        return formatDebugValue(this._cachedEdgeValue.value, this._cachedEdgeValue.type);
      case 'field':
        return `[${this._cachedEdgeValue.count}] ${this._cachedEdgeValue.mean.toFixed(2)}`;
      case 'field-untracked':
        return null;
    }
  }

  /**
   * Get debug service health status.
   */
  get status(): DebugServiceStatus {
    return debugService.getStatus();
  }

  /**
   * Start polling for edge value updates (1Hz).
   */
  private startPolling(): void {
    this.stopPolling();
    this.pollValue();
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

    try {
      const result = debugService.getEdgeValue(this.hoveredEdgeId);
      runInAction(() => {
        this._cachedEdgeValue = result || null;
      });
    } catch (err) {
      // Log but don't crash - polling shouldn't bring down the app
      // Note: This fires at 1Hz while hovered, so use console.debug to reduce noise
      console.debug(`[DebugStore.pollValue] Failed for edge '${this.hoveredEdgeId}':`, err instanceof Error ? err.message : err);
      runInAction(() => {
        this._cachedEdgeValue = null;
      });
    }
  }

  /**
   * Untrack the currently tracked field slot.
   */
  private untrackCurrentField(): void {
    if (this._trackedFieldSlot !== null) {
      debugService.untrackField(this._trackedFieldSlot);
      this._trackedFieldSlot = null;
    }
  }

  /**
   * Untrack the currently tracked history key.
   */
  private untrackCurrentHistory(): void {
    if (this._trackedHistoryKey !== null) {
      debugService.historyService.untrack(this._trackedHistoryKey);
      this._trackedHistoryKey = null;
    }
  }

  /**
   * Cleanup resources.
   */
  dispose(): void {
    this.stopPolling();
    this.untrackCurrentField();
    this.untrackCurrentHistory();
    this.settingsSyncDisposer?.();
    this.settingsSyncDisposer = null;
  }
}
