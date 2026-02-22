/**
 * DebugStore - MobX Store for Debug/Probe State
 *
 * Manages debug panel visibility and provides reactive access to
 * runtime values via the DebugService singleton.
 *
 * Responsibilities:
 * - Track debug panel enabled state (synced with settings)
 * - Track currently hovered edge for probing
 * - Provide reactive value lookups and polling cache
 * - Format values based on value type
 * - Report debug service health status
 */

import { makeAutoObservable, runInAction, reaction } from 'mobx';
import { debugService, type EdgeValueResult, type DebugServiceStatus } from '../services/DebugService';
import type { CanonicalType } from '../core/canonical-types';
import type { SettingsStore } from './SettingsStore';
import { debugSettings, type DebugSettings } from '../settings/tokens/debug-settings';

/** Poll interval for active-edge UI refresh (roughly frame-rate). */
const DEBUG_POLL_INTERVAL_MS = 16;

/**
 * Format a numeric value based on its value type.
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

  /** Whether cardinality solver trace is enabled */
  traceCardinalitySolver: boolean = false;

  /** Currently hovered edge ID (transient, from mouse enter/leave) */
  hoveredEdgeId: string | null = null;

  /** Edge ID whose lens chip is currently hovered (suppresses edge-level popover). */
  hoveredLensEdgeId: string | null = null;

  /** True while any port popover is open (suppresses edge-level popover). */
  portPopoverActive: boolean = false;

  /** One-shot suppression for edge-click pinning after transform-chip interactions. */
  private suppressNextEdgePopoverPin: boolean = false;

  /** Selected edge ID for persistent debug inspection (from SelectionStore) */
  selectedDebugEdgeId: string | null = null;

  /** Cached edge value result (updated via polling) */
  private _cachedEdgeValue: EdgeValueResult | null = null;

  /** The edge ID currently being tracked/polled (to detect changes) */
  private _currentlyTrackedEdgeId: string | null = null;

  /** Polling interval handle */
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  /** Settings sync disposal */
  private settingsSyncDisposer: (() => void) | null = null;

  constructor(settingsStore?: SettingsStore) {
    makeAutoObservable(this, {
      // status reads from non-observable debugService singleton — not a true computed
      status: false,
    });

    // Sync with settings if provided
    if (settingsStore) {
      this.setupSettingsSync(settingsStore);
    }

    debugService.setAutoTrackAllDebugData(this.enabled);
  }

  /**
   * The edge currently shown in the debug mini view.
   * Hover takes priority over selection.
   */
  get activeEdgeId(): string | null {
    return this.hoveredEdgeId ?? this.selectedDebugEdgeId;
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

    // Load initial values
    const values = settingsStore.get(debugSettings) as DebugSettings;
    this.enabled = values.enabled;
    this.traceCardinalitySolver = values.traceCardinalitySolver;

    // React to settings changes (settings panel → DebugStore)
    this.settingsSyncDisposer = reaction(
      () => {
        const s = settingsStore.get(debugSettings) as DebugSettings;
        return { enabled: s.enabled, traceCardinalitySolver: s.traceCardinalitySolver };
      },
      ({ enabled, traceCardinalitySolver }) => {
        if (this.enabled !== enabled) {
          this.enabled = enabled;
          debugService.setAutoTrackAllDebugData(enabled);
          if (!enabled) {
            this.stopPolling();
            this._currentlyTrackedEdgeId = null;
            this._cachedEdgeValue = null;
          }
        }
        if (this.traceCardinalitySolver !== traceCardinalitySolver) {
          this.traceCardinalitySolver = traceCardinalitySolver;
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
    debugService.setAutoTrackAllDebugData(this.enabled);
    if (!this.enabled) {
      this.stopPolling();
      this._currentlyTrackedEdgeId = null;
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
    debugService.setAutoTrackAllDebugData(enabled);
    this.updateSettingsEnabled();
    if (!enabled) {
      this.stopPolling();
      this._currentlyTrackedEdgeId = null;
      this._cachedEdgeValue = null;
    }
  }

  /**
   * Set the hovered edge ID for probing.
   * Hover takes priority over selection for the active edge.
   */
  setHoveredEdge(edgeId: string | null): void {
    this.hoveredEdgeId = edgeId;
    this.syncActiveEdge();
  }

  setHoveredLensEdge(edgeId: string | null): void {
    this.hoveredLensEdgeId = edgeId;
  }

  setPortPopoverActive(active: boolean): void {
    this.portPopoverActive = active;
  }

  markSuppressNextEdgePopoverPin(): void {
    this.suppressNextEdgePopoverPin = true;
  }

  consumeSuppressNextEdgePopoverPin(): boolean {
    const value = this.suppressNextEdgePopoverPin;
    this.suppressNextEdgePopoverPin = false;
    return value;
  }

  /**
   * Set the selected edge for persistent debug inspection.
   * Called by UI when SelectionStore.selectedEdgeId changes.
   */
  setSelectedDebugEdge(edgeId: string | null): void {
    this.selectedDebugEdgeId = edgeId;
    this.syncActiveEdge();
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
    return debugService.tryGetEdgeValue(edgeId);
  }

  /**
   * Query current value for a port by block ID and port name.
   * Returns undefined if port is not mapped or query fails.
   */
  getPortValue(blockId: string, portName: string): EdgeValueResult | undefined {
    if (!this.enabled) return undefined;
    return debugService.tryGetPortValue(blockId, portName);
  }

  /**
   * Format the cached edge value for display.
   */
  get formattedValue(): string | null {
    if (!this._cachedEdgeValue) return null;
    switch (this._cachedEdgeValue.kind) {
      case 'scalar':
        return formatDebugValue(this._cachedEdgeValue.value, this._cachedEdgeValue.type);
      case 'field':
        return `[${this._cachedEdgeValue.stats.count}] ${this._cachedEdgeValue.stats.mean[0].toFixed(2)}`;
      case 'field-untracked':
        return null;
      case 'constant':
        return `${this._cachedEdgeValue.value} (constant)`;
      default:
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
   * Synchronize field/history tracking and polling to match the current activeEdgeId.
   * Called whenever hoveredEdgeId or selectedDebugEdgeId changes.
   */
  private syncActiveEdge(): void {
    const newActiveId = this.activeEdgeId;

    // No change — nothing to do
    if (newActiveId === this._currentlyTrackedEdgeId) return;

    // Untrack previous (polling only; debug target tracking is owned by useDebugMiniView).
    // [LAW:single-enforcer] Avoid duplicate track/untrack ownership in DebugStore.
    this.stopPolling();
    this._currentlyTrackedEdgeId = newActiveId;

    // Track new
    if (newActiveId && this.enabled) {
      this.startPolling();
    } else {
      this._cachedEdgeValue = null;
    }
  }

  /**
   * Start polling for edge value updates.
   */
  private startPolling(): void {
    this.stopPolling();
    this.pollValue();
    this.pollInterval = setInterval(() => this.pollValue(), DEBUG_POLL_INTERVAL_MS);
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
    const edgeId = this._currentlyTrackedEdgeId;
    if (!edgeId || !this.enabled) {
      runInAction(() => {
        this._cachedEdgeValue = null;
      });
      return;
    }

    const result = debugService.tryGetEdgeValue(edgeId);
    runInAction(() => {
      this._cachedEdgeValue = result || null;
    });
  }

  /**
   * Cleanup resources.
   */
  dispose(): void {
    this.stopPolling();
    this._currentlyTrackedEdgeId = null;
    debugService.setAutoTrackAllDebugData(false);
    this.settingsSyncDisposer?.();
    this.settingsSyncDisposer = null;
  }
}
