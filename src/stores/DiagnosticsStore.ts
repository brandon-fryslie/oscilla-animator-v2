/**
 * DiagnosticsStore - MobX Wrapper for DiagnosticHub
 *
 * Provides reactive access to diagnostics via MobX computed properties.
 * Wraps DiagnosticHub and exposes its query methods as observables.
 *
 * Architecture:
 * - DiagnosticHub: Core state manager (subscribes to events)
 * - DiagnosticsStore: MobX wrapper (reactive UI layer)
 */

import { makeObservable, computed, action, observable } from 'mobx';
import type { DiagnosticHub } from '../diagnostics/DiagnosticHub';
import type { Diagnostic, DiagnosticFilter } from '../diagnostics/types';

// =============================================================================
// Log Types
// =============================================================================

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: number;
  data?: unknown;
}

// =============================================================================
// DiagnosticsStore Class
// =============================================================================

/**
 * DiagnosticsStore provides reactive access to diagnostics.
 *
 * Usage:
 * ```typescript
 * const store = new DiagnosticsStore(hub);
 *
 * // Reactive access (triggers re-render when diagnostics change)
 * const diagnostics = store.activeDiagnostics;
 * const errors = store.errors;
 *
 * // Filter diagnostics
 * const compileErrors = store.filter({ domain: 'compile', severity: 'error' });
 * ```
 */
export class DiagnosticsStore {
  // =============================================================================
  // Private State
  // =============================================================================

  private hub: DiagnosticHub | null = null;

  // Observable revision counter for MobX reactivity
  // This is incremented via a callback from DiagnosticHub
  private _revision: number = 0;

  // Log entries
  private _logs: LogEntry[] = [];
  private _nextId = 0;

  // =============================================================================
  // Constructor
  // =============================================================================

  constructor(hub?: DiagnosticHub) {
    this.hub = hub || null;

    makeObservable<
      DiagnosticsStore,
      '_revision' | '_logs' | 'incrementRevision'
    >(this, {
      // Observable revision counter
      _revision: observable,
      incrementRevision: action,

      // DiagnosticHub API
      revision: computed,
      activeDiagnostics: computed,
      errorCount: computed,
      warningCount: computed,
      hasErrors: computed,

      // Log API
      _logs: observable,
      logs: computed,
      log: action,
      clearLogs: action,
    });
  }

  /**
   * Increments the revision counter.
   * Called by DiagnosticHub when diagnostics change.
   */
  incrementRevision(): void {
    this._revision++;
    console.log('[DiagnosticsStore] Revision incremented to:', this._revision);
  }

  // =============================================================================
  // New API (DiagnosticHub Integration)
  // =============================================================================

  /**
   * Diagnostics revision number.
   * Increments whenever the diagnostic set changes.
   * MobX tracks this to trigger UI updates.
   */
  get revision(): number {
    return this._revision;
  }

  /**
   * Returns all active diagnostics.
   * Active = union of compile + authoring + runtime for active revision.
   */
  get activeDiagnostics(): Diagnostic[] {
    if (!this.hub) return [];
    // Force dependency on revision to trigger updates
    this.revision;
    return this.hub.getActive();
  }

  /**
   * Returns diagnostics for a specific patch revision.
   */
  getByRevision(patchRevision: number): Diagnostic[] {
    if (!this.hub) return [];
    return this.hub.getByRevision(patchRevision);
  }

  /**
   * Returns compile diagnostics for a specific revision.
   */
  getCompileSnapshot(patchRevision: number): Diagnostic[] {
    if (!this.hub) return [];
    return this.hub.getCompileSnapshot(patchRevision);
  }

  /**
   * Returns authoring diagnostics (current).
   */
  getAuthoringSnapshot(): Diagnostic[] {
    if (!this.hub) return [];
    return this.hub.getAuthoringSnapshot();
  }

  /**
   * Returns runtime diagnostics (current session).
   */
  getRuntimeDiagnostics(): Diagnostic[] {
    if (!this.hub) return [];
    return this.hub.getRuntimeDiagnostics();
  }

  /**
   * Filters diagnostics by criteria.
   */
  filter(filter: DiagnosticFilter): Diagnostic[] {
    if (!this.hub) return [];
    // Force dependency on revision to trigger updates
    this.revision;
    const active = this.hub.getActive();
    return this.hub.filter(active, filter);
  }

  /**
   * Returns all errors (severity: 'error' or 'fatal').
   */
  get errors(): Diagnostic[] {
    return this.filter({ severity: ['error', 'fatal'] });
  }

  /**
   * Returns all warnings (severity: 'warn').
   */
  get warnings(): Diagnostic[] {
    return this.filter({ severity: 'warn' });
  }

  /**
   * Returns number of errors.
   */
  get errorCount(): number {
    return this.errors.length;
  }

  /**
   * Returns number of warnings.
   */
  get warningCount(): number {
    return this.warnings.length;
  }

  /**
   * Returns true if there are any errors.
   */
  get hasErrors(): boolean {
    return this.errorCount > 0;
  }

  // =============================================================================
  // Log API
  // =============================================================================

  /**
   * Log entries.
   */
  get logs(): readonly LogEntry[] {
    return this._logs;
  }

  /**
   * Adds a log entry.
   */
  log(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
    this._logs.push({
      ...entry,
      id: `log-${this._nextId++}`,
      timestamp: Date.now(),
    });
  }

  /**
   * Clears log entries.
   */
  clearLogs(): void {
    this._logs = [];
  }
}
