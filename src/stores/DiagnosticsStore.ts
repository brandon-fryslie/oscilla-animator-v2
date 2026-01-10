/**
 * DiagnosticsStore - Errors, Warnings, Logs
 *
 * Stores transient diagnostic information.
 * Independent of other stores - no dependencies.
 */

import { makeObservable, observable, computed, action } from 'mobx';
import type { BlockId } from '../types';

export interface Diagnostic {
  id: string;
  message: string;
  source?: string;
  blockId?: BlockId;
  timestamp: number;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: number;
  data?: unknown;
}

export class DiagnosticsStore {
  // Observable state
  private _errors: Diagnostic[] = [];
  private _warnings: Diagnostic[] = [];
  private _logs: LogEntry[] = [];
  private _nextId = 0;

  constructor() {
    makeObservable<DiagnosticsStore, '_errors' | '_warnings' | '_logs'>(this, {
      _errors: observable,
      _warnings: observable,
      _logs: observable,
      errors: computed,
      warnings: computed,
      logs: computed,
      hasErrors: computed,
      errorCount: computed,
      warningCount: computed,
      addError: action,
      addWarning: action,
      log: action,
      clearDiagnostics: action,
      clearLogs: action,
    });
  }

  // =============================================================================
  // Computed Getters
  // =============================================================================

  get errors(): readonly Diagnostic[] {
    return this._errors;
  }

  get warnings(): readonly Diagnostic[] {
    return this._warnings;
  }

  get logs(): readonly LogEntry[] {
    return this._logs;
  }

  get hasErrors(): boolean {
    return this._errors.length > 0;
  }

  get errorCount(): number {
    return this._errors.length;
  }

  get warningCount(): number {
    return this._warnings.length;
  }

  // =============================================================================
  // Actions
  // =============================================================================

  /**
   * Adds an error diagnostic.
   */
  addError(error: Omit<Diagnostic, 'id' | 'timestamp'>): void {
    this._errors.push({
      ...error,
      id: `error-${this._nextId++}`,
      timestamp: Date.now(),
    });
  }

  /**
   * Adds a warning diagnostic.
   */
  addWarning(warning: Omit<Diagnostic, 'id' | 'timestamp'>): void {
    this._warnings.push({
      ...warning,
      id: `warning-${this._nextId++}`,
      timestamp: Date.now(),
    });
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
   * Clears all errors and warnings.
   */
  clearDiagnostics(): void {
    this._errors = [];
    this._warnings = [];
  }

  /**
   * Clears all log entries.
   */
  clearLogs(): void {
    this._logs = [];
  }
}
