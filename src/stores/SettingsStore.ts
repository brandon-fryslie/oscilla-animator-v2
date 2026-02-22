/**
 * SettingsStore - MobX Store for Application Settings
 *
 * Central registry for all settings tokens with:
 * - Typed, scoped access via tokens
 * - Auto-persistence to localStorage (debounced)
 * - Schema validation on load (missing keys get defaults, extra keys dropped)
 * - Idempotent registration
 *
 * Architecture:
 * - Single source of truth for all settings values
 * - Features register their tokens on first use
 * - Settings persist per-namespace to localStorage
 * - One-way dependency: features depend on SettingsStore, not reverse
 */

import { makeAutoObservable, reaction, observable } from 'mobx';
import type { SettingsToken } from '../settings/types';
import {
  resolveLocalStorageCapability,
  type LocalStorageCapability,
} from '../services/local-storage-capability';

const STORAGE_PREFIX = 'oscilla-v2-settings:';
const PERSIST_DEBOUNCE_MS = 500;

export type SettingsStoreIssueLevel = 'warn' | 'error';

export interface SettingsStoreIssue {
  readonly level: SettingsStoreIssueLevel;
  readonly message: string;
  readonly namespace?: string;
  readonly detail?: unknown;
}

export class SettingsStore {
  /**
   * Registry of all settings tokens by namespace.
   * Map<namespace, token>
   */
  private tokens = new Map<string, SettingsToken<any>>();

  /**
   * Current settings values by namespace.
   * Map<namespace, observable values object>
   */
  private values = new Map<string, Record<string, unknown>>();

  /**
   * Disposers for auto-persist reactions, one per namespace.
   */
  private persistDisposers = new Map<string, () => void>();
  private readonly storage: LocalStorageCapability | null;
  lastIssue: SettingsStoreIssue | null = null;
  private readonly issueReporter?: (issue: SettingsStoreIssue) => void;

  constructor(issueReporter?: (issue: SettingsStoreIssue) => void) {
    this.issueReporter = issueReporter;
    this.storage = resolveLocalStorageCapability();
    makeAutoObservable<SettingsStore, 'persistDisposers' | 'storage'>(this, {
      // tokens must be observable so getRegisteredTokens() triggers re-renders
      persistDisposers: false,
      storage: false,
    });
  }

  /**
   * Registers a settings token.
   * Idempotent - calling multiple times with the same token is safe.
   *
   * On first registration:
   * - Loads values from localStorage (or uses defaults)
   * - Validates schema (missing keys get defaults, extra keys dropped)
   * - Sets up auto-persist reaction
   *
   * @param token - Settings token to register
   */
  register<T extends Record<string, unknown>>(token: SettingsToken<T>): void {
    // Already registered - idempotent
    if (this.tokens.has(token.namespace)) {
      return;
    }

    // Register token
    this.tokens.set(token.namespace, token);

    // Load from localStorage, merged with defaults
    const loaded = this.loadFromStorage(token);
    const validated = this.validateSchema(loaded, token.defaults);

    // Store as observable
    this.values.set(token.namespace, observable(validated));

    // Set up auto-persist
    this.setupPersistence(token.namespace);
  }

  /**
   * Gets the current values for a token.
   * Returns an observable object that components can observe.
   *
   * @param token - Settings token
   * @returns Observable values object typed as T
   */
  get<T extends Record<string, unknown>>(token: SettingsToken<T>): T {
    const values = this.values.get(token.namespace);
    if (!values) {
      throw new Error(
        `Settings token '${token.namespace}' not registered. Call register() first.`
      );
    }
    return values as T;
  }

  /**
   * Updates settings values with a partial update.
   * Triggers auto-persist via MobX reaction.
   *
   * @param token - Settings token
   * @param partial - Partial values to update
   */
  update<T extends Record<string, unknown>>(
    token: SettingsToken<T>,
    partial: Partial<T>
  ): void {
    const values = this.values.get(token.namespace);
    if (!values) {
      throw new Error(
        `Settings token '${token.namespace}' not registered. Call register() first.`
      );
    }

    // Apply partial update
    Object.assign(values, partial);
  }

  /**
   * Resets settings to defaults.
   *
   * @param token - Settings token
   */
  reset<T extends Record<string, unknown>>(token: SettingsToken<T>): void {
    const values = this.values.get(token.namespace);
    if (!values) {
      throw new Error(
        `Settings token '${token.namespace}' not registered. Call register() first.`
      );
    }

    // Replace all values with defaults
    Object.keys(values).forEach((key) => delete values[key]);
    Object.assign(values, token.defaults);
  }

  /**
   * Gets all registered tokens (for UI rendering).
   * Returns array sorted by ui.order.
   */
  getRegisteredTokens(): Array<SettingsToken<any>> {
    return Array.from(this.tokens.values()).sort(
      (a, b) => a.ui.order - b.ui.order
    );
  }

  /**
   * Loads settings from localStorage for a namespace.
   * Returns merged defaults + stored values.
   * Returns defaults if localStorage is empty or corrupt.
   */
  private loadFromStorage<T extends Record<string, unknown>>(
    token: SettingsToken<T>
  ): Record<string, unknown> {
    if (!this.storage) {
      return { ...token.defaults };
    }
    try {
      const key = `${STORAGE_PREFIX}${token.namespace}`;
      const raw = this.storage.getItem(key);
      if (!raw) {
        return { ...token.defaults };
      }
      const stored = JSON.parse(raw);
      return { ...token.defaults, ...stored };
    } catch (err) {
      // Corrupt data - use defaults
      this.reportIssue(
        'warn',
        `Failed to load settings, using defaults`,
        token.namespace,
        err
      );
      return { ...token.defaults };
    }
  }

  /**
   * Validates loaded values against schema.
   * - Missing keys get defaults
   * - Extra keys are dropped
   * - Returns a clean object with only valid keys
   */
  private validateSchema<T extends Record<string, unknown>>(
    loaded: Record<string, unknown>,
    defaults: T
  ): Record<string, unknown> {
    const validated: Record<string, unknown> = {};

    // Copy only keys that exist in defaults
    for (const key of Object.keys(defaults)) {
      validated[key] = key in loaded ? loaded[key] : defaults[key];
    }

    return validated;
  }

  /**
   * Sets up auto-persist reaction for a namespace.
   * Debounced to 500ms to avoid thrashing localStorage on rapid changes.
   */
  private setupPersistence(namespace: string): void {
    const disposer = reaction(
      () => {
        const values = this.values.get(namespace);
        return values ? JSON.stringify(values) : null;
      },
      (serialized) => {
        if (!serialized || !this.storage) return;

        try {
          const key = `${STORAGE_PREFIX}${namespace}`;
          this.storage.setItem(key, serialized);
        } catch (err) {
          this.reportIssue('warn', 'Failed to persist settings', namespace, err);
        }
      },
      { delay: PERSIST_DEBOUNCE_MS }
    );

    this.persistDisposers.set(namespace, disposer);
  }

  /**
   * Disposes all persistence reactions.
   * Should be called when store is no longer needed.
   */
  dispose(): void {
    this.persistDisposers.forEach((disposer) => disposer());
    this.persistDisposers.clear();
  }

  private reportIssue(
    level: SettingsStoreIssueLevel,
    message: string,
    namespace?: string,
    detail?: unknown
  ): void {
    const issue: SettingsStoreIssue = { level, message, namespace, detail };
    this.lastIssue = issue;
    this.issueReporter?.(issue);
  }
}
